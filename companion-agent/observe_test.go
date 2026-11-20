package main

import (
	"testing"
	"time"
)

func TestObservationNeverBillsGapsTransitionsOrSleep(t *testing.T) {
	o := &appObserver{}
	game := Observation{Executable: "game.exe", IdleSeconds: 0, Available: true}
	browser := Observation{Executable: "msedge.exe", IdleSeconds: 0, Available: true}
	for _, pair := range [][2]Observation{{game, browser}, {game, {}}, {{}, game}} {
		o.add(pair[0], pair[1], 2*time.Second, 2*time.Second)
	}
	o.add(game, game, time.Hour, 2*time.Second)
	if len(o.apps) != 0 {
		t.Fatal("gaps credited as foreground time")
	}
	if o.unobserved != 3606 {
		t.Fatal(o.unobserved)
	}
}

func TestForegroundAndInputAreSeparateAndNotGameClassification(t *testing.T) {
	o := &appObserver{}
	game := Observation{Executable: "unknown.exe", IdleSeconds: 0, Available: true}
	o.add(game, game, 2*time.Second, 2*time.Second)
	game.IdleSeconds = 600
	o.add(game, game, 2*time.Second, 2*time.Second)
	game.IdleSeconds = -1
	o.add(game, game, 2*time.Second, 2*time.Second)
	result := o.summary(time.Unix(0, 0), time.Unix(6, 0))
	if len(result.Apps) != 1 || result.Apps[0].ForegroundSeconds != 6 || result.Apps[0].WithRecentInputSeconds != 2 {
		t.Fatal(result)
	}
	if result.Source != "current-user-foreground-pilot" {
		t.Fatal(result.Source)
	}
}

func TestObserveRejectsUnboundedOrInvalidIntervals(t *testing.T) {
	for _, options := range [][2]time.Duration{{0, time.Second}, {2 * time.Hour, time.Second}, {time.Minute, 0}, {time.Minute, time.Minute}} {
		if observe(options[0], options[1]) == nil {
			t.Fatal("invalid pilot options accepted", options)
		}
	}
}
