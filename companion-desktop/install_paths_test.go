package main

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstallExclusionRefusesRunningLauncherOrWorker(t *testing.T) {
	busy := func() (func(), error) { return nil, errors.New("running") }
	workerCalled := false
	if release, err := stoppedAppExclusion(busy, func() (func(), error) { workerCalled = true; return func() {}, nil }); err == nil || release != nil || workerCalled {
		t.Fatal("running launcher accepted")
	}
	releases := 0
	if release, err := stoppedAppExclusion(func() (func(), error) { return func() { releases++ }, nil }, busy); err == nil || release != nil || releases != 1 {
		t.Fatal("running worker accepted without releasing launcher")
	}
	order := ""
	release, err := stoppedAppExclusion(func() (func(), error) { return func() { order += "L" }, nil }, func() (func(), error) { return func() { order += "W" }, nil })
	if err != nil {
		t.Fatal(err)
	}
	release()
	release()
	if order != "WL" {
		t.Fatal("mutexes not released once in reverse order", order)
	}
}

func TestUninstallRequiresCanonicalInstalledExecutable(t *testing.T) {
	root := t.TempDir()
	installed := filepath.Join(root, "Programs", "ChoreZap", "ChoreZap.exe")
	downloaded := filepath.Join(root, "Downloads", "ChoreZap.exe")
	if dir, err := canonicalUninstallDir(downloaded, installed); err == nil || dir != "" {
		t.Fatal("download folder accepted", dir, err)
	}
	dir, err := canonicalUninstallDir(installed, installed)
	if err != nil || dir != filepath.Dir(installed) {
		t.Fatal(dir, err)
	}
	if !sameInstalledExecutable(strings.ToUpper(installed), installed) {
		t.Fatal("Windows case-only path rejected")
	}
	files := ownedInstallFiles(installed)
	if len(files) != 3 || files[2] != installed {
		t.Fatal(files)
	}
	for _, file := range files {
		if filepath.Dir(file) != dir {
			t.Fatal("outside canonical install folder", file)
		}
	}
}
