package main

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	_ "time/tzdata"
)

type Ledger struct {
	NoticeDay              string              `json:"noticeDay,omitempty"`
	NoticeKeys             map[string]bool     `json:"noticeKeys,omitempty"`
	SyncConflicts          int                 `json:"syncConflicts"`
	AwarenessDay           string              `json:"awarenessDay"`
	AwarenessMilestone     int                 `json:"awarenessMilestone"`
	Hints                  map[string]*AppHint `json:"hints,omitempty"`
	Day                    string              `json:"day"`
	LastUpload             time.Time           `json:"lastUpload"`
	Totals                 map[string]float64  `json:"totals"`
	Gaps                   float64             `json:"gaps"`
	Outbox                 []Batch             `json:"outbox"`
	BucketStart            time.Time           `json:"bucketStart"`
	BucketApps             map[string]float64  `json:"bucketApps"`
	BucketGaps             float64             `json:"bucketGaps"`
	Last                   time.Time           `json:"last"`
	Policy                 Policy              `json:"policy"`
	PolicyAcceptedAt       time.Time           `json:"policyAcceptedAt,omitempty"`
	PolicyRequestStartedAt time.Time           `json:"policyRequestStartedAt,omitempty"`
	FamilySeen             bool                `json:"familySeen,omitempty"`
	FamilyRevision         int64               `json:"familyRevision,omitempty"`
	FamilyCloseDeadline    time.Time           `json:"familyCloseDeadline,omitempty"`
	FamilyCloseDay         string              `json:"familyCloseDay,omitempty"`
}
type Engine struct {
	chores              *ChoresSummary
	choresETag          string
	choresAvailable     bool
	seenGames           map[uint32]string
	launchUntil         time.Time
	launchGame          string
	expiredGame         string
	awarenessUntil      time.Time
	demoCountdownUntil  time.Time
	demoHUDDisplayed    bool
	activationRequested bool
	launcherPID         int
	launcherVersion     string
	activationMu        sync.Mutex
	mu                  sync.Mutex
	Ledger              Ledger
	account             Account
	network             *Network
	pin                 string
	dir                 string
	before              Observation
	Current             string
	SyncError           string
	LastSync            time.Time
	LastPolicy          time.Time
	Action              string
	deadlines           map[string]time.Time
	demo                bool
}

func newEngine(dir string, account Account, demo bool) (*Engine, error) {
	e := &Engine{dir: dir, account: account, deadlines: map[string]time.Time{}, demo: demo}
	var pinBytes [2]byte
	if _, err := rand.Read(pinBytes[:]); err == nil {
		e.pin = fmt.Sprintf("%04d", binary.BigEndian.Uint16(pinBytes[:])%10000)
	}
	ledgerPath := filepath.Join(dir, "ledger.json")
	b, err := os.ReadFile(ledgerPath)
	if err == nil {
		if len(b) > 8<<20 {
			return nil, fmt.Errorf("saved usage is too large; preserve ledger.json and restore a valid backup before starting")
		}
		if err := json.Unmarshal(b, &e.Ledger); err != nil {
			return nil, fmt.Errorf("saved usage is damaged; preserve ledger.json and restore a valid backup before starting: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if f := e.Ledger.Policy.FamilyPolicy; f != nil {
		e.Ledger.FamilySeen = true
		if f.Revision > e.Ledger.FamilyRevision {
			e.Ledger.FamilyRevision = f.Revision
		}
	}
	if marker, err := os.ReadFile(filepath.Join(dir, "updates", "activation-acked")); err == nil && validCommandID(string(marker)) {
		if _, _, err := readRelease(filepath.Join(dir, "updates"), "activation.json"); err == nil {
			e.activationRequested = true
		}
	}
	if e.Ledger.Hints == nil {
		e.Ledger.Hints = map[string]*AppHint{}
	}
	e.LastSync = e.Ledger.LastUpload
	now := time.Now().UTC()
	if !e.Ledger.Last.IsZero() && !e.Ledger.BucketStart.IsZero() {
		e.finish(e.Ledger.Last)
	}
	e.Ledger.BucketStart = now
	e.Ledger.Last = now
	e.Ledger.BucketApps = map[string]float64{}
	e.Ledger.BucketGaps = 0
	if e.Ledger.Day != dayOf(now) || e.Ledger.Totals == nil {
		e.Ledger.Day = dayOf(now)
		e.Ledger.Totals = map[string]float64{}
		e.Ledger.Gaps = 0
	}
	// Earlier builds serialized stop_pin in ledger.json. Decode only the
	// presence bit, then rewrite immediately so new saves never retain it.
	if strings.Contains(string(b), `"stop_pin"`) {
		if err := e.save(); err != nil {
			return nil, fmt.Errorf("could not sanitize saved policy: %w", err)
		}
	}
	return e, nil
}
func sortedApps(m map[string]float64) []AppTime {
	out := []AppTime{}
	for name, sec := range m {
		out = append(out, AppTime{Executable: name, Seconds: sec})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Executable < out[j].Executable })
	return out
}
func (e *Engine) finish(end time.Time) {
	if !end.After(e.Ledger.BucketStart) {
		return
	}
	apps := sortedApps(e.Ledger.BucketApps)
	for i := range apps {
		apps[i].Hint = e.Ledger.Hints[apps[i].Executable]
	}
	e.Ledger.Outbox = append(e.Ledger.Outbox, Batch{batchID(), e.Ledger.BucketStart.UTC(), end.UTC(), apps, e.Ledger.BucketGaps, appVersion})
	e.Ledger.BucketStart = end
	e.Ledger.BucketApps = map[string]float64{}
	e.Ledger.BucketGaps = 0
}
func (e *Engine) sample(now time.Time, after Observation) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if after.Available && after.Hint != nil && !protected[after.Executable] && len(e.Ledger.Hints) < 1000 {
		e.Ledger.Hints[after.Executable] = after.Hint
	}
	elapsed := now.Sub(e.Ledger.Last).Seconds()
	if elapsed <= 0 {
		e.before = after
		return
	}
	if len(e.Ledger.Outbox) >= 1000 {
		e.SyncError = "Offline storage is full. Reconnect before recording more."
		e.Ledger.Last = now
		e.Ledger.BucketStart = now
		e.Ledger.BucketApps = map[string]float64{}
		e.Ledger.BucketGaps = 0
		e.before = after
		return
	}
	// Long pauses are not uploaded as hours of gameplay: preserve a short gap,
	// finish the prior bucket, and start a new observation interval after wake.
	if elapsed > 10 {
		e.finish(e.Ledger.Last)
		e.Ledger.BucketStart = now
		e.Ledger.Last = now
		e.before = after
		if dayOf(now) != e.Ledger.Day {
			e.Ledger.Day = dayOf(now)
			e.Ledger.Totals = map[string]float64{}
			e.Ledger.Gaps = 0
		}
		e.Current = "Unavailable after pause"
		return
	}
	if dayOf(now) != e.Ledger.Day {
		midnight := time.Date(now.In(denver).Year(), now.In(denver).Month(), now.In(denver).Day(), 0, 0, 0, 0, denver).UTC()
		if midnight.After(e.Ledger.Last) {
			e.Ledger.BucketGaps += midnight.Sub(e.Ledger.Last).Seconds()
			e.finish(midnight)
		}
		e.Ledger.Day = dayOf(now)
		e.Ledger.Totals = map[string]float64{}
		e.Ledger.Gaps = 0
		e.Ledger.BucketStart = midnight
		e.Ledger.BucketApps = map[string]float64{}
		e.Ledger.BucketGaps = now.Sub(midnight).Seconds()
		e.Ledger.Gaps = e.Ledger.BucketGaps
	} else if charge := e.chargeableApp(after); charge != "" {
		if _, ok := e.Ledger.BucketApps[charge]; ok || len(e.Ledger.BucketApps) < 100 {
			e.Ledger.BucketApps[charge] += elapsed
			e.Ledger.Totals[charge] += elapsed
		} else {
			e.Ledger.BucketGaps += elapsed
			e.Ledger.Gaps += elapsed
		}
	} else {
		e.Ledger.BucketGaps += elapsed
		e.Ledger.Gaps += elapsed
	}
	e.Current = after.Executable
	e.before = after
	e.Ledger.Last = now
	if now.Sub(e.Ledger.BucketStart) >= 5*time.Minute {
		e.finish(now)
	}
}

// Under a shared game budget, an interval with a game at both ends is
// charged once even if foreground selection switches between running games.
func (e *Engine) chargeableApp(after Observation) string {
	if !e.before.Available || !after.Available {
		return ""
	}
	if e.before.Executable == after.Executable {
		return after.Executable
	}
	if !protected[e.before.Executable] && !protected[after.Executable] && e.rule(e.before.Executable).Category == "game" && e.rule(after.Executable).Category == "game" {
		return e.before.Executable
	}
	return ""
}

// Close the current batch and persist it before handing off to another process.
func (e *Engine) checkpointUsage() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.finish(e.Ledger.Last)
	return e.saveLocked()
}

func (e *Engine) save() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.saveLocked()
}
func (e *Engine) saveLocked() error {
	b, err := json.Marshal(e.Ledger)
	if err != nil {
		return err
	}
	p := filepath.Join(e.dir, "ledger.json")
	if err = os.WriteFile(p+".tmp", b, 0o600); err != nil {
		return err
	}
	return os.Rename(p+".tmp", p)
}

var protected = map[string]bool{"msedge.exe": true, "chrome.exe": true, "avastbrowser.exe": true, "firefox.exe": true, "brave.exe": true, "opera.exe": true, "steam.exe": true, "steamwebhelper.exe": true, "xboxpcapp.exe": true, "gamingservices.exe": true, "explorer.exe": true, "windowsterminal.exe": true, "cmd.exe": true, "powershell.exe": true, "chorezap-desktop.exe": true}

func (e *Engine) rule(name string) Rule {
	for _, r := range e.Ledger.Policy.Rules {
		if r.Executable == name {
			if protected[name] {
				r.Category = "other"
			}
			return r
		}
	}
	label := name
	if h := e.Ledger.Hints[name]; h != nil && !protected[name] {
		label = h.Label
	}
	return Rule{Executable: name, Label: label, Category: "other"}
}
func (e *Engine) totals() map[string]float64 {
	m := map[string]float64{}
	for name, v := range e.Ledger.Totals {
		m[name] = v
	}
	if e.Ledger.Policy.Day == e.Ledger.Day {
		for _, a := range e.Ledger.Policy.OwnApps {
			if a.Seconds > m[a.Executable] {
				m[a.Executable] = a.Seconds
			}
		}
		for _, a := range e.Ledger.Policy.OtherApps {
			m[a.Executable] += a.Seconds
		}
	}
	return m
}
func (e *Engine) remaining(name string) (float64, bool) {
	return e.remainingAt(name, time.Now())
}
func (e *Engine) remainingAt(name string, now time.Time) (float64, bool) {
	r := e.rule(name)
	if r.Category != "game" || protected[name] {
		return 0, false
	}
	if enabled, allowed, _ := e.familyState(now); enabled && !allowed {
		return 0, true
	}
	if e.Ledger.Policy.Settings.Paused {
		return 0, true
	}
	totals := e.totals()
	remaining := float64(0)
	limited := false
	if r.DailyMinutes != nil {
		remaining = float64(*r.DailyMinutes)*60 - totals[name]
		limited = true
	}
	if cap := e.Ledger.Policy.Settings.GamingMinutes; cap != nil {
		used := float64(0)
		for exe, sec := range totals {
			if e.rule(exe).Category == "game" {
				used += sec
			}
		}
		budget := float64(*cap) * 60
		if seconds := e.Ledger.Policy.Settings.GamingSeconds; seconds != nil {
			budget = *seconds
		}
		shared := budget - used
		if !limited || shared < remaining {
			remaining = shared
		}
		limited = true
	}
	return remaining, limited
}
func (e *Engine) enforce(o Observation, now time.Time) {
	e.mu.Lock()
	if o.Available && !o.BackgroundGame && o.PID != 0 && !protected[o.Executable] && e.rule(o.Executable).Category != "school" {
		blocked := e.Ledger.Policy.Settings.BlockedExecutables
		for _, b := range blocked {
			if strings.EqualFold(b, o.Executable) {
				e.mu.Unlock()
				closeObservedGame(o)
				return
			}
		}
	}
	if o.Available && !o.BackgroundGame && o.PID != 0 && !protected[o.Executable] && e.rule(o.Executable).Category == "game" {
		if e.seenGames == nil {
			e.seenGames = map[uint32]string{}
		}
		if e.seenGames[o.PID] != o.Executable {
			e.seenGames[o.PID] = o.Executable
			e.launchGame = o.Executable
			e.launchUntil = now.Add(8 * time.Second)
		}
	}
	remaining, limited := e.remainingAt(o.Executable, now)
	family, familyAllowed, familyReason := e.familyState(now)
	if o.Available && !o.BackgroundGame && limited && !e.LastPolicy.IsZero() &&
		!now.Before(e.LastPolicy) && now.Sub(e.LastPolicy) <= 4*time.Hour &&
		!e.Ledger.Policy.Settings.Paused && (!family || familyAllowed) {
		if notice := gameTimeNotice(remaining); notice.key != "" {
			e.sendNotices(dayOf(now), notice)
		}
	}
	if family && familyAllowed && limited && remaining <= 0 {
		familyReason = "Game time on this PC is used up."
	}
	if family {
		e.enforceFamily(o, now, limited, remaining, familyReason)
		e.mu.Unlock()
		return
	}
	for name := range e.deadlines {
		if name != o.Executable {
			delete(e.deadlines, name)
		}
	}
	if !o.Available || !limited || remaining > 0 {
		e.Action = ""
		delete(e.deadlines, o.Executable)
		e.mu.Unlock()
		return
	}
	if e.Ledger.Policy.Settings.Mode != "close" || e.LastPolicy.IsZero() || now.Before(e.LastPolicy) || now.Sub(e.LastPolicy) > 4*time.Hour {
		delete(e.deadlines, o.Executable)
		e.Action = "Game allowance reached · reminder only"
		e.mu.Unlock()
		return
	}
	deadline, ok := e.deadlines[o.Executable]
	if !ok {
		if o.BackgroundGame {
			e.Action = "Game time used · close will wait until the game is foreground"
			e.mu.Unlock()
			return
		}
		deadline = now.Add(30 * time.Second)
		e.deadlines[o.Executable] = deadline
		e.Action = "Game time is up. This game will close in 30 seconds."
		e.mu.Unlock()
		return
	}
	if now.Before(deadline) {
		e.mu.Unlock()
		return
	}
	e.Action = "Requesting game close…"
	if o.BackgroundGame {
		e.Action = "Game time used · close will wait until the game is foreground"
		e.mu.Unlock()
		return
	}
	e.mu.Unlock()
	err := closeObservedGame(o)
	e.mu.Lock()
	defer e.mu.Unlock()
	if err != nil {
		e.Action = "Could not close game: " + err.Error()
	} else {
		e.Action = "Game process closed after its time limit."
	}
	e.deadlines[o.Executable] = now.Add(30 * time.Second)
}

// Caller holds e.mu. One saved warning belongs to the whole family game
// allowance, so changing foreground games or restarting cannot renew it.
func (e *Engine) enforceFamily(o Observation, now time.Time, limited bool, remaining float64, reason string) {
	if !limited || !o.Available {
		if !o.Available {
			e.Action = ""
		}
		return
	}
	if remaining > 0 {
		e.Action = ""
		if !e.Ledger.FamilyCloseDeadline.IsZero() {
			e.Ledger.FamilyCloseDeadline = time.Time{}
			e.Ledger.FamilyCloseDay = ""
			if err := e.saveLocked(); err != nil {
				e.SyncError = err.Error()
			}
		}
		return
	}
	if e.Ledger.Policy.Settings.Mode != "close" {
		e.Action = "Game unavailable · reminder only: " + reason
		return
	}
	if e.Ledger.FamilyCloseDeadline.IsZero() {
		if o.BackgroundGame {
			e.Action = "Game time used · close will wait until the game is foreground"
			return
		}
		e.Ledger.FamilyCloseDeadline = now.Add(30 * time.Second)
		e.Ledger.FamilyCloseDay = e.Ledger.Day
		if err := e.saveLocked(); err != nil {
			e.SyncError = err.Error()
			e.Ledger.FamilyCloseDeadline = now // Do not renew an unpersisted grace.
		}
	}
	if now.Before(e.Ledger.FamilyCloseDeadline) {
		e.Action = "Game unavailable · closes after save window: " + reason
		return
	}
	e.Action = "Requesting game close: " + reason
	if o.BackgroundGame {
		e.Action = "Game time used · close will wait until the game is foreground"
		return
	}
	// Avoid holding the mutex while asking Windows to close a process.
	e.mu.Unlock()
	err := closeObservedGame(o)
	e.mu.Lock()
	if err != nil {
		e.Action = "Could not close game: " + err.Error()
	} else {
		e.Action = "Game process closed: " + reason
	}
}
