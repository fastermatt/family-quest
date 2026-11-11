//go:build !windows

package main

func collectBrowseHistory() []BrowseEntry { return nil }
