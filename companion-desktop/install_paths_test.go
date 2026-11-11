package main

import (
	"path/filepath"
	"strings"
	"testing"
)

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
