package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync/atomic"
	"time"
)

const updatePublicKey = "OhEnZ13gUc/92sAQ1BOLlb2z8OM2Lfj+MV6az7sMz8k="
const releaseSequence = 6
const bundledSequence = 10
const maxUpdateSize = 32 << 20

var errRemoteActivation = errors.New("verified update restart requested")

type release struct {
	Sequence int    `json:"sequence"`
	Version  string `json:"version"`
	SHA256   string `json:"sha256"`
	Size     int64  `json:"size"`
	Protocol int    `json:"protocol"`
}
type signedRelease struct {
	Payload   string `json:"payload"`
	Signature string `json:"signature"`
}

func verifyRelease(data []byte) (release, error) {
	var envelope signedRelease
	var r release
	if err := json.Unmarshal(data, &envelope); err != nil {
		return r, err
	}
	payload, e := base64.StdEncoding.DecodeString(envelope.Payload)
	if e != nil {
		return r, e
	}
	sig, e := base64.StdEncoding.DecodeString(envelope.Signature)
	if e != nil {
		return r, e
	}
	key, _ := base64.StdEncoding.DecodeString(updatePublicKey)
	if !ed25519.Verify(key, payload, sig) {
		return r, fmt.Errorf("update signature invalid")
	}
	if e = json.Unmarshal(payload, &r); e != nil {
		return r, e
	}
	hash, e := hex.DecodeString(r.SHA256)
	if e != nil || len(hash) != 32 || r.Size < 1 || r.Size > maxUpdateSize || r.Protocol != 1 || r.Sequence < releaseSequence {
		return r, fmt.Errorf("unsupported update manifest")
	}
	return r, nil
}
func verifyBinary(path string, r release) error {
	f, e := os.Open(path)
	if e != nil {
		return e
	}
	defer f.Close()
	h := sha256.New()
	n, e := io.Copy(h, io.LimitReader(f, maxUpdateSize+1))
	if e != nil {
		return e
	}
	if n != r.Size || hex.EncodeToString(h.Sum(nil)) != r.SHA256 {
		return fmt.Errorf("update file verification failed")
	}
	return nil
}
func updateGet(n *Network, path string, limit int64) ([]byte, error) {
	res, e := n.client.Get(n.bootstrap.Server + path)
	if e != nil {
		return nil, fmt.Errorf("update server unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("update server returned %d", res.StatusCode)
	}
	b, e := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if e != nil {
		return nil, e
	}
	if int64(len(b)) > limit {
		return nil, fmt.Errorf("update too large")
	}
	return b, nil
}
func updateStatus(dir, s string) {
	_ = os.WriteFile(filepath.Join(dir, "update-status.txt"), []byte(s), 0600)
}
func stageRelease(n *Network, dir string, floor int) error {
	releaseLock, err := acquireUpdateStageLock()
	if err != nil {
		return err
	}
	defer releaseLock()
	raw, e := updateGet(n, "/api/companion/v2/updates/manifest.json", 16384)
	if e != nil {
		return e
	}
	r, e := verifyRelease(raw)
	if e != nil {
		return e
	}
	if r.Sequence <= floor {
		return nil
	}
	var bad release
	if b, err := os.ReadFile(filepath.Join(dir, "failed.json")); err == nil {
		_ = json.Unmarshal(b, &bad)
		if bad.Sequence == r.Sequence {
			return fmt.Errorf("release failed startup; waiting for a newer release")
		}
	}
	path := filepath.Join(dir, r.SHA256+".exe")
	if verifyBinary(path, r) != nil {
		b, err := updateGet(n, "/api/companion/v2/updates/"+r.SHA256+".exe", maxUpdateSize)
		if err != nil {
			return err
		}
		temp := path + ".download"
		if err = os.WriteFile(temp, b, 0700); err != nil {
			return err
		}
		if err = verifyBinary(temp, r); err != nil {
			os.Remove(temp)
			return err
		}
		if err = os.Rename(temp, path); err != nil {
			return err
		}
	}
	// A manifest is selected only after its complete binary verifies. Interrupted
	// writes leave the previous active version untouched.
	if e = os.WriteFile(filepath.Join(dir, "pending.json.tmp"), raw, 0600); e != nil {
		return e
	}
	if e = os.Rename(filepath.Join(dir, "pending.json.tmp"), filepath.Join(dir, "pending.json")); e != nil {
		return e
	}
	updateStatus(dir, "Update "+r.Version+" downloaded · applies next time ChoreZap starts")
	return nil
}
func readRelease(dir, name string) (release, string, error) {
	r, path, _, err := readPinnedRelease(dir, name)
	return r, path, err
}
func readPinnedRelease(dir, name string) (release, string, []byte, error) {
	b, e := os.ReadFile(filepath.Join(dir, name))
	if e != nil {
		return release{}, "", nil, e
	}
	if len(b) > 16384 {
		return release{}, "", nil, fmt.Errorf("update manifest too large")
	}
	r, e := verifyRelease(b)
	if e != nil {
		return r, "", nil, e
	}
	path := filepath.Join(dir, r.SHA256+".exe")
	if e = verifyBinary(path, r); e != nil {
		return r, "", nil, e
	}
	return r, path, b, nil
}
func writeActiveManifest(dir string, pinned []byte) error {
	if _, err := verifyRelease(pinned); err != nil {
		return err
	}
	temp := filepath.Join(dir, "active.json.tmp")
	if err := os.WriteFile(temp, pinned, 0600); err != nil {
		return err
	}
	return os.Rename(temp, filepath.Join(dir, "active.json"))
}
func removePendingIfMatches(dir string, selected release) {
	if current, _, _, err := readPinnedRelease(dir, "pending.json"); err == nil && current == selected {
		_ = os.Remove(filepath.Join(dir, "pending.json"))
	}
}

// The original portable executable is a stable launcher. Workers are verified
// side-by-side files; the running executable is never overwritten.
func supervise() error {
	exe, e := os.Executable()
	if e != nil {
		return e
	}
	config, e := os.ReadFile(filepath.Join(filepath.Dir(exe), "server.json"))
	if e != nil {
		return e
	}
	var b Bootstrap
	if e = json.Unmarshal(config, &b); e != nil {
		return e
	}
	n, e := newNetwork(b)
	if e != nil {
		return e
	}
	cache, e := os.UserCacheDir()
	if e != nil {
		return e
	}
	// Self-install if running from a non-standard location; repair if files are missing.
	launched, e := maybeInstall(exe)
	if e != nil {
		return e
	}
	if launched {
		return nil // Relaunched from installed path; this instance's job is done.
	}

	appDir := filepath.Join(cache, "ChoreZapDesktop")
	dir := filepath.Join(appDir, "updates")
	if e = os.MkdirAll(dir, 0700); e != nil {
		return e
	}
	pidFile := filepath.Join(appDir, "supervisor.pid")
	releaseLock, e := acquireUpdaterInstance()
	if e != nil {
		// Another supervisor holds the mutex — kill it (handles exe relocation) and retry once.
		replaceRunningInstance(pidFile)
		time.Sleep(2 * time.Second)
		releaseLock, e = acquireUpdaterInstance()
		if e != nil {
			return e
		}
	}
	defer releaseLock()
	_ = os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", os.Getpid())), 0600)
	// Keep autostart registration current whenever the exe path changes.
	go registerAutostart()
	active := exe
	floor := bundledSequence
	if r, p, err := readRelease(dir, "active.json"); err == nil && r.Sequence >= floor {
		active = p
		floor = r.Sequence
	}
	var currentFloor atomic.Int64
	currentFloor.Store(int64(floor))
	candidate := active
	var pending release
	var pendingManifest []byte
	if r, p, pinned, err := readPinnedRelease(dir, "pending.json"); err == nil && r.Sequence > floor {
		candidate = p
		pending = r
		pendingManifest = pinned
	}
	// Once the launcher has selected a worker, the worker must not inherit
	// an already acknowledged restart request and exit during its health gate.
	_ = os.Remove(filepath.Join(dir, "activation-acked"))
	launch := func(path string) (*exec.Cmd, chan error, string, error) {
		ready := filepath.Join(dir, "ready-"+secret(12))
		cmd := exec.Command(path, "-worker", "-config", filepath.Join(filepath.Dir(exe), "server.json"), "-ready", ready, "-launcher-pid", fmt.Sprint(os.Getpid()))
		// GUI processes have no console handles; leave standard streams on null.
		if err := cmd.Start(); err != nil {
			return nil, nil, ready, err
		}
		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()
		return cmd, done, ready, nil
	}
	cmd, done, ready, e := launch(candidate)
	if candidate != active {
		healthy := false
		if e == nil {
			healthy = waitStartup(done, ready, 45*time.Second)
		}
		if healthy {
			if err := writeActiveManifest(dir, pendingManifest); err != nil {
				updateStatus(dir, "Update running; could not save selection")
			} else {
				floor = pending.Sequence
				currentFloor.Store(int64(floor))
				active = candidate
				removePendingIfMatches(dir, pending)
			}
		} else {
			if cmd != nil && cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
			bad, _ := json.Marshal(pending)
			_ = os.WriteFile(filepath.Join(dir, "failed.json"), bad, 0600)
			removePendingIfMatches(dir, pending)
			updateStatus(dir, "Update failed startup · restored previous version")
			time.Sleep(time.Second)
			_ = os.Remove(ready)
			candidate = active
			cmd, done, ready, e = launch(active)
		}
	}
	if e != nil {
		return e
	}
	defer func() { _ = os.Remove(ready) }()
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		for {
			if err := stageRelease(n, dir, int(currentFloor.Load())); err != nil {
				updateStatus(dir, "Automatic update check: "+err.Error())
			}
			select {
			case <-stop:
				return
			case <-time.After(15 * time.Minute):
			}
		}
	}()
	started := time.Now()
	attempts := 0
	for {
		err := <-done
		if exit, ok := err.(*exec.ExitError); ok && exit.ExitCode() == 42 {
			_ = os.Remove(ready)
			r, p, activationManifest, readErr := readPinnedRelease(dir, "activation.json")
			if readErr != nil || r.Sequence <= floor {
				updateStatus(dir, "Remote update request could not be verified; continuing current version")
				cmd, done, ready, e = launch(candidate)
				if e != nil {
					return e
				}
				started = time.Now()
				attempts = 0
				continue
			}
			old := candidate
			pending = r
			candidate = p
			_ = os.Remove(filepath.Join(dir, "activation-acked"))
			cmd, done, ready, e = launch(candidate)
			healthy := e == nil && waitStartup(done, ready, 45*time.Second)
			if healthy {
				if writeErr := writeActiveManifest(dir, activationManifest); writeErr != nil {
					updateStatus(dir, "Update running; could not save selection")
				} else {
					floor = pending.Sequence
					currentFloor.Store(int64(floor))
					active = candidate
					removePendingIfMatches(dir, pending)
				}
			} else {
				if cmd != nil && cmd.Process != nil {
					_ = cmd.Process.Kill()
				}
				bad, _ := json.Marshal(pending)
				_ = os.WriteFile(filepath.Join(dir, "failed.json"), bad, 0600)
				removePendingIfMatches(dir, pending)
				updateStatus(dir, "Remote update failed startup · restored previous version")
				_ = os.Remove(ready)
				candidate = old
				cmd, done, ready, e = launch(old)
			}
			_ = os.Remove(filepath.Join(dir, "activation.json"))
			_ = os.Remove(filepath.Join(dir, "activation-acked"))
			if e != nil {
				return e
			}
			started = time.Now()
			attempts = 0
			continue
		}
		delay, retry := recoveryDelay(err, time.Since(started), &attempts)
		if !retry {
			return err
		}
		updateStatus(dir, "Tracker stopped unexpectedly · restarting")
		_ = os.Remove(ready)
		time.Sleep(delay)
		_, done, ready, e = launch(candidate)
		started = time.Now()
		if e != nil {
			// Route launch failures through the same bounded recovery policy.
			done = make(chan error, 1)
			done <- e
		}
	}
}

// Normal exits include Stop app and must never trigger a restart. Three
// retries bound crash loops; ten minutes of healthy runtime resets the budget.
func recoveryDelay(err error, runtime time.Duration, attempts *int) (time.Duration, bool) {
	if err == nil {
		return 0, false
	}
	if runtime >= 10*time.Minute {
		*attempts = 0
	}
	if *attempts >= 3 {
		return 0, false
	}
	*attempts++
	return time.Duration(*attempts) * 5 * time.Second, true
}

func waitStartup(done <-chan error, ready string, timeout time.Duration) bool {
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	tick := time.NewTicker(50 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-done:
			return false
		case <-deadline.C:
			return false
		case <-tick.C:
			if _, err := os.Stat(ready); err == nil {
				return true
			}
		}
	}
}
