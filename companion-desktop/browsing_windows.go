//go:build windows

package main

import (
	"database/sql"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Chrome/Edge store visit_time as microseconds since Jan 1, 1601 (Windows FILETIME).
const chromeEpochMicros = int64(11644473600 * 1_000_000)

func midnightChromeMicros(t time.Time) int64 {
	midnight := time.Date(t.In(denver).Year(), t.In(denver).Month(), t.In(denver).Day(), 0, 0, 0, 0, denver)
	return midnight.Unix()*1_000_000 + chromeEpochMicros
}

type historySource struct {
	path  string
	label string
}

func historyPaths() []historySource {
	local := os.Getenv("LOCALAPPDATA")
	return []historySource{
		{filepath.Join(local, `Microsoft\Edge\User Data\Default\History`), "edge"},
		{filepath.Join(local, `Google\Chrome\User Data\Default\History`), "chrome"},
	}
}

// copyHistoryDir copies History (+ WAL/SHM if present) to a temp directory and
// returns the path to the History copy. The caller must remove the directory.
func copyHistoryDir(src string) (string, func(), error) {
	dir, err := os.MkdirTemp("", "cz-hist-*")
	if err != nil {
		return "", nil, err
	}
	cleanup := func() { os.RemoveAll(dir) }
	dst := filepath.Join(dir, "History")
	if err = copyFileBestEffort(src, dst); err != nil {
		cleanup()
		return "", nil, err
	}
	// Copy WAL and SHM so SQLite sees a consistent snapshot; ignore errors.
	_ = copyFileBestEffort(src+"-wal", dst+"-wal")
	_ = copyFileBestEffort(src+"-shm", dst+"-shm")
	return dst, cleanup, nil
}

func copyFileBestEffort(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func extractDomain(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return ""
	}
	h := strings.ToLower(u.Host)
	h = strings.TrimPrefix(h, "www.")
	// Drop port
	if i := strings.LastIndex(h, ":"); i > 0 {
		h = h[:i]
	}
	return h
}

func cleanTitle(domain, title string) string {
	if title == "" {
		return domain
	}
	if strings.Contains(domain, "youtube.com") {
		title = strings.TrimSuffix(title, " - YouTube")
		title = strings.TrimSuffix(title, " - YouTube Music")
	}
	if len(title) > 120 {
		title = title[:117] + "..."
	}
	return title
}

func categorizeDomain(d string) string {
	switch {
	case d == "youtube.com" || strings.HasSuffix(d, ".youtube.com") || d == "music.youtube.com":
		return "youtube"
	case d == "twitch.tv" || strings.HasSuffix(d, ".twitch.tv"):
		return "gaming"
	case d == "steampowered.com" || d == "steamcommunity.com" || strings.HasSuffix(d, ".steampowered.com"):
		return "gaming"
	case d == "roblox.com" || strings.HasSuffix(d, ".roblox.com"):
		return "gaming"
	case d == "discord.com" || strings.HasSuffix(d, ".discord.com"):
		return "gaming"
	case d == "instagram.com" || d == "tiktok.com" || d == "twitter.com" || d == "x.com" ||
		d == "reddit.com" || strings.HasSuffix(d, ".reddit.com") ||
		d == "snapchat.com" || d == "facebook.com":
		return "social"
	case d == "khanacademy.org" || d == "classroom.google.com" || d == "docs.google.com" ||
		d == "drive.google.com" || d == "schoology.com" || d == "powerschool.com" ||
		d == "canvas.instructure.com":
		return "school"
	default:
		return "other"
	}
}

type rawVisit struct {
	domain  string
	title   string
	seconds float64
}

func readHistoryDB(dbPath string, since int64) ([]rawVisit, error) {
	tmpPath, cleanup, err := copyHistoryDir(dbPath)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	db, err := sql.Open("sqlite", "file:"+tmpPath+"?mode=ro&_journal_mode=WAL&nolock=1")
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(`
		SELECT u.url, u.title, v.visit_time, v.visit_duration
		FROM visits v
		JOIN urls u ON v.url = u.id
		WHERE v.visit_time >= ?
		  AND u.url NOT LIKE 'chrome://%'
		  AND u.url NOT LIKE 'edge://%'
		  AND u.url NOT LIKE 'about:%'
		  AND u.url NOT LIKE 'data:%'
		ORDER BY v.visit_time ASC
		LIMIT 5000
	`, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var visits []rawVisit
	for rows.Next() {
		var rawURL, title string
		var visitTime, visitDuration int64
		if err := rows.Scan(&rawURL, &title, &visitTime, &visitDuration); err != nil {
			continue
		}
		domain := extractDomain(rawURL)
		if domain == "" {
			continue
		}
		sec := float64(visitDuration) / 1e6
		if sec < 2 {
			sec = 10 // minimum for a brief visit
		}
		if sec > 1800 {
			sec = 1800
		}
		title = cleanTitle(domain, title)
		visits = append(visits, rawVisit{domain, title, sec})
	}
	return visits, rows.Err()
}

// collectBrowseHistory reads Edge and Chrome history since midnight (Denver)
// and returns aggregated BrowseEntry values.
func collectBrowseHistory() []BrowseEntry {
	since := midnightChromeMicros(time.Now())
	// key: "domain\x00title"
	type agg struct {
		domain  string
		title   string
		seconds float64
	}
	totals := map[string]*agg{}

	for _, src := range historyPaths() {
		if _, err := os.Stat(src.path); err != nil {
			continue
		}
		visits, err := readHistoryDB(src.path, since)
		if err != nil {
			continue
		}
		for _, v := range visits {
			k := v.domain + "\x00" + v.title
			if e := totals[k]; e != nil {
				e.seconds += v.seconds
			} else {
				totals[k] = &agg{v.domain, v.title, v.seconds}
			}
		}
	}

	entries := make([]BrowseEntry, 0, len(totals))
	for _, a := range totals {
		entries = append(entries, BrowseEntry{
			Domain:   a.domain,
			Category: categorizeDomain(a.domain),
			Title:    a.title,
			Seconds:  a.seconds,
		})
	}
	return entries
}
