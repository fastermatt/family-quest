package main

import (
	"net"
	"sort"
	"strings"
	"time"
)

const (
	maxDomainsPerUpload = 200  // matches the server's cap
	maxTrackedNames     = 5000 // memory/disk cap on the PC; the long tail folds into "other"
)

// cleanName keeps real internet names and drops local plumbing:
// names without a dot, .local/.lan/.home, reverse lookups, IPs, service labels.
func cleanName(s string) (string, bool) {
	s = strings.ToLower(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(s), ".")))
	if s == "" || len(s) > 253 || !strings.Contains(s, ".") || net.ParseIP(s) != nil {
		return "", false
	}
	for _, bad := range []string{".local", ".lan", ".home", ".internal", ".localdomain", ".arpa"} {
		if strings.HasSuffix(s, bad) {
			return "", false
		}
	}
	if strings.HasPrefix(s, "_") || strings.Contains(s, "._") || strings.HasPrefix(s, "wpad.") {
		return "", false
	}
	for _, r := range s {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '.' || r == '-') {
			return "", false
		}
	}
	return s, true
}

type DomainCount struct {
	D string `json:"d"`
	N int    `json:"n"`
}

// Pending is what the PC has seen since the last successful upload.
type Pending struct {
	PeriodStart time.Time      `json:"periodStart"`
	Counts      map[string]int `json:"counts"`
	Other       int            `json:"other"`
}

func newPending(now time.Time) *Pending {
	return &Pending{PeriodStart: now.UTC(), Counts: map[string]int{}}
}

// Sample records one look at the DNS cache. A name counts once per look.
func (p *Pending) Sample(names []string) {
	seen := map[string]bool{}
	for _, raw := range names {
		n, ok := cleanName(raw)
		if !ok || seen[n] {
			continue
		}
		seen[n] = true
		if _, known := p.Counts[n]; !known && len(p.Counts) >= maxTrackedNames {
			p.Other++
			continue
		}
		p.Counts[n]++
	}
}

// Payload is the upload body: top domains, everything else folded into other.
func (p *Pending) Payload(end time.Time) map[string]any {
	list := make([]DomainCount, 0, len(p.Counts))
	for d, n := range p.Counts {
		list = append(list, DomainCount{d, n})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].N != list[j].N {
			return list[i].N > list[j].N
		}
		return list[i].D < list[j].D
	})
	other := p.Other
	if len(list) > maxDomainsPerUpload {
		for _, x := range list[maxDomainsPerUpload:] {
			other += x.N
		}
		list = list[:maxDomainsPerUpload]
	}
	return map[string]any{
		"periodStart": p.PeriodStart.Format(time.RFC3339),
		"periodEnd":   end.UTC().Format(time.RFC3339),
		"domains":     list,
		"other":       other,
	}
}
