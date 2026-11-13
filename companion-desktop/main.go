package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		if errors.Is(err, errRemoteActivation) {
			os.Exit(42)
		}
		showError(err.Error())
		os.Exit(1)
	}
}
func run() error {
	demo := flag.Bool("demo", false, "sample data; no server connection")
	worker := flag.Bool("worker", false, "internal updater worker")
	uninstall := flag.Bool("uninstall", false, "remove ChoreZap from this Windows account")
	configPath := flag.String("config", "", "bootstrap configuration path")
	readyPath := flag.String("ready", "", "internal startup marker")
	launcherPID := flag.Int("launcher-pid", 0, "internal launcher capability marker")
	launcherVersion := flag.String("launcher-version", "", "internal launcher version")
	flag.Parse()
	if runtime.GOOS == "windows" && !*demo && !*worker {
		if *uninstall {
			return runUninstall()
		}
		return supervise()
	}
	if !*demo {
		if err := checkObservationPlatform(); err != nil {
			return err
		}
	}
	release, err := acquireInstance()
	if err != nil {
		return err
	}
	defer release()
	cache, err := os.UserCacheDir()
	if err != nil {
		return err
	}
	dir := filepath.Join(cache, "ChoreZapDesktop")
	if *demo {
		dir, err = os.MkdirTemp("", "chorezap-desktop-demo-")
		if err != nil {
			return err
		}
	}
	if err = os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	var a Account
	var network *Network
	if !*demo {
		a, err = loadAccount(dir)
		if err != nil {
			return err
		}
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		if *configPath == "" {
			*configPath = filepath.Join(filepath.Dir(exe), "server.json")
		}
		b, err := os.ReadFile(*configPath)
		if err != nil {
			return fmt.Errorf("server.json must stay beside ChoreZap-Desktop.exe")
		}
		var bootstrap Bootstrap
		if err = json.Unmarshal(b, &bootstrap); err != nil {
			return err
		}
		network, err = newNetwork(bootstrap)
		if err != nil {
			return err
		}
	}
	e, err := newEngine(dir, a, *demo)
	if err != nil {
		return err
	}
	e.network = network
	e.launcherPID = *launcherPID
	e.launcherVersion = *launcherVersion
	if *demo {
		seedDemo(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	startCountdownHUD(ctx, e)
	address, shutdown, err := e.serve(cancel)
	if err != nil {
		return err
	}
	defer shutdown()
	if !*demo {
		if err = startTray(ctx, address); err != nil {
			return err
		}
	}
	fmt.Println("ChoreZap is running. Dashboard:", address)
	if err = openDashboard(address); err != nil {
		fmt.Println("Open the dashboard address in your browser.")
	}
	initialSync := make(chan struct{})
	go func() {
		if !*demo {
			e.syncOnce(network)
		}
		close(initialSync)
		if !*demo {
			e.maintenanceOnce(network)
			go e.browseOnce(network)
		}
		ticker := time.NewTicker(time.Minute)
		commands := time.NewTicker(15 * time.Second)
		browse := time.NewTicker(30 * time.Minute)
		defer ticker.Stop()
		defer commands.Stop()
		defer browse.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if !*demo {
					e.syncOnce(network)
				}
			case <-commands.C:
				if !*demo {
					e.maintenanceOnce(network)
				}
			case <-browse.C:
				if !*demo {
					go e.browseOnce(network)
				}
			}
		}
	}()
	if !*demo {
		go func() {
			// Let the first policy sync establish the device link.
			select {
			case <-ctx.Done():
				return
			case <-initialSync:
				e.choresFetch(network)
			}
			ticker := time.NewTicker(5 * time.Minute)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					e.choresFetch(network)
				}
			}
		}()
	}
	detector := gameDetector{}
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	save := time.NewTicker(15 * time.Second)
	defer save.Stop()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stop)
	started := time.Now()
	autoCheckAt := time.Time{}
	for {
		select {
		case <-ticker.C:
			if !*demo {
				e.mu.Lock()
				activate := e.activationRequested
				games, policyFresh := e.activationGameRules(time.Now())
				e.mu.Unlock()
				idle, idleErr := true, error(nil)
				if activate && policyFresh {
					idle, idleErr = classifiedGamesIdle(games)
				}
				if activate && policyFresh && e.remoteActivationAvailable() && idleErr == nil && idle {
					if err = e.save(); err == nil {
						return errRemoteActivation
					}
					e.syncFailure(err)
				}
				o := foregroundObservation()
				// If the foreground window belongs to a background process (common
				// for exclusive full-screen DirectX games), override with any
				// classified game currently running in this user's session.
				if fallbackEligible(o, games) {
					if name, pid := runningClassifiedGame(games); name != "" {
						o = Observation{Executable: name, IdleSeconds: o.IdleSeconds, Available: true, PID: pid, BackgroundGame: true}
					}
				}
				o.Hint = detector.lookup(o.Path)
				now := time.Now().UTC()
				e.sample(now, o)
				e.enforce(o, now)
				if *readyPath != "" && time.Since(started) >= 20*time.Second {
					if err = e.save(); err == nil {
						_ = os.WriteFile(*readyPath, []byte(appVersion), 0600)
						*readyPath = ""
					}
				}
				// Automatic staging uses the same fresh-policy and all-game idle
				// gate as an explicit parent request. Ordinary Stop exits never apply.
				if *worker && *readyPath == "" && time.Since(autoCheckAt) >= 15*time.Second {
					autoCheckAt = time.Now()
					if _, statErr := os.Stat(filepath.Join(dir, "updates", "pending.json")); statErr == nil {
						if outcome, status := e.prepareApplyUpdate(); outcome == "restart_requested" {
							e.mu.Lock()
							e.activationRequested = true
							e.Action = status
							e.mu.Unlock()
						}
					}
				}
			}
		case <-save.C:
			if err = e.save(); err != nil {
				e.syncFailure(err)
			}
		case <-stop:
			cancel()
		case <-ctx.Done():
			e.mu.Lock()
			e.finish(e.Ledger.Last)
			e.mu.Unlock()
			return e.save()
		}
	}
}
func fallbackEligible(o Observation, games map[string]bool) bool {
	return o.Available && !o.BackgroundGame && !games[o.Executable] && len(games) > 0
}
func seedDemo(e *Engine) {
	cap := 120
	e.Ledger.Totals = map[string]float64{"modernwarfare.exe": 3000, "minecraft.exe": 1200, "msedge.exe": 2400, "steamwebhelper.exe": 240}
	e.Ledger.Policy = Policy{ChildName: "Grey (sample)", Day: e.Ledger.Day, ClientID: "demo", Settings: Settings{GamingMinutes: &cap, Mode: "warn"}, Rules: []Rule{{Executable: "modernwarfare.exe", Label: "Modern Warfare", Category: "game"}, {Executable: "minecraft.exe", Label: "Minecraft", Category: "game"}, {Executable: "msedge.exe", Label: "School & YouTube", Category: "school"}}}
	e.Current = "modernwarfare.exe"
	e.Ledger.Gaps = 48
	e.Action = "Sample data · no Windows collection or uploads"
}
