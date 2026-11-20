package main

import "time"

// inScheduledPause returns true if now (converted to Denver time) falls within
// any of the configured pause windows.
func inScheduledPause(windows []PauseWindow, now time.Time) bool {
	local := now.In(denver)
	day := local.Weekday().String()[:3] // "Mon", "Tue", …
	hm := local.Format("15:04")
	for _, w := range windows {
		if !windowHasDay(w.Days, day) {
			continue
		}
		if w.Start <= hm && hm < w.End {
			return true
		}
	}
	return false
}

func windowHasDay(days []string, day string) bool {
	for _, d := range days {
		if d == day {
			return true
		}
	}
	return false
}
