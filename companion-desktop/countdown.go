package main

import (
	"fmt"
	"math"
	"strings"
	"time"
)

type Countdown struct {
	Visible bool   `json:"visible"`
	Seconds int    `json:"seconds"`
	Total   int    `json:"total"`
	Clock   string `json:"clock"`
	Title   string `json:"title"`
	Detail  string `json:"detail"`
	Game    string `json:"game"`
	Urgent  bool   `json:"urgent"`
	Phase   string `json:"phase"`
}

// Call with the engine mutex held. The deadline is shared with enforcement;
// the display cannot grant time, change rules, or close a process.
func (e *Engine) countdown(now time.Time) Countdown {
	if now.Before(e.demoCountdownUntil) {
		seconds := int(math.Ceil(e.demoCountdownUntil.Sub(now).Seconds()))
		return Countdown{Visible: true, Seconds: seconds, Total: 10, Clock: fmt.Sprintf("00:%02d", seconds), Title: "PARENT DISPLAY TEST", Detail: "Demo only · no game time used or game closed", Game: "ChoreZap test overlay", Phase: "demo"}
	}
	family, familyAllowed, familyReason := e.familyState(now)
	if e.expiredGame != "" {
		remaining, limited := e.remaining(e.expiredGame)
		if !limited || remaining > 0 {
			e.expiredGame = ""
		}
	}
	if e.expiredGame != "" && (!e.before.Available || (!family && e.Current != e.expiredGame) || e.Action == "Game process closed after its time limit.") {
		return e.timeUp()
	}
	name := e.Current
	remaining, limited := e.remainingAt(name, now)
	if family && familyAllowed && limited && remaining <= 0 {
		familyReason = "Game time on this PC is used up."
	}
	if remaining > 0 && e.before.Available {
		elapsed := now.Sub(e.Ledger.Last).Seconds()
		if elapsed > 0 && elapsed < 2 {
			remaining = math.Max(0, remaining-elapsed)
		}
	}
	if e.before.Available && name == e.launchGame && now.Before(e.launchUntil) && (!limited || remaining > 60) {
		return Countdown{Visible: true, Seconds: 1, Total: 1, Clock: "Let's Go", Title: "GAME STARTED", Game: e.rule(name).Label, Detail: "Your gaming time is being recorded", Phase: "launch"}
	}
	if !limited || name == "" || !e.before.Available || remaining > 300 {
		return e.awareness(now)
	}
	fresh := !e.LastPolicy.IsZero() && !now.Before(e.LastPolicy) && now.Sub(e.LastPolicy) <= 4*time.Hour
	if family {
		fresh = true
	}
	closing := e.Ledger.Policy.Settings.Mode == "close" && fresh
	c := Countdown{Visible: true, Seconds: int(math.Ceil(math.Max(0, remaining))), Total: 300, Game: e.rule(name).Label, Title: "TIME TO WRAP UP", Phase: "allowance", Detail: "Reminder only · your game stays open"}
	if closing {
		c.Detail = "Save soon · 30-second save window at zero"
	}
	if remaining <= 0 {
		e.expiredGame = name
		c.Title = "TIME IS UP"
		c.Phase = "expired"
		c.Detail = "Allowance reached · your game stays open"
		if closing {
			deadline, ok := e.deadlines[name]
			if family {
				deadline, ok = e.Ledger.FamilyCloseDeadline, !e.Ledger.FamilyCloseDeadline.IsZero()
			}
			if ok {
				c.Seconds = int(math.Ceil(math.Max(0, deadline.Sub(now).Seconds())))
				c.Total = 30
				c.Title = "SAVE YOUR PROGRESS"
				c.Detail = "Game closes when this reaches zero"
				c.Phase = "closing"
				if strings.HasPrefix(e.Action, "Could not close game:") {
					c.Title = "CLOSE NEEDS A RETRY"
					c.Detail = "Save now · retrying when this reaches zero"
					c.Phase = "retry"
				}
			} else {
				c.Detail = "Save now · preparing the 30-second warning"
			}
		}
		if family {
			c.Detail = familyReason
			if closing {
				c.Detail += " · game closes after save window"
			}
		}
	}
	c.Urgent = c.Seconds <= 60 || c.Phase != "allowance"
	c.Clock = fmt.Sprintf("%02d:%02d", c.Seconds/60, c.Seconds%60)
	return c
}
func (e *Engine) countdownSnapshot() Countdown {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.countdown(time.Now())
}

// Awareness never changes a policy or closes a game. Caller holds engine mutex.
func (e *Engine) awareness(now time.Time) Countdown {
	if e.Ledger.AwarenessDay != e.Ledger.Day {
		e.Ledger.AwarenessDay = e.Ledger.Day
		e.Ledger.AwarenessMilestone = 0
		e.awarenessUntil = time.Time{}
	}
	if !e.before.Available || protected[e.Current] || e.rule(e.Current).Category != "game" {
		return Countdown{}
	}
	seconds := 0.0
	for name, used := range e.totals() {
		if e.rule(name).Category == "game" && !protected[name] {
			seconds += used
		}
	}
	milestone := int(seconds) / 1800
	if milestone > e.Ledger.AwarenessMilestone {
		e.Ledger.AwarenessMilestone = milestone
		e.awarenessUntil = now.Add(20 * time.Second)
	}
	if !now.Before(e.awarenessUntil) {
		return Countdown{}
	}
	minutes := int(seconds) / 60
	return Countdown{Visible: true, Seconds: 1, Total: 1, Clock: fmt.Sprintf("%dh %02dm", minutes/60, minutes%60), Title: "30 MINUTES HAS PASSED", Game: e.rule(e.Current).Label, Detail: "Time check · your game stays open", Phase: "awareness"}
}

func (e *Engine) timeUp() Countdown {
	return Countdown{Visible: true, Total: 1, Clock: "00:00", Title: "TIME IS UP", Game: e.rule(e.expiredGame).Label, Detail: "Gaming allowance reached · take a break", Urgent: true, Phase: "expired"}
}
