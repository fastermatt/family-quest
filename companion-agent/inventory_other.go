//go:build !windows

package main

import "os"

// Not Windows: report only the basics so the pairing flow can be tried on a Mac.
func collectInventory() Inventory {
	inv := Inventory{AgentVersion: version}
	inv.Hostname, _ = os.Hostname()
	inv.RunningAs = os.Getenv("USER")
	return inv
}
