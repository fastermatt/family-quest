package main

import (
	"os"
	"path/filepath"
	"strings"
)

func startupErrorLogPath() string {
	cache, err := os.UserCacheDir()
	if err != nil {
		return ""
	}
	return filepath.Join(cache, "ChoreZapDesktop", "startup-error.txt")
}

// logStartupError writes err to the startup error log before showing a dialog.
// Called from main() when run() returns a fatal error.
func logStartupError(err error) {
	p := startupErrorLogPath()
	if p == "" {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0o700)
	_ = os.WriteFile(p, []byte(err.Error()), 0o600)
}

// readStartupError returns the last logged startup error (up to 200 chars).
// Returns "" when no error was logged.
func readStartupError() string {
	p := startupErrorLogPath()
	if p == "" {
		return ""
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	s := strings.TrimSpace(string(b))
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

// clearStartupError removes the startup error log after the companion reports it.
func clearStartupError() {
	if p := startupErrorLogPath(); p != "" {
		_ = os.Remove(p)
	}
}
