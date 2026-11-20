//go:build !windows

package main

func maybeInstall(string) (bool, error) { return false, nil }
func runUninstall() error               { return nil }
