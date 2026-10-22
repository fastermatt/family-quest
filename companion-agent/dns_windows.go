//go:build windows

package main

import "strings"

// Names Windows has looked up recently (the DNS client cache is machine-wide,
// so this includes every user's lookups). Read-only.
func dnsCacheNames() []string {
	out := ps(`Get-DnsClientCache | ForEach-Object { $_.Entry }`)
	return strings.Split(strings.ReplaceAll(out, "\r", ""), "\n")
}
