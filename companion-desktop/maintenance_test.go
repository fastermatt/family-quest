package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestMaintenanceDemoIsSavedAndNotRepeated(t *testing.T) {
	e := testEngine(t)
	e.account.Token = "device-token"
	id := "11111111-1111-4111-8111-111111111111"
	posts := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			json.NewEncoder(w).Encode(map[string]any{"command": map[string]any{"id": id, "kind": "test-countdown", "expiresAt": time.Now().Add(time.Minute).Format(time.RFC3339)}})
			return
		}
		posts++
		var body struct {
			ID     string         `json:"id"`
			Status string         `json:"status"`
			Result map[string]any `json:"result"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID != id || body.Status != "completed" || body.Result["countdownOutcome"] != "requested" {
			t.Errorf("bad acknowledgement: %+v %v", body, err)
		}
		w.Write([]byte(`{"ok":true}`))
	}))
	defer s.Close()
	n := &Network{bootstrap: Bootstrap{Server: s.URL}, client: s.Client()}
	e.maintenanceOnce(n)
	first := e.demoCountdownUntil
	if first.IsZero() || posts != 1 {
		t.Fatal(first, posts)
	}
	e.maintenanceOnce(n)
	if !e.demoCountdownUntil.Equal(first) || posts != 2 {
		t.Fatal("duplicate command replayed", posts)
	}
	if rec, err := e.readMaintenance(); err != nil || rec.ID != id {
		t.Fatal(rec, err)
	}
}

func TestMaintenanceRejectsUnlistedAndExpiredCommands(t *testing.T) {
	now := time.Now()
	for _, kind := range []string{"shell", "apply-script", ""} {
		if validMaintenanceCommand(&maintenanceCommand{ID: "11111111-1111-4111-8111-111111111111", Kind: kind, ExpiresAt: now.Add(time.Minute).Format(time.RFC3339)}, now) {
			t.Fatal(kind)
		}
	}
	if validMaintenanceCommand(&maintenanceCommand{ID: "11111111-1111-4111-8111-111111111111", Kind: "diagnostics", ExpiresAt: now.Add(-time.Second).Format(time.RFC3339)}, now) {
		t.Fatal("expired command accepted")
	}
}

func TestApplyUpdateNeedsNewLauncher(t *testing.T) {
	e := testEngine(t)
	outcome, _ := e.prepareApplyUpdate()
	if outcome != "failed" {
		t.Fatal(outcome)
	}
}

func TestAcknowledgedActivationSurvivesWorkerRestart(t *testing.T) {
	e := testEngine(t)
	dir := filepath.Join(e.dir, "updates")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	manifest, err := os.ReadFile("testdata/update-test.json")
	if err != nil {
		t.Fatal(err)
	}
	r, err := verifyRelease(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, r.SHA256+".exe"), []byte("test binary, never a release"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "activation.json"), manifest, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "activation-acked"), []byte("11111111-1111-4111-8111-111111111111"), 0600); err != nil {
		t.Fatal(err)
	}
	restarted, err := newEngine(e.dir, Account{}, true)
	if err != nil || !restarted.activationRequested {
		t.Fatal("durable activation lost", err)
	}
	if err := os.Remove(filepath.Join(dir, "activation-acked")); err != nil {
		t.Fatal(err)
	}
	launched, err := newEngine(e.dir, Account{}, true)
	if err != nil || launched.activationRequested {
		t.Fatal("new worker inherited consumed request", err)
	}
}

func TestDemoCountdownDoesNotConsumeAllowance(t *testing.T) {
	e := testEngine(t)
	before := e.Ledger.Totals["game.exe"]
	e.demoCountdownUntil = time.Now().Add(10 * time.Second)
	c := e.countdown(time.Now())
	if !c.Visible || c.Phase != "demo" || e.Ledger.Totals["game.exe"] != before {
		t.Fatal(c)
	}
}

func TestActivationRequiresFreshAcceptedRules(t *testing.T) {
	e, now := familyEngine(t, true)
	if games, fresh := e.activationGameRules(now); !fresh || !games["game.exe"] {
		t.Fatal(games, fresh)
	}
	e.LastPolicy = now.Add(-3 * time.Minute)
	if _, fresh := e.activationGameRules(now); fresh {
		t.Fatal("stale rules accepted")
	}
	e.LastPolicy = now
	e.Ledger.Policy.FamilyPolicy.ExpiresAt = now.Add(-time.Second).Format(time.RFC3339)
	if _, fresh := e.activationGameRules(now); fresh {
		t.Fatal("expired family lease accepted")
	}
}
