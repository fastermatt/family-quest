package main

import (
	"context"
	"crypto/subtle"
	"embed"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

//go:embed assets/*
var webAssets embed.FS

func (e *Engine) view() any {
	e.mu.Lock()
	defer e.mu.Unlock()
	apps := []map[string]any{}
	groups := map[string]float64{"game": 0, "school": 0, "other": 0}
	for _, a := range sortedApps(e.totals()) {
		r := e.rule(a.Executable)
		groups[r.Category] += a.Seconds
		remaining, limited := e.remaining(a.Executable)
		apps = append(apps, map[string]any{"executable": a.Executable, "label": r.Label, "category": r.Category, "seconds": a.Seconds, "remaining": remaining, "limited": limited})
	}
	claim := e.account.Claim
	parts := []string{}
	for len(claim) >= 4 {
		parts = append(parts, claim[:4])
		claim = claim[4:]
	}
	update, _ := os.ReadFile(filepath.Join(e.dir, "updates", "update-status.txt"))
	familyEnabled, familyAllowed, familyReason := e.familyState(time.Now())
	pin := e.pin
	if e.Ledger.Policy.ClientID != "" {
		pin = ""
	}
	return map[string]any{"syncConflicts": e.Ledger.SyncConflicts, "updateStatus": string(update), "countdown": e.countdown(time.Now()), "version": appVersion, "demo": e.demo, "childName": e.Ledger.Policy.ChildName, "linked": e.Ledger.Policy.ClientID != "", "claim": strings.Join(parts, "-"), "pin": pin, "day": e.Ledger.Day, "apps": apps, "groups": groups, "gaps": e.Ledger.Gaps, "current": e.Current, "lastUpload": e.LastSync, "lastPolicy": e.LastPolicy, "pending": len(e.Ledger.Outbox), "syncError": e.SyncError, "action": e.Action, "settings": e.Ledger.Policy.Settings, "familyEnabled": familyEnabled, "familyAllowed": familyAllowed, "familyReason": familyReason}
}
func (e *Engine) serve(cancel context.CancelFunc) (string, func(), error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, err
	}
	address := "http://" + listener.Addr().String()
	key := secret(32)
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
		if r.Host != listener.Addr().String() {
			http.Error(w, "Invalid host", 403)
			return
		}
		if r.URL.Path == "/" && r.URL.Query().Get("key") != "" {
			if subtle.ConstantTimeCompare([]byte(r.URL.Query().Get("key")), []byte(key)) != 1 {
				http.Error(w, "Invalid session", 403)
				return
			}
			http.SetCookie(w, &http.Cookie{Name: "cz_local", Value: key, HttpOnly: true, SameSite: http.SameSiteStrictMode, Path: "/"})
			http.Redirect(w, r, "/", 303)
			return
		}
		cookie, err := r.Cookie("cz_local")
		if err != nil || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(key)) != 1 {
			http.Error(w, "Open ChoreZap using its application shortcut.", 403)
			return
		}
		switch r.URL.Path {
		case "/api/state":
			if r.Method != "GET" {
				http.Error(w, "Method not allowed", 405)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(e.view())
		case "/api/exit":
			if r.Method != "POST" || r.Header.Get("Origin") != address {
				http.Error(w, "Invalid request", 403)
				return
			}
			w.WriteHeader(204)
			go cancel()
		default:
			if r.Method != "GET" {
				http.Error(w, "Method not allowed", 405)
				return
			}
			name := strings.TrimPrefix(r.URL.Path, "/")
			if name == "" {
				name = "index.html"
			}
			if name != "index.html" && name != "app.js" && name != "countdown.js" && name != "app.css" && name != "icon.png" {
				http.NotFound(w, r)
				return
			}
			data, err := webAssets.ReadFile("assets/" + name)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			types := map[string]string{"index.html": "text/html; charset=utf-8", "app.js": "text/javascript; charset=utf-8", "countdown.js": "text/javascript; charset=utf-8", "app.css": "text/css; charset=utf-8", "icon.png": "image/png"}
			w.Header().Set("Content-Type", types[name])
			_, _ = w.Write(data)
		}
	})
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			e.syncFailure(fmt.Errorf("Dashboard stopped: %w", err))
		}
	}()
	return address + "/?key=" + key, func() {
		ctx, stop := context.WithTimeout(context.Background(), time.Second)
		defer stop()
		_ = server.Shutdown(ctx)
	}, nil
}
