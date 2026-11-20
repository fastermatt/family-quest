//go:build windows

package main

import (
	"fmt"
	"os/exec"
)

// The device token must not be readable by Grey's standard account.
// Remove inherited permissions; allow only SYSTEM and Administrators.
func lockDown(dir string) error {
	out, err := exec.Command("icacls", dir, "/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F").CombinedOutput()
	if err != nil {
		return fmt.Errorf("could not restrict access to %s: %v: %s", dir, err, out)
	}
	return nil
}
