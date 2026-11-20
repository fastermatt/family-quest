package main

import (
	"strings"
	"testing"
	"time"
)

func countdownEngine(t *testing.T) (*Engine, time.Time) {
	e := testEngine(t)
	cap := 10
	e.Ledger.Policy.Settings = Settings{GamingMinutes: &cap, Mode: "warn"}
	e.Ledger.Policy.Rules = []Rule{{Executable: "game.exe", Label: "Example Game", Category: "game"}}
	e.Current = "game.exe"
	e.before = Observation{Executable: "game.exe", Available: true}
	return e, e.Ledger.Last
}
func TestCountdownStartsAtFiveMinutesAndFollowsAllowance(t *testing.T) {
	e, now := countdownEngine(t)
	e.Ledger.Totals["game.exe"] = 299
	if e.countdown(now).Visible {
		t.Fatal("shown too early")
	}
	e.Ledger.Totals["game.exe"] = 300
	c := e.countdown(now)
	if !c.Visible || c.Clock != "05:00" || c.Urgent {
		t.Fatal(c)
	}
	c = e.countdown(now.Add(time.Second))
	if c.Clock != "04:59" {
		t.Fatal(c)
	}
	e.Ledger.Totals["game.exe"] = 540
	c = e.countdown(now)
	if !c.Urgent || c.Clock != "01:00" {
		t.Fatal(c)
	}
}
func TestCountdownUsesRealCloseDeadlineAndOfflineFallback(t *testing.T) {
	e, now := countdownEngine(t)
	e.Ledger.Totals["game.exe"] = 600
	e.Ledger.Policy.Settings.Mode = "close"
	e.LastPolicy = now
	e.deadlines["game.exe"] = now.Add(30 * time.Second)
	c := e.countdown(now.Add(9 * time.Second))
	if c.Phase != "closing" || c.Clock != "00:21" {
		t.Fatal(c)
	}
	e.LastPolicy = now.Add(-5 * time.Hour)
	c = e.countdown(now)
	if c.Phase != "expired" || !strings.Contains(c.Detail, "stays open") {
		t.Fatal(c)
	}
}
func TestCountdownHidesForSchoolAndExtraTime(t *testing.T) {
	e, now := countdownEngine(t)
	e.Ledger.Totals["game.exe"] = 550
	e.Ledger.Policy.Rules[0].Category = "school"
	if e.countdown(now).Visible {
		t.Fatal("school countdown")
	}
	e.Ledger.Policy.Rules[0].Category = "game"
	extra := 30
	e.Ledger.Policy.Settings.GamingMinutes = &extra
	if e.countdown(now).Visible {
		t.Fatal("extension ignored")
	}
	e.before.Available = false
	if e.countdown(now).Visible {
		t.Fatal("inactive countdown")
	}
}
func TestReminderModeClearsPreviousCloseCountdown(t *testing.T) {
	e, now := countdownEngine(t)
	e.Ledger.Totals["game.exe"] = 600
	e.deadlines["game.exe"] = now.Add(30 * time.Second)
	e.enforce(e.before, now)
	if len(e.deadlines) != 0 {
		t.Fatal("stale deadline retained")
	}
}
