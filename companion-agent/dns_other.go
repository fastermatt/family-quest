//go:build !windows

package main

import (
	"os"
	"strings"
)

// Not Windows: for trying the pipeline on a Mac, CHOREZAP_FAKE_DNS="a.com,b.net" stands in for the cache.
func dnsCacheNames() []string {
	if v := os.Getenv("CHOREZAP_FAKE_DNS"); v != "" {
		return strings.Split(v, ",")
	}
	return nil
}
