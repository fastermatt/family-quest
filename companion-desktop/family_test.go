package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func familyEngine(t *testing.T, allowed bool) (*Engine, time.Time) {
	t.Helper()
	e := testEngine(t)
	now := time.Now().UTC()
	lease, cap := 900, 10
	e.Ledger.Policy = Policy{ClientID: "pc", ServerTime: now.Format(time.RFC3339), Day: dayOf(now), Settings: Settings{GamingMinutes: &cap, Mode: "close"}, Rules: []Rule{{Executable: "game.exe", Category: "game"}, {Executable: "other.exe", Category: "game"}, {Executable: "msedge.exe", Category: "school"}}, FamilyPolicy: &FamilyPolicy{Enabled: true, Revision: 2, Day: dayOf(now), Timezone: "America/Denver", Eligible: allowed, Allowed: allowed, Reason: "Responsibilities incomplete", ExpiresAt: now.Add(10 * time.Minute).Format(time.RFC3339)}, PolicyLeaseSeconds: &lease}
	e.Ledger.PolicyAcceptedAt, e.Ledger.PolicyRequestStartedAt, e.LastPolicy = now, now, now
	e.Ledger.FamilySeen, e.Ledger.FamilyRevision = true, 2
	return e, now
}

func TestFamilyProtocolRejectsMissingAndStaleRevision(t *testing.T) {
	e, now := familyEngine(t, true)
	legacy := e.Ledger.Policy
	legacy.FamilyPolicy = nil
	if err := e.validateFamilyTransition(legacy); err == nil {
		t.Fatal("omitted family policy accepted")
	}
	stale := e.Ledger.Policy
	f := *stale.FamilyPolicy
	f.Revision = 1
	stale.FamilyPolicy = &f
	if err := e.validateFamilyTransition(stale); err == nil {
		t.Fatal("stale revision accepted")
	}
	disabled := e.Ledger.Policy
	f.Enabled, f.Allowed, f.Revision = false, false, 2
	disabled.FamilyPolicy = &f
	if _, err := familyLease(disabled, now, now); err != nil {
		t.Fatal(err)
	}
	if err := e.validateFamilyTransition(disabled); err == nil {
		t.Fatal("same-revision disable accepted")
	}
	f.Revision = 3
	if err := e.validateFamilyTransition(disabled); err != nil {
		t.Fatal(err)
	}
	if err := e.save(); err != nil {
		t.Fatal(err)
	}
	restarted, err := newEngine(e.dir, Account{}, true)
	if err != nil {
		t.Fatal(err)
	}
	if err := restarted.validateFamilyTransition(legacy); err == nil {
		t.Fatal("restart forgot family protocol")
	}
}

func TestLegacyBeforeFamilyRemainsCompatible(t *testing.T) {
	e := testEngine(t)
	if err := e.validateFamilyTransition(Policy{}); err != nil {
		t.Fatal(err)
	}
}

func TestFamilyPolicyJSONRoundTripAndValidation(t *testing.T) {
	e, now := familyEngine(t, true)
	b, err := json.Marshal(e.Ledger.Policy)
	if err != nil {
		t.Fatal(err)
	}
	var p Policy
	if err := json.Unmarshal(b, &p); err != nil {
		t.Fatal(err)
	}
	if _, err := familyLease(p, now, now); err != nil || p.FamilyPolicy.Revision != 2 {
		t.Fatal(err, p.FamilyPolicy)
	}
	p.FamilyPolicy.ExpiresAt = now.Add(901 * time.Second).Format(time.RFC3339)
	if _, err := familyLease(p, now, now); err == nil {
		t.Fatal("future lease accepted")
	}
	p.FamilyPolicy.ExpiresAt = now.Add(10 * time.Minute).Format(time.RFC3339)
	p.FamilyPolicy.Day = "2020-01-01"
	if _, err := familyLease(p, now, now); err == nil {
		t.Fatal("wrong day accepted")
	}
}

func TestFamilyLeaseSpendsRequestTransitTime(t *testing.T) {
	e, now := familyEngine(t, true)
	e.Ledger.Policy.FamilyPolicy.ExpiresAt = now.Add(30 * time.Second).Format(time.RFC3339)
	start := now.Add(-5 * time.Second)
	expires, err := familyLease(e.Ledger.Policy, now, start)
	if err != nil || !expires.Equal(now.Add(25*time.Second)) {
		t.Fatal(expires, err)
	}
	e.Ledger.PolicyRequestStartedAt = start
	if _, allowed, _ := e.familyState(now.Add(26 * time.Second)); allowed {
		t.Fatal("transit extended permission")
	}
}

func TestFamilyLocalExhaustionReason(t *testing.T) {
	e, now := familyEngine(t, true)
	e.Ledger.Policy.FamilyPolicy.Reason = "Game time is ready in the PC pilot."
	e.Ledger.Totals["game.exe"] = 600
	game := Observation{Executable: "game.exe", Available: true}
	e.enforce(game, now)
	if !strings.Contains(e.Action, "used up") {
		t.Fatal(e.Action)
	}
	e.Current, e.before = "game.exe", game
	if c := e.countdown(now); !strings.Contains(c.Detail, "used up") {
		t.Fatal(c)
	}
}

func TestBackgroundGameDoesNotCloseSchoolOrConsumeSaveWindow(t *testing.T) {
	e, now := familyEngine(t, false)
	e.Ledger.Policy.Rules = append(e.Ledger.Policy.Rules, Rule{Executable: "school.exe", Category: "school"})
	e.Ledger.Policy.Settings.BlockedExecutables = []string{"school.exe"}
	background := Observation{Executable: "game.exe", Available: true, PID: 42, BackgroundGame: true}
	e.enforce(background, now)
	if !e.Ledger.FamilyCloseDeadline.IsZero() {
		t.Fatal("background game consumed warning")
	}
	e.before = background
	if c := e.countdown(now); c.Visible {
		t.Fatal("overlay interrupted school", c)
	}
	e.enforce(Observation{Executable: "school.exe", Available: true, PID: 43}, now)
	if !e.Ledger.FamilyCloseDeadline.IsZero() {
		t.Fatal("school app was limited")
	}
	e.enforce(Observation{Executable: "game.exe", Available: true, PID: 42}, now.Add(time.Second))
	if e.Ledger.FamilyCloseDeadline.IsZero() {
		t.Fatal("foreground game lacked warning")
	}
}

func TestFractionalEarnedMinutesRoundTrip(t *testing.T) {
	var settings Settings
	if err := json.Unmarshal([]byte(`{"gaming_minutes":1.5,"paused":false,"mode":"close"}`), &settings); err != nil {
		t.Fatal(err)
	}
	if settings.GamingSeconds == nil || *settings.GamingSeconds != 90 {
		t.Fatal(settings)
	}
	b, err := json.Marshal(settings)
	if err != nil {
		t.Fatal(err)
	}
	var restored Settings
	if err := json.Unmarshal(b, &restored); err != nil || restored.GamingSeconds == nil || *restored.GamingSeconds != 90 {
		t.Fatal(string(b), restored, err)
	}
}

func TestFamilyAllowedBlockedExpiredAndSchool(t *testing.T) {
	e, now := familyEngine(t, true)
	if left, limited := e.remainingAt("game.exe", now); !limited || left != 600 {
		t.Fatal(left, limited)
	}
	if _, limited := e.remainingAt("msedge.exe", now); limited {
		t.Fatal("school limited")
	}
	e.Ledger.Policy.FamilyPolicy.Allowed = false
	if left, limited := e.remainingAt("game.exe", now); !limited || left != 0 {
		t.Fatal(left, limited)
	}
	e.Ledger.Policy.FamilyPolicy.Allowed = true
	if left, limited := e.remainingAt("game.exe", now.Add(11*time.Minute)); !limited || left != 0 {
		t.Fatal("expired family lease allowed", left, limited)
	}
	e.Ledger.Policy.Settings.Paused = false
	e.Ledger.Totals["game.exe"] = 600
	if left, limited := e.remainingAt("other.exe", now); !limited || left != 0 {
		t.Fatal("shared grant reset", left, limited)
	}
}

func TestFamilyRestartAndSwitchDoNotRenewGrace(t *testing.T) {
	e, now := familyEngine(t, false)
	game := Observation{Executable: "game.exe", Available: true}
	e.enforce(game, now)
	deadline := e.Ledger.FamilyCloseDeadline
	if deadline.IsZero() {
		t.Fatal("no warning")
	}
	e.enforce(Observation{Executable: "other.exe", Available: true}, now.Add(5*time.Second))
	if !e.Ledger.FamilyCloseDeadline.Equal(deadline) {
		t.Fatal("switch renewed warning")
	}
	if err := e.save(); err != nil {
		t.Fatal(err)
	}
	restarted, err := newEngine(e.dir, Account{}, true)
	if err != nil {
		t.Fatal(err)
	}
	if !restarted.Ledger.FamilyCloseDeadline.Equal(deadline) {
		t.Fatal("deadline lost")
	}
	if enabled, allowed, _ := restarted.familyState(now.Add(6 * time.Second)); !enabled || allowed {
		t.Fatal("cached policy trusted after restart")
	}
	restarted.enforce(game, now.Add(7*time.Second))
	if !restarted.Ledger.FamilyCloseDeadline.Equal(deadline) {
		t.Fatal("restart renewed warning")
	}
}

func TestPolicyHeadersOnlyAcknowledgeAcceptedLease(t *testing.T) {
	var version, revision string
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		version, revision = r.Header.Get("X-ChoreZap-Version"), r.Header.Get("X-ChoreZap-Policy-Revision")
		w.Write([]byte(`{"ok":true}`))
	}))
	defer s.Close()
	n := &Network{bootstrap: Bootstrap{Server: s.URL}, client: s.Client()}
	if _, err := n.request("/", "", nil, nil); err != nil || version != appVersion || revision != "" {
		t.Fatal(version, revision, err)
	}
	n.acceptRevision(7, time.Now().Add(time.Minute))
	if _, err := n.request("/", "", nil, nil); err != nil || revision != strconv.Itoa(7) {
		t.Fatal(revision, err)
	}
	n.acceptRevision(0, time.Now().Add(time.Minute))
	if _, err := n.request("/", "", nil, nil); err != nil || revision != "0" {
		t.Fatal("initial revision not acknowledged", revision, err)
	}
	n.acceptRevision(7, time.Now().Add(-time.Second))
	if _, err := n.request("/", "", nil, nil); err != nil || revision != "" {
		t.Fatal(revision, err)
	}
}
