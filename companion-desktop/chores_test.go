package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestChorePollingKeepsTodayAcross304AndHidesFailures(t *testing.T) {
	e, err := newEngine(t.TempDir(), Account{Token: "test-device"}, false)
	if err != nil {
		t.Fatal(err)
	}
	e.Ledger.Policy.ClientID = "linked"
	day := dayOf(time.Now())
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Header.Get("Authorization") != "Bearer test-device" || r.URL.Path != "/api/companion/v2/chores" {
			t.Errorf("unexpected chores request")
		}
		if requests == 1 {
			w.Header().Set("ETag", `"today"`)
			json.NewEncoder(w).Encode(ChoresSummary{Day: day, Chores: []Chore{{ID: "a", Status: "pending"}}, PendingCount: 1, TotalRequired: 1})
			return
		}
		if r.Header.Get("If-None-Match") != `"today"` {
			t.Errorf("conditional request missing tag")
		}
		if requests == 2 {
			w.WriteHeader(304)
			return
		}
		w.WriteHeader(401)
	}))
	defer server.Close()
	n := &Network{bootstrap: Bootstrap{Server: server.URL}, client: server.Client()}
	e.choresFetch(n)
	e.choresFetch(n)
	if !e.choresAvailable || e.chores.PendingCount != 1 || !e.Ledger.NoticeKeys["chores-ready"] {
		t.Fatal("today's chores and startup notice should survive a 304")
	}
	restarted, err := newEngine(e.dir, Account{}, false)
	if err != nil || !restarted.Ledger.NoticeKeys["chores-ready"] {
		t.Fatal("startup notice should remain deduplicated after restart")
	}
	e.choresFetch(n)
	if e.choresAvailable || e.chores != nil || e.choresETag != "" {
		t.Fatal("revoked link must clear chore details")
	}
}

func TestChoreNoticeTransitionsUseStableIDs(t *testing.T) {
	before := &ChoresSummary{Day: "2026-11-13", Chores: []Chore{{ID: "a", Name: "Same title", Status: "submitted"}, {ID: "b", Name: "Same title", Status: "rejected"}}}
	after := &ChoresSummary{Day: before.Day, Chores: []Chore{{ID: "a", Name: "Same title", Status: "rejected"}, {ID: "b", Name: "Same title", Status: "redo"}}}
	if notices := choreNotices(before, after); len(notices) != 1 || notices[0].key != "redo:a" {
		t.Fatalf("expected one new redo, got %+v", notices)
	}
	done := &ChoresSummary{Day: before.Day, AllDone: true}
	if notices := choreNotices(after, done); len(notices) != 1 || notices[0].key != "chores-complete" {
		t.Fatalf("expected completion, got %+v", notices)
	}
	if len(choreNotices(done, done)) != 0 || len(choreNotices(nil, done)) != 0 {
		t.Fatal("completion should only fire when transitioning")
	}
}
