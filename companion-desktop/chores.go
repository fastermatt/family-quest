package main

import (
	"fmt"
	"net/http"
	"time"
)

type Chore struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	Required bool   `json:"required"`
	XP       int    `json:"xp"`
}

type ChoresSummary struct {
	Day            string  `json:"day"`
	ChildName      string  `json:"childName"`
	Chores         []Chore `json:"chores"`
	PendingCount   int     `json:"pendingCount"`
	SubmittedCount int     `json:"submittedCount"`
	ApprovedCount  int     `json:"approvedCount"`
	TotalRequired  int     `json:"totalRequired"`
	AllDone        bool    `json:"allDone"`
}

type desktopNotice struct{ key, title, body string }

func needsRedo(status string) bool { return status == "redo" || status == "rejected" }

func choreNotices(previous, current *ChoresSummary) []desktopNotice {
	if previous == nil || previous.Day != current.Day {
		if current.PendingCount > 0 {
			return []desktopNotice{{"chores-ready", "Today's chores", fmt.Sprintf("You have %d to do. Open ChoreZap to get started.", current.PendingCount)}}
		}
		return nil
	}
	statuses := make(map[string]string, len(previous.Chores))
	for _, chore := range previous.Chores {
		statuses[chore.ID] = chore.Status
	}
	var notices []desktopNotice
	for _, chore := range current.Chores {
		if needsRedo(chore.Status) && !needsRedo(statuses[chore.ID]) {
			notices = append(notices, desktopNotice{"redo:" + chore.ID, "Chore needs fixing", chore.Name + " was sent back. Open ChoreZap to see what to fix."})
		}
	}
	if !previous.AllDone && current.AllDone {
		notices = append(notices, desktopNotice{"chores-complete", "Required chores complete", "Nice work! Check ChoreZap for today's game-time rules."})
	}
	return notices
}

// Caller holds e.mu. Persist the keys so restarting cannot replay notices.
func (e *Engine) sendNotices(day string, notices ...desktopNotice) {
	if e.demo || len(notices) == 0 {
		return
	}
	if e.Ledger.NoticeDay != day || e.Ledger.NoticeKeys == nil {
		e.Ledger.NoticeDay = day
		e.Ledger.NoticeKeys = make(map[string]bool)
	}
	var pending []desktopNotice
	for _, notice := range notices {
		if !e.Ledger.NoticeKeys[notice.key] && len(e.Ledger.NoticeKeys) < 256 {
			e.Ledger.NoticeKeys[notice.key] = true
			pending = append(pending, notice)
		}
	}
	if len(pending) == 0 {
		return
	}
	if err := e.saveLocked(); err != nil {
		for _, notice := range pending {
			delete(e.Ledger.NoticeKeys, notice.key)
		}
		e.SyncError = err.Error()
		return
	}
	for _, notice := range pending {
		showDesktopNotice(notice.title, notice.body)
	}
}

// Invoked by a single polling loop, independently of the tracking upload loop.
func (e *Engine) choresFetch(network *Network) {
	if e.demo {
		return
	}
	e.mu.Lock()
	token := e.account.Token
	linked := e.Ledger.Policy.ClientID != ""
	e.mu.Unlock()
	if !linked || token == "" {
		return
	}

	var current ChoresSummary
	status, err := network.requestWithETag("/api/companion/v2/chores", token, nil, &current, &e.choresETag)
	day := dayOf(time.Now())
	e.mu.Lock()
	defer e.mu.Unlock()
	if err != nil {
		e.choresAvailable = false
		if status == http.StatusUnauthorized {
			e.chores, e.choresETag = nil, ""
		}
		return
	}
	if status == http.StatusNotModified {
		e.choresAvailable = e.chores != nil && e.chores.Day == day
		return
	}
	if current.Day != day || len(current.Chores) > 200 || current.TotalRequired != len(current.Chores) {
		e.choresAvailable, e.choresETag = false, ""
		return
	}
	notices := choreNotices(e.chores, &current)
	e.chores, e.choresAvailable = &current, true
	e.sendNotices(day, notices...)
}

func gameTimeNotice(remaining float64) desktopNotice {
	switch {
	case remaining <= 0:
		return desktopNotice{"game-expired", "ChoreZap · Game time", "Your game allowance is up. Check ChoreZap for the current rule."}
	case remaining <= 60:
		return desktopNotice{"game-one-minute", "ChoreZap · Game time", "One minute or less left. Save your game."}
	case remaining <= 300:
		return desktopNotice{"game-five-minutes", "ChoreZap · Game time", "Five minutes or less of game time left."}
	default:
		return desktopNotice{}
	}
}

func closingNotice(deadline time.Time, reason string) desktopNotice {
	return desktopNotice{fmt.Sprintf("game-closing:%d", deadline.Unix()), "ChoreZap · Save your game", "Game closes in 30 seconds. " + reason}
}
