package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func launcherVersionCompatible(version string) bool {
	parts := strings.Split(version, ".")
	if len(parts) != 3 {
		return false
	}
	values := [3]int{}
	for i, part := range parts {
		n, err := strconv.Atoi(part)
		if err != nil || n < 0 || n > 999 {
			return false
		}
		values[i] = n
	}
	return values[0] > 0 || (values[0] == 0 && (values[1] > 3 || (values[1] == 3 && values[2] >= 6)))
}
func (e *Engine) remoteActivationAvailable() bool {
	return e.launcherPID > 0 && launcherVersionCompatible(e.launcherVersion)
}
func (e *Engine) reportedLauncherVersion() string {
	if e.launcherVersion == "" || len(e.launcherVersion) > 30 {
		return "unknown"
	}
	return e.launcherVersion
}

type maintenanceCommand struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	ExpiresAt string `json:"expiresAt"`
}
type maintenanceReply struct {
	Command *maintenanceCommand `json:"command"`
}
type maintenanceRecord struct {
	ID     string         `json:"id"`
	Status string         `json:"status"`
	Result map[string]any `json:"result"`
}

func validMaintenanceCommand(c *maintenanceCommand, now time.Time) bool {
	if c == nil || !validCommandID(c.ID) {
		return false
	}
	if c.Kind != "diagnostics" && c.Kind != "check-update" && c.Kind != "test-countdown" && c.Kind != "apply-update" {
		return false
	}
	expires, err := time.Parse(time.RFC3339, c.ExpiresAt)
	return err == nil && now.Before(expires)
}
func validCommandID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, r := range s {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if r != '-' {
				return false
			}
			continue
		}
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
			return false
		}
	}
	return true
}
func (e *Engine) maintenancePath() string { return filepath.Join(e.dir, "maintenance.json") }
func (e *Engine) readMaintenance() (maintenanceRecord, error) {
	var record maintenanceRecord
	b, err := os.ReadFile(e.maintenancePath())
	if os.IsNotExist(err) {
		return record, nil
	}
	if err != nil {
		return record, err
	}
	if len(b) > 4096 {
		return record, fmt.Errorf("saved maintenance result too large")
	}
	if err = json.Unmarshal(b, &record); err != nil {
		return record, err
	}
	return record, nil
}
func (e *Engine) saveMaintenance(record maintenanceRecord) error {
	b, err := json.Marshal(record)
	if err != nil {
		return err
	}
	if len(b) > 4096 {
		return fmt.Errorf("maintenance result too large")
	}
	path := e.maintenancePath()
	if err = os.WriteFile(path+".tmp", b, 0600); err != nil {
		return err
	}
	return os.Rename(path+".tmp", path)
}
func (e *Engine) maintenanceOnce(n *Network) {
	var reply maintenanceReply
	if _, err := n.request("/api/companion/v2/commands", e.account.Token, nil, &reply); err != nil {
		return // The normal policy sync reports connectivity; maintenance is optional.
	}
	c := reply.Command
	if !validMaintenanceCommand(c, time.Now()) {
		return
	}
	record, err := e.readMaintenance()
	if err != nil {
		e.syncFailure(fmt.Errorf("saved maintenance result unavailable"))
		return
	}
	if record.ID != c.ID {
		if c.Kind == "test-countdown" {
			// Save the command identity before the visible effect. "requested"
			// is only a receipt: a crash here can skip the overlay, and the
			// parent can send a new command. Never claim "displayed" on retry.
			record = maintenanceRecord{ID: c.ID, Status: "completed", Result: map[string]any{"countdownOutcome": "requested"}}
			if err := e.saveMaintenance(record); err != nil {
				e.syncFailure(fmt.Errorf("could not save maintenance request"))
				return
			}
			record.Result["countdownOutcome"] = e.requestDemoCountdown()
		} else {
			record = e.executeMaintenance(c, n)
		}
		if err := e.saveMaintenance(record); err != nil {
			e.syncFailure(fmt.Errorf("could not save maintenance result"))
			return
		}
	}
	_, err = n.request("/api/companion/v2/commands", e.account.Token, map[string]any{"id": record.ID, "status": record.Status, "result": record.Result}, nil)
	if err != nil {
		return
	} // Same persisted acknowledgement is retried.
	if c.Kind == "apply-update" && record.Result["updateOutcome"] == "restart_requested" {
		if err := os.WriteFile(filepath.Join(e.dir, "updates", "activation-acked"), []byte(record.ID), 0600); err != nil {
			e.syncFailure(fmt.Errorf("could not preserve update acknowledgement"))
			return
		}
		e.mu.Lock()
		e.activationRequested = true
		e.mu.Unlock()
	}
}
func (e *Engine) executeMaintenance(c *maintenanceCommand, n *Network) maintenanceRecord {
	r := maintenanceRecord{ID: c.ID, Status: "completed", Result: map[string]any{}}
	switch c.Kind {
	case "diagnostics":
		e.mu.Lock()
		enabled, allowed, reason := e.familyState(time.Now())
		age := 0
		if !e.LastPolicy.IsZero() {
			age = int(time.Since(e.LastPolicy).Seconds())
			if age < 0 {
				age = 0
			}
		}
		revision := int64(0)
		if f := e.Ledger.Policy.FamilyPolicy; f != nil {
			revision = f.Revision
		}
		if e.LastPolicy.IsZero() && reason == "" {
			reason = "No accepted policy"
		}
		e.mu.Unlock()
		r.Result = map[string]any{"version": appVersion, "platform": runtime.GOOS + "/" + runtime.GOARCH, "launcherVersion": e.reportedLauncherVersion(), "policyRevision": revision, "policyAgeSeconds": age, "familyEnabled": enabled, "gamingAllowed": allowed, "remoteActivationAvailable": e.remoteActivationAvailable(), "reason": boundedReason(reason), "updateOutcome": "not_checked", "updateStatus": e.updateState()}
	case "check-update":
		r.Result["updateOutcome"], r.Result["updateStatus"] = e.checkMaintenanceUpdate(n)
		if r.Result["updateOutcome"] == "failed" {
			r.Status = "failed"
			r.Result["errorCode"] = "update_check_failed"
		}
	case "apply-update":
		outcome, status := e.prepareApplyUpdate()
		r.Result["updateOutcome"], r.Result["updateStatus"] = outcome, status
		if outcome == "failed" {
			r.Status = "failed"
			r.Result["errorCode"] = "initial_installer_required"
		}
	default:
		r.Status = "failed"
		r.Result["errorCode"] = "unsupported_command"
	}
	return r
}
func (e *Engine) prepareApplyUpdate() (string, string) {
	e.activationMu.Lock()
	defer e.activationMu.Unlock()
	if !e.remoteActivationAvailable() {
		return "failed", "Install the current ChoreZap package once to enable remote activation"
	}
	e.mu.Lock()
	games, policyFresh := e.activationGameRules(time.Now())
	e.mu.Unlock()
	if !policyFresh {
		return "deferred", "Wait for a fresh accepted PC policy before updating"
	}
	idle, err := classifiedGamesIdle(games)
	if err != nil || !idle {
		return "deferred", "A classified game may still be running; close games before updating"
	}
	dir := filepath.Join(e.dir, "updates")
	pending, _, err := readRelease(dir, "pending.json")
	if err != nil {
		return "deferred", "No verified update is staged"
	}
	floor := bundledSequence
	if active, _, err := readRelease(dir, "active.json"); err == nil && active.Sequence > floor {
		floor = active.Sequence
	}
	if pending.Sequence <= floor {
		return "deferred", "No newer verified update is staged"
	}
	if err := e.save(); err != nil {
		return "deferred", "Could not save usage before restart"
	}
	manifest, err := os.ReadFile(filepath.Join(dir, "pending.json"))
	if err != nil {
		return "deferred", "Could not preserve the verified update request"
	}
	selected, err := verifyRelease(manifest)
	if err != nil || selected.Sequence != pending.Sequence || selected.SHA256 != pending.SHA256 {
		return "deferred", "Staged update changed during the request"
	}
	if err := os.WriteFile(filepath.Join(dir, "activation.json.tmp"), manifest, 0600); err != nil {
		return "deferred", "Could not preserve the verified update request"
	}
	if err := os.Rename(filepath.Join(dir, "activation.json.tmp"), filepath.Join(dir, "activation.json")); err != nil {
		return "deferred", "Could not preserve the verified update request"
	}
	return "restart_requested", "Verified update restart requested; installation awaits a new version heartbeat"
}

// Caller holds e.mu. Empty rules are meaningful only with a recent accepted
// server policy; cached or expired family state cannot prove the PC is idle.
func (e *Engine) activationGameRules(now time.Time) (map[string]bool, bool) {
	games := map[string]bool{}
	for _, rule := range e.Ledger.Policy.Rules {
		if rule.Category == "game" && !protected[rule.Executable] {
			games[rule.Executable] = true
		}
	}
	fresh := !e.LastPolicy.IsZero() && !now.Before(e.LastPolicy) && now.Sub(e.LastPolicy) <= 2*time.Minute && e.Ledger.Policy.Day == dayOf(now)
	if f := e.Ledger.Policy.FamilyPolicy; f != nil && f.Enabled {
		_, _, reason := e.familyState(now)
		if reason == "Family policy expired or unavailable" {
			fresh = false
		}
	}
	return games, fresh
}
func boundedReason(s string) string {
	r := []rune(s)
	if len(r) > 200 {
		return string(r[:200])
	}
	return s
}
func (e *Engine) updateState() string {
	dir := filepath.Join(e.dir, "updates")
	if _, _, err := readRelease(dir, "pending.json"); err == nil {
		return "Verified update staged; waiting for fresh policy and no running games"
	}
	if _, _, err := readRelease(dir, "active.json"); err == nil {
		return "Verified update active"
	}
	return "Bundled app running; no verified staged update"
}
func (e *Engine) checkMaintenanceUpdate(n *Network) (string, string) {
	dir := filepath.Join(e.dir, "updates")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "failed", "Could not prepare update storage"
	}
	floor := bundledSequence
	if active, _, err := readRelease(dir, "active.json"); err == nil && active.Sequence > floor {
		floor = active.Sequence
	}
	if err := stageRelease(n, dir, floor); err != nil {
		return "failed", "Signed update check or staging failed"
	}
	if pending, _, err := readRelease(dir, "pending.json"); err == nil && pending.Sequence > floor {
		return "staged", "Verified update staged; waiting for fresh policy and no running games"
	}
	return "current", "No newer signed update available"
}

// The native HUD can confirm that it showed the demo. Other platforms or a
// locked desktop report only a request, never a claim of visibility.
func (e *Engine) requestDemoCountdown() string {
	e.mu.Lock()
	e.demoCountdownUntil = time.Now().Add(10 * time.Second)
	e.demoHUDDisplayed = false
	e.mu.Unlock()
	time.Sleep(750 * time.Millisecond)
	e.mu.Lock()
	shown := e.demoHUDDisplayed
	e.mu.Unlock()
	if shown {
		return "displayed"
	}
	return "requested"
}
