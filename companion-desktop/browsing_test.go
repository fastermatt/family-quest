package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestEmitBrowseContractFixture(t *testing.T) {
	visitedAt := time.Date(2026, 11, 11, 17, 59, 0, 123456000, time.UTC)
	inputs := []struct {
		browser, profile, rawURL, title string
	}{
		{"edge", "Default", "https://WWW.EXAMPLE.COM:443/Some%20Page?query=private#fragment", "Example page"},
		{"chrome", "Profile 2", "https://www.youtube.com:443/watch?v=abcdefghijk&list=private#section", "A YouTube lesson"},
		{"edge", "Profile 1", "https://m.reddit.com/r/example?token=private", "Reddit"},
	}
	entries := make([]BrowseEntry, 0, len(inputs))
	for _, input := range inputs {
		entry, ok := makeBrowseEntry(input.browser, input.profile, input.rawURL, input.title, visitedAt, 1_500_000)
		if !ok {
			t.Fatalf("valid fixture rejected: %s", input.rawURL)
		}
		entries = append(entries, entry)
	}
	batch := BrowseBatch{
		Day: "2026-11-11", Entries: entries,
		Coverage: BrowseCoverage{
			Status: "complete", SupportedBrowsers: []string{"edge", "chrome"}, ProfilesPerBrowser: 8, VisitLimit: 2000,
			Browsers: []BrowseBrowserCoverage{
				{Browser: "edge", Installed: true, ProfilesDiscovered: 2, ProfilesRead: 2, VisitsReported: 2},
				{Browser: "chrome", Installed: true, ProfilesDiscovered: 1, ProfilesRead: 1, VisitsReported: 1},
			},
		},
	}
	encoded, err := json.Marshal(batch)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("BROWSE_CONTRACT_JSON=%s\n", encoded)
}

func TestSafeBrowseURLDropsQueriesAndKeepsOnlyCanonicalYouTubeID(t *testing.T) {
	domain, safe, ok := safeBrowseURL("https://www.youtube.com/watch?v=abcdefghijk&list=private#fragment")
	if !ok || domain != "youtube.com" || safe != "https://www.youtube.com/watch?v=abcdefghijk" {
		t.Fatalf("unexpected canonical YouTube URL: %q %q %v", domain, safe, ok)
	}
	domain, safe, ok = safeBrowseURL("https://example.com/search?q=private#fragment")
	if !ok || domain != "example.com" || safe != "https://example.com/search" || strings.Contains(safe, "private") {
		t.Fatalf("sensitive query was retained: %q %q %v", domain, safe, ok)
	}
}

func TestSafeBrowseURLRejectsCredentialsAndPrivateHosts(t *testing.T) {
	for _, raw := range []string{
		"https://user:password@example.com/path",
		"http://192.168.1.1/admin",
		"http://router.local/",
		"file:///C:/Users/Child/private.txt",
	} {
		if _, _, ok := safeBrowseURL(raw); ok {
			t.Fatalf("unsafe URL accepted: %s", raw)
		}
	}
}

func TestBrowseEntriesUseUTCAndNeverInventVisitDuration(t *testing.T) {
	local := time.Date(2026, 11, 11, 11, 12, 13, 123456000, denver)
	e, ok := makeBrowseEntry("edge", "Default", "https://example.com/page?secret=value", "Example\npage https://example.com/title?token=secret", local, 0)
	if !ok {
		t.Fatal("valid public web visit rejected")
	}
	if e.VisitedAt.Location() != time.UTC || e.VisitedAt.Nanosecond() != 123456000 {
		t.Fatalf("visit timestamp was not preserved in UTC: %s", e.VisitedAt)
	}
	if e.DurationSeconds != nil {
		t.Fatalf("zero duration was fabricated: %v", *e.DurationSeconds)
	}
	if e.URL != "https://example.com/page" || strings.Contains(e.URL, "secret") {
		t.Fatalf("query was retained in upload URL: %s", e.URL)
	}
	if strings.ContainsAny(e.Title, "\n\r") {
		t.Fatalf("title controls were retained: %q", e.Title)
	}
	if strings.Contains(e.Title, "token=secret") || !strings.Contains(e.Title, "https://example.com/title") {
		t.Fatalf("title URL query was not scrubbed: %q", e.Title)
	}
}

func TestFitBrowseBatchEnforcesVisitAndByteBounds(t *testing.T) {
	entries := make([]BrowseEntry, maxBrowseVisitsPerDay)
	largeDomain := strings.Repeat("a", 249) + ".com"
	largePath := "/" + strings.Repeat("p", 511)
	for i := range entries {
		browser := "edge"
		if i%2 == 1 {
			browser = "chrome"
		}
		entries[i] = BrowseEntry{
			ID: strings.Repeat("a", 64), Browser: browser, Profile: "Default",
			Domain: largeDomain, Category: "other", Title: strings.Repeat("t", 120),
			URL:             "https://" + largeDomain + largePath,
			VisitedAt:       time.Date(2026, 11, 11, 0, 0, i%60, i*1000, time.UTC),
			DurationSeconds: nil,
		}
	}
	batch := BrowseBatch{
		Day: "2026-11-11", Entries: entries,
		Coverage: BrowseCoverage{
			Status: "complete", SupportedBrowsers: []string{"edge", "chrome"}, ProfilesPerBrowser: 8, VisitLimit: 2000,
			Browsers: []BrowseBrowserCoverage{
				{Browser: "edge", Installed: true, ProfilesDiscovered: 1, ProfilesRead: 1, VisitsReported: 1000},
				{Browser: "chrome", Installed: true, ProfilesDiscovered: 1, ProfilesRead: 1, VisitsReported: 1000},
			},
		},
	}
	fitted := fitBrowseBatch(batch)
	encoded, err := json.Marshal(fitted)
	if err != nil {
		t.Fatal(err)
	}
	if len(fitted.Entries) > maxBrowseVisitsPerDay || len(encoded) > maxBrowseUploadBytes || len(encoded) > 512*1024 {
		t.Fatalf("browse batch exceeded upload limits: visits=%d bytes=%d", len(fitted.Entries), len(encoded))
	}
	if fitted.Coverage.Status != "partial" {
		t.Fatalf("truncated batch reported complete coverage: %+v", fitted.Coverage)
	}
	totalReported := 0
	for _, browser := range fitted.Coverage.Browsers {
		totalReported += browser.VisitsReported
	}
	if totalReported != len(fitted.Entries) {
		t.Fatalf("coverage count %d does not match entries %d", totalReported, len(fitted.Entries))
	}
}
