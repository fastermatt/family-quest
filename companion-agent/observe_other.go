//go:build !windows

package main

import "fmt"

func checkObservationPlatform() error {
	return fmt.Errorf("foreground observation requires Windows; nothing collected")
}
func foregroundObservation() Observation { return Observation{} }
