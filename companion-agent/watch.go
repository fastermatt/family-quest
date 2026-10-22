package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

// watch: look at the PC's DNS cache every few minutes, keep counts on the PC,
// and upload one small summary about once an hour. Observation only.
type watchOpts struct {
	sampleEvery time.Duration
	flushEvery  time.Duration
	localOnly   bool
}

func pendingPath() string { return filepath.Join(configDir(), "pending.json") }

func loadPending() *Pending {
	var p Pending
	b, err := os.ReadFile(pendingPath())
	if err != nil || json.Unmarshal(b, &p) != nil || p.Counts == nil || p.PeriodStart.IsZero() {
		return nil
	}
	return &p
}

func savePending(p *Pending) {
	b, _ := json.Marshal(p)
	_ = os.WriteFile(pendingPath(), b, 0o600)
}

// uploadResult tells the loop what to do next.
type uploadResult int

const (
	uploadOK       uploadResult = iota
	uploadRetry                 // network trouble or "too soon": keep the data, try later
	uploadDiscard               // the server refused this batch for good: start fresh
	uploadUnlinked              // this PC was unlinked in ChoreZap
)

func upload(cfg Config, p *Pending, end time.Time) (uploadResult, string) {
	var res struct {
		Error string `json:"error"`
	}
	code, err := postJSON(cfg.Server+"/api/companion/usage", cfg.DeviceToken, p.Payload(end), &res)
	switch {
	case err != nil:
		return uploadRetry, err.Error()
	case code == 200:
		return uploadOK, ""
	case code == 401:
		return uploadUnlinked, res.Error
	case code == 429 || code >= 500:
		return uploadRetry, fmt.Sprintf("%d %s", code, res.Error)
	default:
		return uploadDiscard, fmt.Sprintf("%d %s", code, res.Error)
	}
}

func watch(o watchOpts) error {
	var cfg Config
	if !o.localOnly {
		var err error
		cfg, err = loadConfig()
		if err != nil {
			return fmt.Errorf("this PC is not linked yet. Run without arguments to link it")
		}
	}
	if err := os.MkdirAll(configDir(), 0o700); err != nil {
		return err
	}
	_ = lockDown(configDir())

	p := loadPending()
	if p == nil {
		p = newPending(time.Now())
	}
	mode := "uploading about once an hour"
	if o.localOnly {
		mode = "saving a summary on this PC only (nothing is uploaded)"
	}
	fmt.Printf("Watching DNS lookups every %s, %s. Press Ctrl+C to stop.\n", o.sampleEvery, mode)

	flush := func() {
		end := time.Now()
		if len(p.Counts) == 0 && p.Other == 0 {
			p = newPending(end)
			return
		}
		if o.localOnly {
			b, _ := json.MarshalIndent(p.Payload(end), "", "  ")
			_ = os.WriteFile(filepath.Join(configDir(), "last-summary.json"), b, 0o600)
			fmt.Printf("%s saved summary (%d sites)\n", end.Format("15:04"), len(p.Counts))
			p = newPending(end)
			_ = os.Remove(pendingPath())
			return
		}
		switch r, why := upload(cfg, p, end); r {
		case uploadOK:
			fmt.Printf("%s uploaded summary (%d sites)\n", end.Format("15:04"), len(p.Counts))
			p = newPending(end)
			_ = os.Remove(pendingPath())
		case uploadRetry:
			fmt.Printf("%s upload postponed: %s\n", end.Format("15:04"), why)
			savePending(p)
		case uploadDiscard:
			fmt.Printf("%s server refused this batch (%s); starting a new one\n", end.Format("15:04"), why)
			p = newPending(end)
			_ = os.Remove(pendingPath())
		case uploadUnlinked:
			fmt.Printf("ChoreZap no longer recognizes this PC (%s). Stopping.\n", why)
			os.Exit(1)
		}
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	sample := time.NewTicker(o.sampleEvery)
	defer sample.Stop()

	p.Sample(dnsCacheNames())
	savePending(p)
	for {
		select {
		case <-sample.C:
			p.Sample(dnsCacheNames())
			savePending(p)
			// Keep every batch well under the server's 26-hour limit.
			if time.Since(p.PeriodStart) >= o.flushEvery {
				flush()
			}
		case <-stop:
			fmt.Println("Stopping. Sending what was collected...")
			flush()
			return nil
		}
	}
}
