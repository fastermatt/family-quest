package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestUploadRequiresExplicitJSONAcknowledgement(t *testing.T) {
	for _, body := range []string{"<html>login</html>", `{}`, `{"ok":false}`, `{"ok":true}`} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(body)) }))
		n := &Network{bootstrap: Bootstrap{Server: s.URL}, client: s.Client()}
		_, err := n.request("/upload", "", map[string]string{}, nil)
		s.Close()
		if (err == nil) != (body == `{"ok":true}`) {
			t.Fatalf("body %s: %v", body, err)
		}
	}
}
func TestSleepAcrossMidnightDoesNotCreateHoursOfUsage(t *testing.T) {
	e := testEngine(t)
	before := time.Date(2026, 10, 22, 23, 0, 0, 0, denver)
	e.Ledger.Last = before
	e.Ledger.BucketStart = before
	e.Ledger.Day = dayOf(before)
	now := before.Add(8 * time.Hour)
	o := Observation{Executable: "game.exe", Available: true}
	e.sample(now, o)
	e.sample(now.Add(2*time.Second), o)
	if e.Ledger.Day != dayOf(now) || e.Ledger.BucketGaps != 0 || e.Ledger.Totals["game.exe"] != 2 {
		t.Fatal(e.Ledger)
	}
}

func TestOverlapArchivedWithoutLosingLaterBatches(t *testing.T) {
	e := testEngine(t)
	b := Batch{ID: batchID(), Start: time.Now().Add(-time.Minute), End: time.Now(), Version: appVersion}
	next := b
	next.ID = batchID()
	e.Ledger.Outbox = []Batch{b, next}
	if err := e.archiveOverlap(b); err != nil {
		t.Fatal(err)
	}
	if len(e.Ledger.Outbox) != 1 || e.Ledger.Outbox[0].ID != next.ID || e.Ledger.SyncConflicts != 1 {
		t.Fatal(e.Ledger)
	}
	if e.LastSync.IsZero() == false {
		t.Fatal("conflict incorrectly marked uploaded")
	}
}

func TestRecordedGameTimeUploadsWhenSettingsFail(t *testing.T) {
	for _, status := range []int{503, 401} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			e := testEngine(t)
			e.demo = false
			e.account.Token = "linked-device"
			e.Ledger.Policy.ClientID = "linked"
			e.Ledger.Policy.Settings.Mode = "warn"
			e.LastPolicy = time.Now().Add(-time.Minute)
			accepted := e.LastPolicy
			start := e.Ledger.Last
			game := Observation{Executable: "cod.exe", Available: true}
			e.sample(start.Add(2*time.Second), game)
			e.sample(start.Add(4*time.Second), game)
			if err := e.checkpointUsage(); err != nil {
				t.Fatal(err)
			}
			queued := e.Ledger.Outbox[0]
			seen := make(chan Batch, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/api/companion/v2/state":
					http.Error(w, "settings unavailable", status)
				case "/api/companion/v2/activity":
					var uploaded Batch
					if err := json.NewDecoder(r.Body).Decode(&uploaded); err != nil {
						t.Error(err)
					}
					seen <- uploaded
					w.Write([]byte(`{"ok":true}`))
				default:
					t.Errorf("unexpected request %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			e.syncOnce(&Network{bootstrap: Bootstrap{Server: server.URL}, client: server.Client()})
			if status == 401 {
				if len(seen) != 0 || len(e.Ledger.Outbox) != 1 || !e.LastPolicy.IsZero() {
					t.Fatal("revoked link must retain its local batch and clear policy freshness")
				}
				return
			}
			if len(seen) != 1 {
				t.Fatal("settings outage stranded a recorded game batch")
			}
			got := <-seen
			if got.ID != queued.ID || len(got.Apps) != 1 || got.Apps[0].Executable != "cod.exe" || got.Apps[0].Seconds != 2 {
				t.Fatalf("unexpected game batch: %+v", got)
			}
			if len(e.Ledger.Outbox) != 0 || e.LastSync.IsZero() || !e.LastPolicy.Equal(accepted) || !strings.Contains(e.SyncError, "Settings:") {
				t.Fatal("upload acknowledgement must not change the accepted policy or hide its error")
			}
		})
	}
}

func TestLegacyPolicyAcknowledgesAppliedLimitAndPause(t *testing.T) {
	e := testEngine(t)
	e.Ledger.Policy.ClientID = "pc"
	var received []string
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = append(received, r.Header.Get("X-ChoreZap-Policy-Revision"))
		now := time.Now()
		day := dayOf(now)
		cap := 30
		p := Policy{
			ClientID: "pc", Day: day, ServerTime: now.Format(time.RFC3339),
			Settings:     Settings{GamingMinutes: &cap, Paused: true, Mode: "close"},
			FamilyPolicy: &FamilyPolicy{Revision: 3, Day: day, Timezone: "America/Denver"},
		}
		if err := json.NewEncoder(w).Encode(p); err != nil {
			t.Error(err)
		}
	}))
	defer s.Close()
	n := &Network{bootstrap: Bootstrap{Server: s.URL}, client: s.Client()}
	for range 2 {
		if _, err := e.refreshPolicy(n, "linked"); err != nil {
			t.Fatal(err)
		}
	}
	if len(received) != 2 || received[0] != "" || received[1] != "3" {
		t.Fatalf("unexpected receipt headers %q", received)
	}
	if p := e.Ledger.Policy; !p.Settings.Paused || *p.Settings.GamingMinutes != 30 || p.FamilyPolicy.Enabled {
		t.Fatalf("legacy controls were not applied: %+v", p)
	}
}
