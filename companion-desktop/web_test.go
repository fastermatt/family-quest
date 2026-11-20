package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalDashboardRequiresSessionAndSameOriginExit(t *testing.T) {
	e := testEngine(t)
	address, stop, err := e.serve(func() {})
	if err != nil {
		t.Fatal(err)
	}
	defer stop()
	parsed, _ := url.Parse(address)
	base := parsed.Scheme + "://" + parsed.Host
	r, err := http.Get(base + "/api/state")
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 403 {
		t.Fatal(r.StatusCode)
	}
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	r, err = client.Get(address)
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatal(r.StatusCode)
	}
	r, err = client.Get(base + "/api/state")
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatal(r.StatusCode)
	}
	asset, assetErr := client.Get(base + "/countdown.js")
	if assetErr != nil {
		t.Fatal(assetErr)
	}
	script, _ := io.ReadAll(asset.Body)
	asset.Body.Close()
	if asset.StatusCode != 200 || !strings.Contains(string(script), "renderCountdown") {
		t.Fatal("countdown script unavailable")
	}
	req, _ := http.NewRequest("POST", base+"/api/exit", strings.NewReader(""))
	req.Header.Set("Origin", "https://untrusted.example")
	r, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 403 {
		t.Fatal(r.StatusCode)
	}
	req, _ = http.NewRequest("GET", base+"/api/state", nil)
	req.Host = "untrusted.example"
	r, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 403 {
		t.Fatal(r.StatusCode)
	}
}

func TestLegacyStopPINIsDiscardedFromLedgerAndDashboard(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "ledger.json"), []byte(`{"policy":{"clientId":"pc","settings":{"stop_pin":"1234","mode":"warn"}},"totals":{}}`), 0600); err != nil {
		t.Fatal(err)
	}
	e, err := newEngine(dir, Account{}, true)
	if err != nil {
		t.Fatal(err)
	}
	if !e.Ledger.Policy.Settings.StopPinRequired {
		t.Fatal("legacy PIN presence lost")
	}
	stored, err := os.ReadFile(filepath.Join(dir, "ledger.json"))
	if err != nil || strings.Contains(string(stored), "1234") || strings.Contains(string(stored), "stop_pin\"") {
		t.Fatal("PIN remained on disk", err)
	}
	view, err := json.Marshal(e.view())
	if err != nil || strings.Contains(string(view), "1234") || strings.Contains(string(view), "stop_pin\"") {
		t.Fatal("PIN leaked to dashboard", err)
	}
}

func TestLinkedStopRequiresOnlineServerAuthorization(t *testing.T) {
	e := testEngine(t)
	e.Ledger.Policy.ClientID = "pc"
	e.demo = false
	e.account.Token = "test-token"
	authorized := false
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/companion/v2/stop" || r.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("unexpected stop request")
			w.WriteHeader(403)
			return
		}
		var body struct {
			Pin string `json:"pin"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Pin != "1234" {
			w.WriteHeader(403)
			w.Write([]byte(`{"error":"wrong_pin"}`))
			return
		}
		authorized = true
		w.Write([]byte(`{"ok":true}`))
	}))
	defer remote.Close()
	e.network = &Network{bootstrap: Bootstrap{Server: remote.URL}, client: remote.Client()}
	stopped := false
	address, shutdown, err := e.serve(func() { stopped = true })
	if err != nil {
		t.Fatal(err)
	}
	defer shutdown()
	parsed, _ := url.Parse(address)
	base := parsed.Scheme + "://" + parsed.Host
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	if r, err := client.Get(address); err != nil {
		t.Fatal(err)
	} else {
		r.Body.Close()
	}
	post := func(pin string) int {
		req, _ := http.NewRequest("POST", base+"/api/exit", strings.NewReader(`{"pin":"`+pin+`"}`))
		req.Header.Set("Origin", base)
		r, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		return r.StatusCode
	}
	if code := post(""); code != 403 || stopped {
		t.Fatal("missing PIN stopped app", code)
	}
	if code := post("1234"); code != 204 || !authorized {
		t.Fatal("valid PIN not authorized", code)
	}
}
