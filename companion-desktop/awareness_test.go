package main

import (
	"testing"
	"time"
)

func TestAwarenessWithoutLimitAndNoRepeat(t *testing.T) {
	e, now := countdownEngine(t)
	e.Ledger.Policy.Settings.GamingMinutes = nil
	e.Ledger.Totals["game.exe"] = 1799
	if e.countdown(now).Visible {
		t.Fatal("early")
	}
	e.Ledger.Totals["game.exe"] = 1800
	c := e.countdown(now)
	if c.Phase != "awareness" || c.Clock != "0h 30m" {
		t.Fatal(c)
	}
	if e.countdown(now.Add(21 * time.Second)).Visible {
		t.Fatal("notice should expire")
	}
	e.Ledger.Totals["game.exe"] = 3600
	if e.countdown(now.Add(time.Minute)).Clock != "1h 00m" {
		t.Fatal("next milestone missing")
	}
}
func TestAwarenessExcludesSchoolAndUnavailable(t *testing.T) {
	e, now := countdownEngine(t)
	e.Ledger.Policy.Settings.GamingMinutes = nil
	e.Ledger.Totals["game.exe"] = 7200
	e.before.Available = false
	if e.countdown(now).Visible {
		t.Fatal("inactive")
	}
	e.before.Available = true
	e.Ledger.Policy.Rules[0].Category = "school"
	if e.countdown(now).Visible {
		t.Fatal("school")
	}
}
func TestAwarenessPersistsMilestoneAndResetsDay(t *testing.T) {
	e, now := countdownEngine(t)
	e.Ledger.Policy.Settings.GamingMinutes = nil
	e.Ledger.Totals["game.exe"] = 1800
	e.countdown(now)
	e.awarenessUntil = time.Time{}
	if e.countdown(now).Visible {
		t.Fatal("repeat after restart")
	}
	day, err := time.Parse("2006-01-02", e.Ledger.Day)
	if err != nil {
		t.Fatal(err)
	}
	e.Ledger.Day = day.AddDate(0, 0, 1).Format("2006-01-02")
	if e.countdown(now).Phase != "awareness" {
		t.Fatal("new day milestone missing")
	}
}
func TestLimitWarningWinsOverAwareness(t *testing.T) {
	e, now := countdownEngine(t)
	limit := 35
	e.Ledger.Policy.Settings.GamingMinutes = &limit
	e.Ledger.Totals["game.exe"] = 1800
	if e.countdown(now).Phase != "allowance" {
		t.Fatal("limit warning hidden")
	}
}

func TestLaunchOncePerObservedProcess(t *testing.T) {
	e, now := countdownEngine(t)
	e.before.PID = 42
	e.enforce(e.before, now)
	if c := e.countdown(now); c.Clock != "Let's Go" {
		t.Fatal(c)
	}
	e.enforce(e.before, now.Add(10*time.Second))
	if e.countdown(now.Add(10*time.Second)).Phase == "launch" {
		t.Fatal("repeated launch")
	}
	e.before.PID = 43
	e.enforce(e.before, now.Add(11*time.Second))
	if e.countdown(now.Add(11*time.Second)).Phase != "launch" {
		t.Fatal("new process")
	}
}
func TestTimeUpPersistsAwayFromGameUntilAllowanceChanges(t *testing.T) {
	e, now := countdownEngine(t)
	e.Ledger.Totals["game.exe"] = 600
	if e.countdown(now).Title != "TIME IS UP" {
		t.Fatal("missing expiry")
	}
	e.Current = "msedge.exe"
	if e.countdown(now.Add(time.Hour)).Phase != "expired" {
		t.Fatal("notice disappeared")
	}
	cap := 30
	e.Ledger.Policy.Settings.GamingMinutes = &cap
	if e.countdown(now).Visible {
		t.Fatal("extra time did not clear expiry")
	}
}
