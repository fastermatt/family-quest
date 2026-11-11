package main

import (
	"fmt"
	"path/filepath"
	"strings"
)

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
