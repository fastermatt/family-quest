//go:build integration

package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"testing"
)

// Run explicitly: go test -tags integration -run TestLiveBootstrapTLS .
// Uses only the public bootstrap and signed update manifest; no device token.
func TestLiveBootstrapTLS(t *testing.T) {
	raw, err := os.ReadFile("server.json")
	if err != nil {
		t.Fatal(err)
	}
	var b Bootstrap
	if json.Unmarshal(raw, &b) != nil {
		t.Fatal("invalid public bootstrap")
	}
	n, err := newNetwork(b)
	if err != nil {
		t.Fatal("bootstrap rejected")
	}
	res, err := n.client.Get(b.Server + "/api/companion/v2/updates/manifest.json")
	if err != nil {
		t.Fatal("public bootstrap TLS request failed")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("manifest status %d", res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 16385))
	if err != nil || len(body) > 16384 {
		t.Fatal("invalid manifest body")
	}
	if !json.Valid(body) {
		t.Fatal("manifest was not JSON")
	}
}
