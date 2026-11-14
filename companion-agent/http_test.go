package main

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type responseTransport func(*http.Request) (*http.Response, error)

func (f responseTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func testClient(t *testing.T, body string) {
	t.Helper()
	previous := client
	client = &http.Client{Timeout: time.Second, CheckRedirect: previous.CheckRedirect, Transport: responseTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})}
	t.Cleanup(func() { client = previous })
}

func TestHTTPRejectsInvalidOrOversizedSuccessResponse(t *testing.T) {
	for _, body := range []string{"not json", strings.Repeat("x", (1<<20)+1)} {
		t.Run(body[:1], func(t *testing.T) {
			testClient(t, body)
			var out map[string]any
			if _, err := postJSON("https://fixture.invalid", "", map[string]string{}, &out); err == nil {
				t.Fatal("invalid response accepted")
			}
		})
	}
}

func TestDeviceSecretsDoNotFollowRedirects(t *testing.T) {
	previous := client
	calls := 0
	client = &http.Client{CheckRedirect: previous.CheckRedirect, Transport: responseTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 307, Header: http.Header{"Location": []string{"https://other.invalid/"}}, Body: io.NopCloser(strings.NewReader("{}")), Request: r}, nil
	})}
	defer func() { client = previous }()
	code, err := postJSON("https://fixture.invalid/", "fixture-token", map[string]string{}, nil)
	if err != nil || code != 307 || calls != 1 {
		t.Fatalf("redirect followed: %d %d %v", code, calls, err)
	}
}

func TestMalformedPairingCannotPanicOrWait(t *testing.T) {
	t.Setenv("ProgramData", t.TempDir())
	testClient(t, `{"code":"1","pairId":"fixture","pollSecret":"fixture","expiresInSeconds":600}`)
	if err := link("https://fixture.invalid"); err == nil {
		t.Fatal("invalid code accepted")
	}
}
