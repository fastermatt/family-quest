package main

import (
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"testing"
)

func TestLocalDashboardRequiresSessionAndSameOriginExit(t *testing.T) {
	e := testEngine(t)
	address, stop, err := e.serve(func() {})
	if err != nil {
		t.Fatal(err)
	}
	defer stop()
	parsed, _ := url.Parse(address)
	base := parsed.Scheme + "://" + parsed.Host
	r, err := http.Get(base + "/api/state")
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 403 {
		t.Fatal(r.StatusCode)
	}
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	r, err = client.Get(address)
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatal(r.StatusCode)
	}
	r, err = client.Get(base + "/api/state")
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatal(r.StatusCode)
	}
	asset, assetErr := client.Get(base + "/countdown.js")
	if assetErr != nil {
		t.Fatal(assetErr)
	}
	script, _ := io.ReadAll(asset.Body)
	asset.Body.Close()
	if asset.StatusCode != 200 || !strings.Contains(string(script), "renderCountdown") {
		t.Fatal("countdown script unavailable")
	}
	req, _ := http.NewRequest("POST", base+"/api/exit", strings.NewReader(""))
	req.Header.Set("Origin", "https://untrusted.example")
	r, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 403 {
		t.Fatal(r.StatusCode)
	}
	req, _ = http.NewRequest("GET", base+"/api/state", nil)
	req.Host = "untrusted.example"
	r, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != 403 {
		t.Fatal(r.StatusCode)
	}
}
