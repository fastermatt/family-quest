//go:build windows

package main

import (
	"context"
	"database/sql"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Chromium stores visit_time as microseconds since Jan 1, 1601 (Windows FILETIME).
const chromeEpochMicros = int64(11644473600 * 1_000_000)
const maxBrowseVisitsPerProfile = maxBrowseVisitsPerDay + 1

var chromiumProfileName = regexp.MustCompile(`^Profile ([1-9][0-9]*)$`)

type historySource struct {
	path    string
	browser string
	profile string
}

func discoverHistorySources(local string) ([]historySource, []BrowseBrowserCoverage) {
	roots := []struct{ browser, path string }{
		{"edge", filepath.Join(local, "Microsoft", "Edge", "User Data")},
		{"chrome", filepath.Join(local, "Google", "Chrome", "User Data")},
	}
	var sources []historySource
	coverage := make([]BrowseBrowserCoverage, 0, len(roots))
	for _, root := range roots {
		bc := BrowseBrowserCoverage{Browser: root.browser}
		info, err := os.Stat(root.path)
		if err != nil || !info.IsDir() {
			coverage = append(coverage, bc)
			continue
		}
		bc.Installed = true
		profiles, err := os.ReadDir(root.path)
		if err != nil {
			bc.ProfilesSkipped = 1
			coverage = append(coverage, bc)
			continue
		}
		accepted := make([]string, 0, maxBrowseProfilesPerBrowser+1)
		discovered := 0
		profileOverflow := false
		for _, profile := range profiles {
			if !profile.IsDir() {
				continue
			}
			name := profile.Name()
			if name == "Default" {
				discovered++
				if len(accepted) < 500 {
					accepted = append(accepted, name)
				} else {
					profileOverflow = true
				}
			} else if chromiumProfileName.MatchString(name) {
				discovered++
				if len(accepted) < 500 {
					accepted = append(accepted, name)
				} else {
					profileOverflow = true
				}
			}
		}
		sort.Slice(accepted, func(i, j int) bool {
			if accepted[i] == "Default" {
				return true
			}
			if accepted[j] == "Default" {
				return false
			}
			a, _ := strconv.Atoi(strings.TrimPrefix(accepted[i], "Profile "))
			b, _ := strconv.Atoi(strings.TrimPrefix(accepted[j], "Profile "))
			return a < b
		})
		bc.ProfilesDiscovered = discovered
		if profileOverflow {
			bc.ProfilesDiscovered = 500
			bc.ProfilesSkipped = bc.ProfilesDiscovered - maxBrowseProfilesPerBrowser
			bc.Truncated = true
		} else if len(accepted) > maxBrowseProfilesPerBrowser {
			bc.ProfilesSkipped += len(accepted) - maxBrowseProfilesPerBrowser
		}
		if len(accepted) > maxBrowseProfilesPerBrowser {
			accepted = accepted[:maxBrowseProfilesPerBrowser]
		}
		for _, profile := range accepted {
			label := profile
			if profile != "Default" {
				label = "Profile " + strings.TrimPrefix(profile, "Profile ")
			}
			sources = append(sources, historySource{filepath.Join(root.path, profile, "History"), root.browser, label})
		}
		coverage = append(coverage, bc)
	}
	return sources, coverage
}

func readHistoryDB(src historySource, since, until int64) ([]BrowseEntry, bool, error) {
	path := (&url.URL{Scheme: "file", Path: filepath.ToSlash(src.path)}).String()
	db, err := sql.Open("sqlite", path+"?mode=ro&_busy_timeout=1500")
	if err != nil {
		return nil, false, err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := db.QueryContext(ctx, `
		SELECT u.url, u.title, v.visit_time, v.visit_duration
		FROM visits v
		JOIN urls u ON v.url = u.id
		WHERE v.visit_time >= ? AND v.visit_time <= ?
		  AND u.url NOT LIKE 'chrome://%'
		  AND u.url NOT LIKE 'edge://%'
		  AND u.url NOT LIKE 'about:%'
		  AND u.url NOT LIKE 'data:%'
		ORDER BY v.visit_time DESC
		LIMIT ?
	`, since, until, maxBrowseVisitsPerProfile)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	visits := make([]BrowseEntry, 0, 64)
	truncated := false
	scanned := 0
	for rows.Next() {
		var rawURL, title string
		var visitTime, visitDuration int64
		if err := rows.Scan(&rawURL, &title, &visitTime, &visitDuration); err != nil {
			continue
		}
		scanned++
		if scanned > maxBrowseVisitsPerDay {
			truncated = true
			break
		}
		unixMicros := visitTime - chromeEpochMicros
		visitedAt := time.Unix(unixMicros/1_000_000, (unixMicros%1_000_000)*1_000).UTC()
		entry, ok := makeBrowseEntry(src.browser, src.profile, rawURL, title, visitedAt, visitDuration)
		if ok {
			visits = append(visits, entry)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, truncated, err
	}
	return visits, truncated, nil
}

func browseMidnight(t time.Time) time.Time {
	local := t.In(denver)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, denver)
}

func collectBrowseHistory() BrowseBatch {
	now := time.Now().UTC()
	day := dayOf(now)
	since := browseMidnight(now).Unix()*1_000_000 + chromeEpochMicros
	until := now.Unix()*1_000_000 + int64(now.Nanosecond()/1_000) + chromeEpochMicros
	sources, browserCoverage := discoverHistorySources(os.Getenv("LOCALAPPDATA"))
	coverage := BrowseCoverage{
		Status: "complete", SupportedBrowsers: []string{"edge", "chrome"},
		ProfilesPerBrowser: maxBrowseProfilesPerBrowser, VisitLimit: maxBrowseVisitsPerDay,
		Browsers: browserCoverage,
	}
	installed := false
	for _, browser := range coverage.Browsers {
		installed = installed || browser.Installed
		if browser.ProfilesSkipped > 0 {
			coverage.Status = "partial"
		}
	}
	if !installed {
		coverage.Status = "unavailable"
	}
	entries := make([]BrowseEntry, 0, 256)
	for _, src := range sources {
		if _, err := os.Stat(src.path); err != nil {
			markProfileSkipped(&coverage, src.browser)
			continue
		}
		visits, truncated, err := readHistoryDB(src, since, until)
		if err != nil {
			markProfileSkipped(&coverage, src.browser)
			continue
		}
		markProfileRead(&coverage, src.browser)
		if truncated {
			markBrowserTruncated(&coverage, src.browser)
		}
		entries = append(entries, visits...)
	}
	return fitBrowseBatch(BrowseBatch{Day: day, Entries: entries, Coverage: coverage})
}
