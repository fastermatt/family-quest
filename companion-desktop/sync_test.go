package main

import (
	"net/http"
	"net/http/httptest"
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
