package main

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"
)

type Network struct {
	bootstrap     Bootstrap
	client        *http.Client
	mu            sync.Mutex
	hasRevision   bool
	revision      int64
	revisionUntil time.Time
}

func newNetwork(b Bootstrap) (*Network, error) {
	u, err := url.Parse(b.Server)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return nil, fmt.Errorf("server must be a plain HTTPS address")
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM([]byte(b.Certificate)) {
		return nil, fmt.Errorf("missing server certificate")
	}
	return &Network{bootstrap: b, client: &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (n *Network) request(path, token string, body, out any) (int, error) {
	method := "GET"
	var raw []byte
	var err error
	if body != nil {
		method = "POST"
		raw, err = json.Marshal(body)
		if err != nil {
			return 0, err
		}
	}
	req, err := http.NewRequest(method, n.bootstrap.Server+path, bytes.NewReader(raw))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-ChoreZap-Version", appVersion)
	n.mu.Lock()
	if n.hasRevision && time.Now().Before(n.revisionUntil) {
		req.Header.Set("X-ChoreZap-Policy-Revision", strconv.FormatInt(n.revision, 10))
	}
	n.mu.Unlock()
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := n.client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("server unavailable or certificate mismatch")
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, (1<<20)+1))
	if err != nil {
		return res.StatusCode, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		var msg struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &msg)
		if msg.Error == "" {
			msg.Error = fmt.Sprintf("Server returned %d", res.StatusCode)
		}
		return res.StatusCode, fmt.Errorf("%s", msg.Error)
	}
	if len(data) > 1<<20 {
		return res.StatusCode, fmt.Errorf("server response too large")
	}
	if out != nil {
		err = json.Unmarshal(data, out)
	} else {
		var ack struct {
			OK bool `json:"ok"`
		}
		if err = json.Unmarshal(data, &ack); err == nil && !ack.OK {
			err = fmt.Errorf("server did not acknowledge upload")
		}
	}
	return res.StatusCode, err
}
func (n *Network) acceptRevision(revision int64, until time.Time) {
	n.mu.Lock()
	n.hasRevision = !until.IsZero()
	n.revision, n.revisionUntil = revision, until
	n.mu.Unlock()
}
func loadAccount(dir string) (Account, error) {
	var a Account
	b, err := os.ReadFile(filepath.Join(dir, "account.bin"))
	if err == nil {
		b, err = unseal(b)
		if err == nil {
			err = json.Unmarshal(b, &a)
		}
		if err != nil {
			return a, fmt.Errorf("could not unlock saved link for this Windows account")
		}
		tag, e := accountTag()
		if e != nil || a.AccountTag != tag || len(a.Token) != 64 || len(a.Claim) != 24 {
			return a, fmt.Errorf("saved link belongs to a different Windows account")
		}
		return a, nil
	}
	if !os.IsNotExist(err) {
		return a, err
	}
	tag, err := accountTag()
	if err != nil {
		return a, err
	}
	host, _ := os.Hostname()
	a = Account{secret(32), secret(12), tag, host}
	b, err = json.Marshal(a)
	if err != nil {
		return a, err
	}
	b, err = seal(b)
	if err != nil {
		return a, err
	}
	return a, os.WriteFile(filepath.Join(dir, "account.bin"), b, 0o600)
}
func (e *Engine) syncOnce(n *Network) {
	if e.demo {
		return
	}
	e.mu.Lock()
	a := e.account
	unlinked := e.Ledger.Policy.ClientID == ""
	e.mu.Unlock()
	if unlinked {
		body := map[string]string{"claimHash": digest(a.Claim), "tokenHash": digest(a.Token), "accountTag": a.AccountTag, "name": a.Name}
		e.mu.Lock()
		if e.pin != "" {
			body["pinHash"] = digest(e.pin)
		}
		e.mu.Unlock()
		_, err := n.request("/api/companion/v2/enroll", "", body, nil)
		if err != nil {
			e.syncFailure(err)
			return
		}
	}
	var policy Policy
	requestStarted := time.Now()
	status, err := n.request("/api/companion/v2/state", a.Token, nil, &policy)
	if err != nil {
		if status == 401 {
			e.mu.Lock()
			e.LastPolicy = time.Time{}
			e.mu.Unlock()
		}
		e.syncFailure(err)
		return
	}
	if policy.Waiting {
		e.syncFailure(fmt.Errorf("Waiting for a parent to link this PC"))
		return
	}
	now := time.Now()
	if policy.ClientID == "" || (policy.Settings.Mode != "warn" && policy.Settings.Mode != "close") || policy.Day != dayOf(now) {
		e.syncFailure(fmt.Errorf("invalid or outdated server policy"))
		return
	}
	leaseUntil, validationErr := familyLease(policy, now, requestStarted)
	if validationErr != nil {
		e.syncFailure(validationErr)
		return
	}
	e.mu.Lock()
	if err := e.validateFamilyTransition(policy); err != nil {
		e.mu.Unlock()
		e.syncFailure(err)
		return
	}
	wasUnlinked := e.Ledger.Policy.ClientID == ""
	e.Ledger.Policy = policy
	if policy.FamilyPolicy != nil {
		e.Ledger.FamilySeen = true
		e.Ledger.FamilyRevision = policy.FamilyPolicy.Revision
	}
	e.Ledger.PolicyAcceptedAt = now
	e.Ledger.PolicyRequestStartedAt = requestStarted
	e.LastPolicy = now
	e.SyncError = ""
	if policy.Day == e.Ledger.Day {
		for _, app := range policy.OwnApps {
			if app.Seconds > e.Ledger.Totals[app.Executable] {
				e.Ledger.Totals[app.Executable] = app.Seconds
			}
		}
	}
	e.mu.Unlock()
	if wasUnlinked {
		registerAutostart()
	}
	if policy.FamilyPolicy != nil && policy.FamilyPolicy.Enabled {
		n.acceptRevision(policy.FamilyPolicy.Revision, leaseUntil)
	} else {
		n.acceptRevision(0, time.Time{})
	}
	// At most four queued batches per minute; each batch is immutable and acknowledged separately.
	for i := 0; i < 4; i++ {
		e.mu.Lock()
		if len(e.Ledger.Outbox) == 0 {
			e.mu.Unlock()
			break
		}
		batch := e.Ledger.Outbox[0]
		e.mu.Unlock()
		// Persist the immutable batch ID before sending: a crash after server
		// acceptance must retry the same ID, not rebuild an overlapping batch.
		if err = e.save(); err != nil {
			e.syncFailure(err)
			return
		}
		status, uploadErr := n.request("/api/companion/v2/activity", a.Token, batch, nil)
		err = uploadErr
		if status == 409 && err != nil && err.Error() == "overlap" {
			if err = e.archiveOverlap(batch); err != nil {
				e.syncFailure(err)
				return
			}
			continue
		}
		if err != nil {
			e.syncFailure(err)
			return
		}
		e.mu.Lock()
		if len(e.Ledger.Outbox) > 0 && e.Ledger.Outbox[0].ID == batch.ID {
			e.Ledger.Outbox = e.Ledger.Outbox[1:]
		}
		e.LastSync = time.Now()
		e.Ledger.LastUpload = e.LastSync
		e.mu.Unlock()
		if err = e.save(); err != nil {
			e.syncFailure(err)
			return
		}
	}
	if err = e.save(); err != nil {
		e.syncFailure(err)
	}
}
func (e *Engine) syncFailure(err error) { e.mu.Lock(); e.SyncError = err.Error(); e.mu.Unlock() }

func (e *Engine) browseOnce(n *Network) {
	if e.demo {
		return
	}
	e.mu.Lock()
	token := e.account.Token
	linked := e.Ledger.Policy.ClientID != ""
	e.mu.Unlock()
	if !linked {
		return
	}
	entries := collectBrowseHistory()
	if len(entries) == 0 {
		return
	}
	batch := BrowseBatch{Day: dayOf(time.Now()), Entries: entries}
	_, _ = n.request("/api/companion/v2/browse", token, batch, nil)
}

// Preserve the rejected payload for investigation; never pretend it uploaded.
// Aggregated app totals cannot safely be sliced to remove a partial overlap.
func (e *Engine) archiveOverlap(batch Batch) error {
	dir := filepath.Join(e.dir, "sync-conflicts")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	raw, err := json.Marshal(batch)
	if err != nil {
		return err
	}
	if err = os.WriteFile(filepath.Join(dir, digest(batch.ID)+".json"), raw, 0600); err != nil {
		return err
	}
	e.mu.Lock()
	if len(e.Ledger.Outbox) > 0 && e.Ledger.Outbox[0].ID == batch.ID {
		e.Ledger.Outbox = e.Ledger.Outbox[1:]
		e.Ledger.SyncConflicts++
	}
	e.mu.Unlock()
	return e.save()
}
