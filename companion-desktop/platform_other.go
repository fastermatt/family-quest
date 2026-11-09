//go:build !windows

package main

import (
	"context"
	"fmt"
	"sync"
)

func acquireInstance() (func(), error) { return func() {}, nil }
func accountTag() (string, error)      { return "demo", nil }
func seal(b []byte) ([]byte, error) {
	return nil, fmt.Errorf("Windows required for account protection")
}
func unseal(b []byte) ([]byte, error) {
	return nil, fmt.Errorf("Windows required for account protection")
}
func openDashboard(string) error          { return nil }
func showError(s string)                  { fmt.Println(s) }
func notifyLimit()                        {}
func closeObservedGame(Observation) error { return fmt.Errorf("Windows required") }

func startCountdownHUD(context.Context, *Engine) {}

func acquireUpdaterInstance() (func(), error) { return func() {}, nil }

var updateStageMu sync.Mutex

func acquireUpdateStageLock() (func(), error) { updateStageMu.Lock(); return updateStageMu.Unlock, nil }
func classifiedGamesIdle(map[string]bool) (bool, error) {
	return false, fmt.Errorf("Windows process inventory required")
}

func startTray(context.Context, string) error { return nil }
