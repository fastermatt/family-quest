package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestObservationReportEscapesNamesAndSortsTime(t *testing.T) {
	now := time.Date(2026, 10, 22, 18, 0, 0, 0, time.UTC)
	s := ObservationSummary{StartedAt: now, EndedAt: now.Add(10 * time.Minute), UnobservedSeconds: 60, Apps: []AppObservation{{Executable: `<img src=x onerror=alert(1)>`, ForegroundSeconds: 60}, {Executable: "game.exe", ForegroundSeconds: 480, WithRecentInputSeconds: 30}}}
	data := observationReportData(s)
	if data.Foreground != "9m 00s" || data.Apps[0].Name != "game.exe" || data.Apps[0].Percent != 89 {
		t.Fatal(data)
	}
	path := filepath.Join(t.TempDir(), "report.html")
	if err := writeObservationReport(path, s); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "<img src=x") || !strings.Contains(string(raw), "&lt;img") {
		t.Fatal("executable name not escaped")
	}
	if strings.Contains(string(raw), "ZgotmplZ") {
		t.Fatal("template produced invalid CSS")
	}
	if err := writeObservationReport(path, s); err == nil {
		t.Fatal("existing report overwritten")
	}
}

func TestEmptyObservationReportDoesNotClaimZeroUsage(t *testing.T) {
	data := observationReportData(ObservationSummary{StartedAt: time.Now(), EndedAt: time.Now()})
	if data.Count != 0 {
		t.Fatal(data)
	}
	if reportDuration(-1) != "Unavailable" {
		t.Fatal("negative time accepted")
	}
}

func TestSampleReportForDesignCheck(t *testing.T) {
	path := os.Getenv("CHOREZAP_SAMPLE_REPORT")
	if path == "" {
		t.Skip("optional sample report output disabled")
	}
	start := time.Date(2026, 10, 22, 21, 0, 0, 0, time.UTC)
	s := ObservationSummary{SchemaVersion: 1, Source: "SAMPLE DATA - NOT COLLECTED", StartedAt: start, EndedAt: start.Add(30 * time.Minute), UnobservedSeconds: 90, Apps: []AppObservation{{Executable: "sample-game.exe", ForegroundSeconds: 1100, WithRecentInputSeconds: 550}, {Executable: "msedge.exe", ForegroundSeconds: 400, WithRecentInputSeconds: 60}, {Executable: "steam.exe", ForegroundSeconds: 210, WithRecentInputSeconds: 80}}}
	if err := writeObservationReport(path, s); err != nil {
		t.Fatal(err)
	}
}
