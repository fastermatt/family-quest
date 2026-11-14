package main

import (
	"testing"
	"time"
)

func TestCleanName(t *testing.T) {
	ok := map[string]string{"Example.COM.": "example.com", " cdn.tiktok.com ": "cdn.tiktok.com", "a-b.co.uk": "a-b.co.uk"}
	for in, want := range ok {
		if got, good := cleanName(in); !good || got != want {
			t.Errorf("cleanName(%q) = %q,%v want %q", in, got, good, want)
		}
	}
	for _, in := range []string{"", "localhost", "printer.local", "10.0.0.5", "1.0.0.127.in-addr.arpa", "_ldap._tcp.dc.example.com", "wpad.home.lan", "bad name.com", "ünï.com", "x"} {
		if got, good := cleanName(in); good {
			t.Errorf("cleanName(%q) accepted as %q", in, got)
		}
	}
}

func TestSampleCountsOncePerLook(t *testing.T) {
	p := newPending(time.Now())
	p.Sample([]string{"a.com", "A.com.", "b.net", "printer.local", "a.com"})
	p.Sample([]string{"a.com"})
	if p.Counts["a.com"] != 2 || p.Counts["b.net"] != 1 || len(p.Counts) != 2 {
		t.Errorf("counts wrong: %v", p.Counts)
	}
}

func TestPayloadTopAndOther(t *testing.T) {
	p := newPending(time.Date(2026, 10, 22, 19, 0, 0, 0, time.UTC))
	for i := 0; i < 250; i++ {
		p.Counts[fakeName(i)] = 250 - i
	}
	p.Other = 7
	pl := p.Payload(time.Date(2026, 10, 22, 20, 0, 0, 0, time.UTC))
	doms := pl["domains"].([]DomainCount)
	if len(doms) != maxDomainsPerUpload || doms[0].N != 250 {
		t.Fatalf("top list wrong: %d first=%v", len(doms), doms[0])
	}
	folded := 0
	for i := 200; i < 250; i++ {
		folded += 250 - i
	}
	if pl["other"].(int) != 7+folded {
		t.Errorf("other = %v want %d", pl["other"], 7+folded)
	}
	if pl["periodStart"] != "2026-10-22T19:00:00Z" || pl["periodEnd"] != "2026-10-22T20:00:00Z" {
		t.Errorf("times wrong: %v %v", pl["periodStart"], pl["periodEnd"])
	}
}

func TestTrackedNamesCapFoldsIntoOther(t *testing.T) {
	p := newPending(time.Now())
	for i := 0; i < maxTrackedNames; i++ {
		p.Counts[fakeName(i)] = 1
	}
	p.Sample([]string{"brand-new-site.com", fakeName(3)})
	if _, has := p.Counts["brand-new-site.com"]; has || p.Other != 1 || p.Counts[fakeName(3)] != 2 {
		t.Errorf("cap not applied: other=%d", p.Other)
	}
}

func fakeName(i int) string {
	const letters = "abcdefghij"
	return string([]byte{letters[i%10], letters[(i/10)%10], letters[(i/100)%10], letters[(i/1000)%10]}) + ".example.com"
}
