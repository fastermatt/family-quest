package main

import (
	"fmt"
	"path/filepath"
	"strings"
	"sync"
)

func stoppedAppExclusion(acquireLauncher, acquireWorker func() (func(), error)) (func(), error) {
	guidance := fmt.Errorf("ChoreZap is still running. Use Stop app in its dashboard and wait for the tray icon to disappear, then retry. If it will not stop, reboot, stop ChoreZap again after sign-in, and retry")
	launcherRelease, err := acquireLauncher()
	if err != nil {
		return nil, guidance
	}
	workerRelease, err := acquireWorker()
	if err != nil {
		launcherRelease()
		return nil, guidance
	}
	var once sync.Once
	return func() { once.Do(func() { workerRelease(); launcherRelease() }) }, nil
}
func acquireStoppedApp() (func(), error) {
	return stoppedAppExclusion(acquireUpdaterInstance, acquireInstance)
}

// Uninstall only from the exact per-user installed executable. In particular,
// a downloaded copy must never infer its own containing folder as the target.
func canonicalUninstallDir(currentExe, installedExe string) (string, error) {
	if !sameInstalledExecutable(currentExe, installedExe) {
		return "", fmt.Errorf("run Uninstall from the installed ChoreZap in Windows Apps settings")
	}
	return filepath.Dir(installedExe), nil
}
func sameInstalledExecutable(currentExe, installedExe string) bool {
	return currentExe != "" && installedExe != "" && strings.EqualFold(filepath.Clean(currentExe), filepath.Clean(installedExe))
}

func ownedInstallFiles(installedExe string) []string {
	dir := filepath.Dir(installedExe)
	return []string{filepath.Join(dir, "server.json"), filepath.Join(dir, "ChoreZap.ico"), installedExe}
}
