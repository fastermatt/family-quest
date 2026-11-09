package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func testEngine(t *testing.T) *Engine {
	t.Helper()
	e, err := newEngine(t.TempDir(), Account{}, true)
	if err != nil {
		t.Fatal(err)
	}
	day := e.Ledger.Last.In(denver)
	e.Ledger.Last = time.Date(day.Year(), day.Month(), day.Day(), 12, 0, 0, 0, denver)
	e.Ledger.BucketStart = e.Ledger.Last
	return e
}
func TestOnlyConsecutiveForegroundAndBoundedIntervalsCount(t *testing.T) {
	e := testEngine(t)
	start := e.Ledger.Last
	game := Observation{Executable: "game.exe", Available: true}
	e.sample(start.Add(2*time.Second), game)
	e.sample(start.Add(4*time.Second), game)
	e.sample(start.Add(6*time.Second), Observation{Executable: "steam.exe", Available: true})
	if e.Ledger.Totals["game.exe"] != 2 || e.Ledger.Gaps != 4 {
		t.Fatal(e.Ledger)
	}
	e.sample(start.Add(time.Hour), game)
	if e.Ledger.Totals["game.exe"] != 2 {
		t.Fatal("sleep billed")
	}
}
func TestImmutableBatchesAndRestartPreserveIdentity(t *testing.T) {
	e := testEngine(t)
	start := e.Ledger.Last
	game := Observation{Executable: "game.exe", Available: true}
	for n := 1; n <= 150; n++ {
		e.sample(start.Add(time.Duration(n)*2*time.Second), game)
	}
	if len(e.Ledger.Outbox) != 1 {
		t.Fatal(e.Ledger)
	}
	b := e.Ledger.Outbox[0]
	if b.ID == "" || b.Gaps != 2 || b.Apps[0].Seconds != 298 {
		t.Fatal(b)
	}
	if err := e.save(); err != nil {
		t.Fatal(err)
	}
	next, err := newEngine(e.dir, Account{}, true)
	if err != nil {
		t.Fatal(err)
	}
	if next.Ledger.Outbox[0].ID != b.ID {
		t.Fatal("retry identity changed")
	}
}
func TestProtectedAppsAndSharedBudget(t *testing.T) {
	e := testEngine(t)
	cap := 10
	e.Ledger.Policy.Settings = Settings{GamingMinutes: &cap, Mode: "close"}
	e.Ledger.Policy.Rules = []Rule{{Executable: "game.exe", Category: "game"}, {Executable: "second.exe", Category: "game"}, {Executable: "msedge.exe", Category: "game"}}
	e.Ledger.Totals = map[string]float64{"game.exe": 400, "second.exe": 100, "msedge.exe": 900}
	left, ok := e.remaining("game.exe")
	if !ok || left != 100 {
		t.Fatal(left, ok)
	}
	if _, ok = e.remaining("msedge.exe"); ok {
		t.Fatal("browser can be limited")
	}
	e.Ledger.Policy.Settings.Paused = true
	if r, ok := e.remaining("game.exe"); !ok || r != 0 {
		t.Fatal(r, ok)
	}
}
func TestServerTotalsDoNotDoubleCountOwnBatches(t *testing.T) {
	e := testEngine(t)
	e.Ledger.Totals["game.exe"] = 100
	e.Ledger.Policy.Day = e.Ledger.Day
	e.Ledger.Policy.OwnApps = []AppTime{{Executable: "game.exe", Seconds: 80}}
	e.Ledger.Policy.OtherApps = []AppTime{{Executable: "game.exe", Seconds: 20}}
	if e.totals()["game.exe"] != 120 {
		t.Fatal(e.totals())
	}
}
func TestMidnightSplitsIntoSingleDenverDayBatches(t *testing.T) {
	e := testEngine(t)
	before := time.Date(2026, 10, 22, 23, 59, 58, 0, denver)
	e.Ledger.Last = before
	e.Ledger.BucketStart = before
	e.Ledger.Day = dayOf(before)
	e.before = Observation{Executable: "game.exe", Available: true}
	e.sample(before.Add(4*time.Second), e.before)
	if len(e.Ledger.Outbox) != 1 || e.Ledger.Day != "2026-10-23" || e.Ledger.BucketGaps != 2 {
		t.Fatal(e.Ledger)
	}
}
func TestDamagedStateDoesNotSilentlyResetAllowance(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "ledger.json"), []byte("bad"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := newEngine(dir, Account{}, true); err == nil {
		t.Fatal("damaged state silently reset")
	}
}
func TestEveryBatchBalances(t *testing.T) {
	e := testEngine(t)
	start := e.Ledger.Last
	for n := 1; n <= 320; n++ {
		e.sample(start.Add(time.Duration(n)*2*time.Second), Observation{Executable: []string{"a.exe", "b.exe"}[n%2], Available: true})
	}
	for _, b := range e.Ledger.Outbox {
		sum := b.Gaps
		for _, a := range b.Apps {
			sum += a.Seconds
		}
		if sum != b.End.Sub(b.Start).Seconds() {
			raw, _ := json.Marshal(b)
			t.Fatal(string(raw))
		}
	}
}
