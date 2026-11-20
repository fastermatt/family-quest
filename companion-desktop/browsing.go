package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	maxBrowseProfilesPerBrowser = 8
	maxBrowseVisitsPerDay       = 2000
	maxBrowseUploadBytes        = 480 * 1024
)

var youtubeVideoID = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
var sensitivePathPart = regexp.MustCompile(`(?i)(token|password|passwd|secret|session|reset|auth|credential|private.?key)`)
var asciiDomain = regexp.MustCompile(`^[a-z0-9.-]+$`)
var titleURL = regexp.MustCompile(`(?i)https?://[^\s"'<>]+`)

type BrowseEntry struct {
	ID              string    `json:"id"`
	Browser         string    `json:"browser"`
	Profile         string    `json:"profile"`
	Domain          string    `json:"domain"`
	Category        string    `json:"category"`
	Title           string    `json:"title,omitempty"`
	URL             string    `json:"url"`
	VisitedAt       time.Time `json:"visitedAt"`
	DurationSeconds *float64  `json:"durationSeconds"`
	// Seconds remains for the old aggregate wire format. New visits never set it.
	Seconds float64 `json:"seconds,omitempty"`
}

type BrowseBrowserCoverage struct {
	Browser            string `json:"browser"`
	Installed          bool   `json:"installed"`
	ProfilesDiscovered int    `json:"profilesDiscovered"`
	ProfilesRead       int    `json:"profilesRead"`
	ProfilesSkipped    int    `json:"profilesSkipped"`
	VisitsReported     int    `json:"visitsReported"`
	Truncated          bool   `json:"truncated"`
}

type BrowseCoverage struct {
	Status             string                  `json:"status"`
	SupportedBrowsers  []string                `json:"supportedBrowsers"`
	ProfilesPerBrowser int                     `json:"profilesPerBrowser"`
	VisitLimit         int                     `json:"visitLimit"`
	Browsers           []BrowseBrowserCoverage `json:"browsers"`
}

type BrowseBatch struct {
	Day      string         `json:"day"`
	Entries  []BrowseEntry  `json:"entries"`
	Coverage BrowseCoverage `json:"coverage"`
}

func safeBrowseURL(raw string) (domain, safeURL string, ok bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
		return "", "", false
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if !asciiDomain.MatchString(host) || !strings.Contains(host, ".") || host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") || strings.HasSuffix(host, ".home") || strings.HasSuffix(host, ".lan") || strings.HasSuffix(host, ".corp") {
		return "", "", false
	}
	if ip := net.ParseIP(host); ip != nil && (ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()) {
		return "", "", false
	}
	if port := u.Port(); port != "" && port != "80" && port != "443" {
		return "", "", false
	}
	domain = strings.TrimPrefix(host, "www.")
	path := u.EscapedPath()
	if path == "" {
		path = "/"
	}
	if sensitivePathPart.MatchString(path) {
		path = "/"
	}
	if len(path) > 512 {
		path = "/"
	}
	if domain == "youtube.com" && path == "/watch" {
		if id := u.Query().Get("v"); youtubeVideoID.MatchString(id) {
			return domain, "https://www.youtube.com/watch?v=" + id, true
		}
	}
	// All other query parameters and fragments are deliberately discarded.
	return domain, strings.ToLower(u.Scheme) + "://" + host + path, true
}

func browseCategory(domain string) string {
	switch {
	case domain == "youtube.com" || strings.HasSuffix(domain, ".youtube.com"):
		return "youtube"
	case domain == "twitch.tv" || strings.HasSuffix(domain, ".twitch.tv"),
		domain == "steampowered.com" || domain == "steamcommunity.com" || strings.HasSuffix(domain, ".steampowered.com"),
		domain == "roblox.com" || strings.HasSuffix(domain, ".roblox.com"),
		domain == "discord.com" || strings.HasSuffix(domain, ".discord.com"):
		return "gaming"
	case domain == "instagram.com" || domain == "tiktok.com" || domain == "twitter.com" || domain == "x.com" ||
		domain == "reddit.com" || strings.HasSuffix(domain, ".reddit.com") || domain == "snapchat.com" || domain == "facebook.com":
		return "social"
	case domain == "khanacademy.org" || strings.HasSuffix(domain, ".khanacademy.org") || domain == "classroom.google.com" ||
		domain == "docs.google.com" || domain == "drive.google.com" || domain == "schoology.com" ||
		domain == "powerschool.com" || domain == "canvas.instructure.com":
		return "school"
	default:
		return "other"
	}
}

func cleanBrowseTitle(title string) string {
	var b strings.Builder
	for _, r := range title {
		if r >= 0x20 && r != 0x7f {
			b.WriteRune(r)
		}
	}
	clean := strings.TrimSpace(b.String())
	clean = titleURL.ReplaceAllStringFunc(clean, func(raw string) string {
		trimmed := strings.TrimRight(raw, ".,;:!?)]}")
		punctuation := raw[len(trimmed):]
		domain, safe, ok := safeBrowseURL(trimmed)
		if !ok || domain == "" {
			return "[link omitted]" + punctuation
		}
		return safe + punctuation
	})
	if len([]rune(clean)) > 120 {
		clean = string([]rune(clean)[:120])
	}
	return clean
}

func makeBrowseEntry(browser, profile, rawURL, title string, visitedAt time.Time, visitDurationMicros int64) (BrowseEntry, bool) {
	domain, safeURL, ok := safeBrowseURL(rawURL)
	if !ok || (browser != "edge" && browser != "chrome") || profile == "" {
		return BrowseEntry{}, false
	}
	visitedAt = visitedAt.UTC().Truncate(time.Microsecond)
	var duration *float64
	if visitDurationMicros > 0 {
		seconds := float64(visitDurationMicros) / 1e6
		if seconds > 1800 {
			seconds = 1800
		}
		duration = &seconds
	}
	cleanTitle := cleanBrowseTitle(title)
	key := browser + "\x00" + profile + "\x00" + visitedAt.Format(time.RFC3339Nano) + "\x00" + safeURL + "\x00" + cleanTitle
	sum := sha256.Sum256([]byte(key))
	return BrowseEntry{
		ID: hex.EncodeToString(sum[:]), Browser: browser, Profile: profile,
		Domain: domain, Category: browseCategory(domain), Title: cleanTitle,
		URL: safeURL, VisitedAt: visitedAt, DurationSeconds: duration,
	}, true
}

func markBrowser(coverage *BrowseCoverage, browser string, update func(*BrowseBrowserCoverage)) {
	for i := range coverage.Browsers {
		if coverage.Browsers[i].Browser == browser {
			update(&coverage.Browsers[i])
			return
		}
	}
}
func markProfileSkipped(coverage *BrowseCoverage, browser string) {
	coverage.Status = "partial"
	markBrowser(coverage, browser, func(c *BrowseBrowserCoverage) { c.ProfilesSkipped++ })
}
func markProfileRead(coverage *BrowseCoverage, browser string) {
	markBrowser(coverage, browser, func(c *BrowseBrowserCoverage) { c.ProfilesRead++ })
}
func markBrowserTruncated(coverage *BrowseCoverage, browser string) {
	coverage.Status = "partial"
	markBrowser(coverage, browser, func(c *BrowseBrowserCoverage) { c.Truncated = true })
}
func markBrowserVisit(coverage *BrowseCoverage, browser string) {
	markBrowser(coverage, browser, func(c *BrowseBrowserCoverage) { c.VisitsReported++ })
}

func fitBrowseBatch(batch BrowseBatch) BrowseBatch {
	entries := batch.Entries
	coverage := batch.Coverage
	sort.Slice(entries, func(i, j int) bool { return entries[i].VisitedAt.Before(entries[j].VisitedAt) })
	for len(entries) > maxBrowseVisitsPerDay {
		markBrowserTruncated(&coverage, entries[0].Browser)
		entries = entries[1:]
	}
	for {
		for i := range coverage.Browsers {
			coverage.Browsers[i].VisitsReported = 0
		}
		for _, entry := range entries {
			markBrowserVisit(&coverage, entry.Browser)
		}
		batch.Entries, batch.Coverage = entries, coverage
		encoded, _ := json.Marshal(batch)
		if len(encoded) <= maxBrowseUploadBytes || len(entries) == 0 {
			if len(encoded) > maxBrowseUploadBytes {
				batch.Entries = []BrowseEntry{}
				batch.Coverage.Status = "partial"
				for i := range batch.Coverage.Browsers {
					if batch.Coverage.Browsers[i].VisitsReported > 0 {
						batch.Coverage.Browsers[i].Truncated = true
						batch.Coverage.Browsers[i].VisitsReported = 0
					}
				}
			}
			return batch
		}
		drop := (len(entries)*(len(encoded)-maxBrowseUploadBytes))/len(encoded) + 1
		if drop < 1 {
			drop = 1
		}
		if drop > len(entries) {
			drop = len(entries)
		}
		for _, removed := range entries[:drop] {
			markBrowserTruncated(&coverage, removed.Browser)
		}
		entries = entries[drop:]
	}
}
