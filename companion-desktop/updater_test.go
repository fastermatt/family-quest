package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSignedUpdateRejectsTampering(t *testing.T) {
	b, _ := os.ReadFile("testdata/update-test.json")
	r, e := verifyRelease(b)
	if e != nil || r.Sequence != 7 {
		t.Fatal(r, e)
	}
	var s signedRelease
	json.Unmarshal(b, &s)
	payload, _ := base64.StdEncoding.DecodeString(s.Payload)
	payload[0] = 'X'
	s.Payload = base64.StdEncoding.EncodeToString(payload)
	bad, _ := json.Marshal(s)
	if _, e = verifyRelease(bad); e == nil {
		t.Fatal("tampered manifest accepted")
	}
	p := filepath.Join(t.TempDir(), "app.exe")
	os.WriteFile(p, []byte("test binary, never a release"), 0600)
	if e = verifyBinary(p, r); e != nil {
		t.Fatal(e)
	}
	os.WriteFile(p, []byte("corrupt"), 0600)
	if verifyBinary(p, r) == nil {
		t.Fatal("corrupt executable accepted")
	}
}
func TestStageVerifiedOnlyAndNoDowngrade(t *testing.T) {
	manifest, _ := os.ReadFile("testdata/update-test.json")
	corrupt := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/companion/v2/updates/manifest.json" {
			w.Write(manifest)
		} else if corrupt {
			w.Write([]byte("wrong"))
		} else {
			w.Write([]byte("test binary, never a release"))
		}
	}))
	defer server.Close()
	n := &Network{bootstrap: Bootstrap{Server: server.URL}, client: server.Client()}
	dir := t.TempDir()
	if e := stageRelease(n, dir, 7); e != nil {
		t.Fatal(e)
	}
	if _, e := os.Stat(filepath.Join(dir, "pending.json")); !os.IsNotExist(e) {
		t.Fatal("downgrade staged")
	}
	corrupt = true
	if stageRelease(n, dir, 6) == nil {
		t.Fatal("corrupt download accepted")
	}
	if _, e := os.Stat(filepath.Join(dir, "pending.json")); !os.IsNotExist(e) {
		t.Fatal("invalid release selected")
	}
	corrupt = false
	if e := stageRelease(n, dir, 6); e != nil {
		t.Fatal(e)
	}
	if _, _, e := readRelease(dir, "pending.json"); e != nil {
		t.Fatal(e)
	}
}

func TestPinnedManifestSurvivesPendingReplacement(t *testing.T) {
	dir := t.TempDir()
	manifest, err := os.ReadFile("testdata/update-test.json")
	if err != nil {
		t.Fatal(err)
	}
	r, err := verifyRelease(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, r.SHA256+".exe"), []byte("test binary, never a release"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "pending.json"), manifest, 0600); err != nil {
		t.Fatal(err)
	}
	selected, _, pinned, err := readPinnedRelease(dir, "pending.json")
	if err != nil || selected != r {
		t.Fatal(selected, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "pending.json"), []byte("changed while worker starts"), 0600); err != nil {
		t.Fatal(err)
	}
	removePendingIfMatches(dir, selected)
	if _, err := os.Stat(filepath.Join(dir, "pending.json")); err != nil {
		t.Fatal("replacement removed", err)
	}
	if err := writeActiveManifest(dir, pinned); err != nil {
		t.Fatal(err)
	}
	active, _, err := readRelease(dir, "active.json")
	if err != nil || active != selected {
		t.Fatal("wrong active manifest", active, err)
	}
}

func TestStartupHealthSuccessCrashAndTimeout(t *testing.T) {
	p := filepath.Join(t.TempDir(), "ready")
	done := make(chan error, 1)
	if waitStartup(done, p, 10*time.Millisecond) {
		t.Fatal("missing health accepted")
	}
	done <- fmt.Errorf("crashed")
	if waitStartup(done, p, time.Second) {
		t.Fatal("crash accepted")
	}
	os.WriteFile(p, []byte("healthy"), 0600)
	if !waitStartup(done, p, time.Second) {
		t.Fatal("health ignored")
	}
}

func TestCrashRecoveryBudgetAndIntentionalStop(t *testing.T) {
	attempts := 0
	if _, retry := recoveryDelay(nil, time.Second, &attempts); retry {
		t.Fatal("normal exit restarted")
	}
	for i := 1; i <= 3; i++ {
		delay, retry := recoveryDelay(fmt.Errorf("crash"), time.Second, &attempts)
		if !retry || delay != time.Duration(i)*5*time.Second {
			t.Fatal("unexpected recovery", delay, retry)
		}
	}
	if _, retry := recoveryDelay(fmt.Errorf("crash"), time.Second, &attempts); retry {
		t.Fatal("unbounded crash loop")
	}
	if delay, retry := recoveryDelay(fmt.Errorf("crash"), 10*time.Minute, &attempts); !retry || delay != 5*time.Second {
		t.Fatal("healthy runtime did not reset budget")
	}
	if _, retry := recoveryDelay(nil, 20*time.Minute, &attempts); retry {
		t.Fatal("intentional stop restarted")
	}
}
