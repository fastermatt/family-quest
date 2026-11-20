package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSteamManifestNamesInstalledAppWithoutTreatingItAsGame(t *testing.T) {
	root := t.TempDir()
	steam := filepath.Join(root, "steamapps")
	game := filepath.Join(steam, "common", "Learning Tool", "bin")
	os.MkdirAll(game, 0700)
	os.WriteFile(filepath.Join(steam, "appmanifest_123.acf"), []byte("\"AppState\"\n{\n\"appid\" \"123\"\n\"name\" \"Science: Creative Tool\"\n\"installdir\" \"Learning Tool\"\n}"), 0600)
	hint := detectInstalledApp(filepath.Join(game, "tool.exe"))
	if hint == nil || hint.Label != "Science: Creative Tool" || hint.AppID != "123" || hint.Source != "steam" {
		t.Fatal(hint)
	}
	e := testEngine(t)
	e.sample(e.Ledger.Last.Add(2*time.Second), Observation{Executable: "tool.exe", Available: true, Hint: hint})
	if e.rule("tool.exe").Category != "other" {
		t.Fatal("suggestion changed enforcement")
	}
}
func TestXboxRequiresExactDeclaredExecutable(t *testing.T) {
	data := []byte(`<Game><ShellVisuals DefaultDisplayName="Example Game"/><ExecutableList><Executable Name="bin\game.exe"/></ExecutableList></Game>`)
	if xboxHint(data, "bin/game.exe") == nil {
		t.Fatal("game not detected")
	}
	if xboxHint(data, "bin/updater.exe") != nil {
		t.Fatal("unrelated executable classified")
	}
}
func TestDetectionRejectsMalformedAndPrivatePathLabels(t *testing.T) {
	if cleanHintLabel(`C:\Users\Grey\Games`) != "" || cleanHintLabel("ms-resource:AppName") != "" {
		t.Fatal("private path/resource accepted")
	}
	if steamHint([]byte(`"appid" "12"`), "Whatever") != nil {
		t.Fatal("invalid manifest accepted")
	}
	d := gameDetector{}
	if d.lookup(filepath.Join(t.TempDir(), "chrome.exe")) != nil {
		t.Fatal("protected browser suggested")
	}
}
func TestHintsPersistInImmutableBatchAndParentChoiceWins(t *testing.T) {
	e := testEngine(t)
	start := e.Ledger.Last
	hint := &AppHint{Label: "Example", Source: "steam", AppID: "123"}
	for n := 1; n <= 150; n++ {
		e.sample(start.Add(time.Duration(n)*2*time.Second), Observation{Executable: "example.exe", Available: true, Hint: hint})
	}
	if e.Ledger.Outbox[0].Apps[0].Hint.Label != "Example" {
		t.Fatal("hint missing")
	}
	e.Ledger.Policy.Rules = []Rule{{Executable: "example.exe", Label: "School Tool", Category: "school"}}
	if e.rule("example.exe").Category != "school" || e.rule("example.exe").Label != "School Tool" {
		t.Fatal("parent override lost")
	}
}
