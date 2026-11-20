package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"syscall"
	"time"
)

// Observation is a diagnostic hint, never authority to grant access or charge a budget.
type Observation struct {
	Executable  string
	IdleSeconds int64
	Available   bool
}

type AppObservation struct {
	Executable             string  `json:"executable"`
	ForegroundSeconds      float64 `json:"foregroundSeconds"`
	WithRecentInputSeconds float64 `json:"withRecentKeyboardOrMouseInputSeconds"`
}

type ObservationSummary struct {
	SchemaVersion     int              `json:"schemaVersion"`
	Source            string           `json:"source"`
	StartedAt         time.Time        `json:"startedAt"`
	EndedAt           time.Time        `json:"endedAt"`
	UnobservedSeconds float64          `json:"unobservedSeconds"`
	Apps              []AppObservation `json:"apps"`
}

type appObserver struct {
	apps       map[string]*AppObservation
	unobserved float64
}

// Credit only consecutive samples of the same app. Transitions and missed samples
// are gaps; never bill sleep or assign a long interval to the last visible window.
func (o *appObserver) add(before, after Observation, elapsed, interval time.Duration) {
	seconds := elapsed.Seconds()
	if seconds <= 0 {
		return
	}
	if elapsed > interval*3 || !before.Available || !after.Available || before.Executable != after.Executable {
		o.unobserved += seconds
		return
	}
	if o.apps == nil {
		o.apps = map[string]*AppObservation{}
	}
	app := o.apps[after.Executable]
	if app == nil {
		app = &AppObservation{Executable: after.Executable}
		o.apps[after.Executable] = app
	}
	app.ForegroundSeconds += seconds
	if before.IdleSeconds >= 0 && after.IdleSeconds >= 0 && before.IdleSeconds < 60 && after.IdleSeconds < 60 {
		app.WithRecentInputSeconds += seconds
	}
}

func (o *appObserver) summary(start, end time.Time) ObservationSummary {
	result := ObservationSummary{SchemaVersion: 1, Source: "current-user-foreground-pilot", StartedAt: start.UTC(), EndedAt: end.UTC(), UnobservedSeconds: o.unobserved, Apps: []AppObservation{}}
	for _, app := range o.apps {
		result.Apps = append(result.Apps, *app)
	}
	sort.Slice(result.Apps, func(i, j int) bool { return result.Apps[i].Executable < result.Apps[j].Executable })
	return result
}

func observe(duration, interval time.Duration) error {
	if duration < time.Second || duration > time.Hour {
		return fmt.Errorf("duration must be between 1s and 1h")
	}
	if interval < time.Second || interval > 30*time.Second {
		return fmt.Errorf("sample interval must be between 1s and 30s")
	}
	if err := checkObservationPlatform(); err != nil {
		return err
	}
	fmt.Println("LOCAL-ONLY PILOT: run in Grey's standard account, without elevation.")
	fmt.Println("Recording executable names and estimated foreground time. No titles, websites, keys, uploads or blocking.")
	fmt.Println("Controller play and passive video are not verified active time. Press Ctrl+C to stop and save.")
	start := time.Now()
	last, before := start, foregroundObservation()
	o := &appObserver{}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	timer := time.NewTimer(duration)
	defer timer.Stop()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stop)
	for {
		select {
		case <-ticker.C:
			now := time.Now()
			after := foregroundObservation()
			o.add(before, after, now.Sub(last), interval)
			last, before = now, after
		case <-timer.C:
			return saveObservation(o, start, last)
		case <-stop:
			return saveObservation(o, start, last)
		}
	}
}

func saveObservation(o *appObserver, start, last time.Time) error {
	end := time.Now()
	o.unobserved += end.Sub(last).Seconds()
	dir, err := os.UserCacheDir()
	if err != nil {
		return err
	}
	dir = filepath.Join(dir, "ChoreZapPilot")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, "foreground-*.json")
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	summary := o.summary(start, end)
	writeErr := encoder.Encode(summary)
	closeErr := file.Close()
	if writeErr != nil {
		return writeErr
	}
	if closeErr != nil {
		return closeErr
	}
	fmt.Println("Saved locally:", file.Name())
	reportPath := file.Name() + ".html"
	if err := writeObservationReport(reportPath, summary); err != nil {
		return fmt.Errorf("JSON saved, but the visual report could not be written: %w", err)
	}
	fmt.Println("Open visual report:", reportPath)
	fmt.Println("Nothing uploaded. This estimate must not be used to enforce a time limit yet.")
	return nil
}
