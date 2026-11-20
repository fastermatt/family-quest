package main

import (
	"fmt"
	"time"
)

// familyLease validates a received policy before it can be acknowledged or used.
// The saved receipt time also prevents a restart from renewing an old lease.
func familyLease(p Policy, received, requestStarted time.Time) (time.Time, error) {
	f := p.FamilyPolicy
	if f == nil {
		return time.Time{}, nil
	}
	if f.Revision < 0 || f.Day != p.Day || f.Day != dayOf(received) || f.Timezone != "America/Denver" || requestStarted.IsZero() || requestStarted.After(received) {
		return time.Time{}, fmt.Errorf("invalid family policy")
	}
	serverTime, err := time.Parse(time.RFC3339, p.ServerTime)
	if err != nil || received.Sub(serverTime) > 2*time.Minute || serverTime.Sub(received) > 2*time.Minute || dayOf(serverTime) != f.Day {
		return time.Time{}, fmt.Errorf("invalid family server time")
	}
	if !f.Enabled {
		if f.Allowed {
			return time.Time{}, fmt.Errorf("disabled family policy grants games")
		}
		return time.Time{}, nil
	}
	if p.PolicyLeaseSeconds == nil || *p.PolicyLeaseSeconds < 1 || *p.PolicyLeaseSeconds > 900 || p.Settings.GamingMinutes == nil || *p.Settings.GamingMinutes < 0 {
		return time.Time{}, fmt.Errorf("invalid enabled family policy")
	}
	expires, err := time.Parse(time.RFC3339, f.ExpiresAt)
	if err != nil || !expires.After(serverTime) || expires.After(serverTime.Add(900*time.Second)) || (f.Allowed && !f.Eligible) {
		return time.Time{}, fmt.Errorf("invalid family policy lease")
	}
	// Spend request transit time rather than extending the server's window.
	localExpiry := requestStarted.Add(expires.Sub(serverTime))
	leaseExpiry := requestStarted.Add(time.Duration(*p.PolicyLeaseSeconds) * time.Second)
	if leaseExpiry.Before(localExpiry) {
		localExpiry = leaseExpiry
	}
	if !localExpiry.After(received) {
		return time.Time{}, fmt.Errorf("family policy lease elapsed in transit")
	}
	return localExpiry, nil
}

// Caller holds e.mu. Once this PC has seen the family protocol, a missing
// object is a rollback, not an opt-out. Revisions only move forward.
func (e *Engine) validateFamilyTransition(p Policy) error {
	f := p.FamilyPolicy
	if f == nil {
		if e.Ledger.FamilySeen {
			return fmt.Errorf("family policy missing after previous family configuration")
		}
		return nil
	}
	if e.Ledger.FamilySeen && f.Revision < e.Ledger.FamilyRevision {
		return fmt.Errorf("stale family policy revision")
	}
	previous := e.Ledger.Policy.FamilyPolicy
	if previous != nil && previous.Enabled != f.Enabled && f.Revision <= previous.Revision {
		return fmt.Errorf("family mode change requires a newer revision")
	}
	return nil
}

// Caller holds e.mu. A family policy is authoritative only during its saved
// lease and on its Denver day. An unavailable or invalid lease blocks games.
func (e *Engine) familyState(now time.Time) (enabled, allowed bool, reason string) {
	f := e.Ledger.Policy.FamilyPolicy
	if f == nil || !f.Enabled {
		return false, false, ""
	}
	received := e.Ledger.PolicyAcceptedAt
	expires, err := familyLease(e.Ledger.Policy, received, e.Ledger.PolicyRequestStartedAt)
	if err != nil || received.IsZero() || e.LastPolicy.IsZero() || now.Before(received) || dayOf(now) != f.Day || !now.Before(expires) {
		return true, false, "Family policy expired or unavailable"
	}
	if !f.Allowed || !f.Eligible || e.Ledger.Policy.Settings.Paused {
		return true, false, f.Reason
	}
	return true, true, f.Reason
}
