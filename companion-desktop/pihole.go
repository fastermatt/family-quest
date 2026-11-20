package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const piholeSchoolGroup = "ChoreZap-School"

type piholeClient struct {
	mu        sync.Mutex
	baseURL   string
	password  string
	version   int // 5 or 6; 0 = not yet detected
	sid       string
	sidExpiry time.Time
	hc        *http.Client
}

func newPiholeClient(cfg PiHoleConfig) *piholeClient {
	return &piholeClient{
		baseURL:  strings.TrimRight(cfg.URL, "/"),
		password: cfg.Password,
		hc:       &http.Client{Timeout: 10 * time.Second},
	}
}

// localIPForTarget returns the local IP that the OS would use to reach target.
// A UDP "connection" does not send any packets; it just picks the right interface.
func localIPForTarget(target string) string {
	u, err := url.Parse(target)
	if err != nil {
		return ""
	}
	host := u.Hostname()
	port := u.Port()
	if port == "" {
		if u.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	conn, err := net.Dial("udp", net.JoinHostPort(host, port))
	if err != nil {
		return ""
	}
	defer conn.Close()
	return conn.LocalAddr().(*net.UDPAddr).IP.String()
}

// pihole5Token computes the Pi-hole v5 API token from the web password.
// The token is hex(sha256(hex(sha256(password)))).
func pihole5Token(password string) string {
	h1 := sha256.Sum256([]byte(password))
	h1hex := hex.EncodeToString(h1[:])
	h2 := sha256.Sum256([]byte(h1hex))
	return hex.EncodeToString(h2[:])
}

func (c *piholeClient) detectVersion() error {
	resp, err := c.hc.Get(c.baseURL + "/api/info/version")
	if err == nil {
		resp.Body.Close()
		if resp.StatusCode == 200 || resp.StatusCode == 401 {
			c.version = 6
			return nil
		}
	}
	resp, err = c.hc.Get(c.baseURL + "/admin/api.php?summary")
	if err == nil {
		resp.Body.Close()
		if resp.StatusCode == 200 {
			c.version = 5
			return nil
		}
	}
	return fmt.Errorf("Pi-hole not reachable at %s", c.baseURL)
}

// --- Pi-hole v6 helpers ---

func (c *piholeClient) v6Auth() error {
	if c.sid != "" && time.Now().Before(c.sidExpiry) {
		return nil
	}
	body, _ := json.Marshal(map[string]string{"password": c.password})
	resp, err := c.hc.Post(c.baseURL+"/api/auth", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("pi-hole auth: %w", err)
	}
	defer resp.Body.Close()
	var result struct {
		Session struct {
			Valid bool   `json:"valid"`
			SID   string `json:"sid"`
		} `json:"session"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("pi-hole auth response: %w", err)
	}
	if !result.Session.Valid || result.Session.SID == "" {
		return fmt.Errorf("pi-hole authentication failed: check password")
	}
	c.sid = result.Session.SID
	c.sidExpiry = time.Now().Add(25 * time.Minute)
	return nil
}

func (c *piholeClient) v6Do(method, path string, body interface{}) ([]byte, error) {
	if err := c.v6Auth(); err != nil {
		return nil, err
	}
	var bodyReader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.baseURL+path, bodyReader)
	req.Header.Set("X-FTL-SID", c.sid)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func (c *piholeClient) v6GetGroups() (map[string]int, error) {
	data, err := c.v6Do("GET", "/api/groups", nil)
	if err != nil {
		return nil, err
	}
	var result struct {
		Groups []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		} `json:"groups"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse groups: %w", err)
	}
	m := make(map[string]int, len(result.Groups))
	for _, g := range result.Groups {
		m[g.Name] = g.ID
	}
	return m, nil
}

func (c *piholeClient) v6EnsureSchoolGroup() (int, error) {
	groups, err := c.v6GetGroups()
	if err != nil {
		return 0, err
	}
	if id, ok := groups[piholeSchoolGroup]; ok {
		return id, nil
	}
	data, err := c.v6Do("POST", "/api/groups", map[string]interface{}{
		"name":        piholeSchoolGroup,
		"description": "Managed by ChoreZap — school-hours content filter",
		"enabled":     true,
	})
	if err != nil {
		return 0, fmt.Errorf("create school group: %w", err)
	}
	var created struct {
		Group struct{ ID int `json:"id"` } `json:"group"`
	}
	if err := json.Unmarshal(data, &created); err != nil {
		return 0, fmt.Errorf("parse created group: %w", err)
	}
	return created.Group.ID, nil
}

func (c *piholeClient) v6SetClientGroup(localIP, groupName string) error {
	groups, err := c.v6GetGroups()
	if err != nil {
		return err
	}
	defaultID := groups["Default"] // 0 if missing, still the default

	var groupIDs []int
	if groupName == piholeSchoolGroup {
		schoolID, err := c.v6EnsureSchoolGroup()
		if err != nil {
			return err
		}
		groupIDs = []int{defaultID, schoolID}
	} else {
		groupIDs = []int{defaultID}
	}

	// Check if the client entry exists
	data, err := c.v6Do("GET", "/api/clients?extended=true", nil)
	if err != nil {
		return err
	}
	var clients struct {
		Clients []struct {
			Client string `json:"client"`
		} `json:"clients"`
	}
	if err := json.Unmarshal(data, &clients); err != nil {
		return fmt.Errorf("parse clients: %w", err)
	}
	exists := false
	for _, cl := range clients.Clients {
		if cl.Client == localIP {
			exists = true
			break
		}
	}

	if !exists {
		_, err = c.v6Do("POST", "/api/clients", map[string]interface{}{
			"client":  localIP,
			"comment": "ChoreZap companion device",
			"groups":  groupIDs,
		})
		return err
	}
	_, err = c.v6Do("PUT", "/api/clients/"+url.PathEscape(localIP), map[string]interface{}{
		"groups": groupIDs,
	})
	return err
}

// --- Pi-hole v5 helpers ---

func (c *piholeClient) v5URL(path string) string {
	token := pihole5Token(c.password)
	if strings.Contains(path, "?") {
		return c.baseURL + path + "&auth=" + token
	}
	return c.baseURL + path + "?auth=" + token
}

func (c *piholeClient) v5GET(path string) ([]byte, error) {
	resp, err := c.hc.Get(c.v5URL(path))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func (c *piholeClient) v5POST(path string, form url.Values) ([]byte, error) {
	resp, err := c.hc.PostForm(c.v5URL(path), form)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func (c *piholeClient) v5GetGroups() (map[string]int, error) {
	data, err := c.v5GET("/admin/api.php?groupmanagement&action=get_groups")
	if err != nil {
		return nil, err
	}
	var result struct {
		Data []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	m := make(map[string]int, len(result.Data))
	for _, g := range result.Data {
		m[g.Name] = g.ID
	}
	return m, nil
}

func (c *piholeClient) v5EnsureSchoolGroup() (int, error) {
	groups, err := c.v5GetGroups()
	if err != nil {
		return 0, err
	}
	if id, ok := groups[piholeSchoolGroup]; ok {
		return id, nil
	}
	_, err = c.v5POST("/admin/api.php?groupmanagement&action=add_group", url.Values{
		"name": {piholeSchoolGroup},
	})
	if err != nil {
		return 0, fmt.Errorf("create school group: %w", err)
	}
	groups, err = c.v5GetGroups()
	if err != nil {
		return 0, err
	}
	if id, ok := groups[piholeSchoolGroup]; ok {
		return id, nil
	}
	return 0, fmt.Errorf("could not create pi-hole group %s", piholeSchoolGroup)
}

func (c *piholeClient) v5SetClientGroup(localIP, groupName string) error {
	groups, err := c.v5GetGroups()
	if err != nil {
		return err
	}
	defaultID := groups["Default"]

	targetIDs := []string{fmt.Sprint(defaultID)}
	if groupName == piholeSchoolGroup {
		schoolID, err := c.v5EnsureSchoolGroup()
		if err != nil {
			return err
		}
		targetIDs = append(targetIDs, fmt.Sprint(schoolID))
	}

	data, err := c.v5GET("/admin/api.php?groupmanagement&action=get_clients")
	if err != nil {
		return err
	}
	var clients struct {
		Data []struct {
			ID int    `json:"id"`
			IP string `json:"ip"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &clients); err != nil {
		return err
	}
	existingID := -1
	for _, cl := range clients.Data {
		if cl.IP == localIP {
			existingID = cl.ID
			break
		}
	}

	form := url.Values{}
	for _, gid := range targetIDs {
		form.Add("groups[]", gid)
	}

	if existingID < 0 {
		form.Set("client", localIP)
		_, err = c.v5POST("/admin/api.php?groupmanagement&action=add_client", form)
		return err
	}
	form.Set("id", fmt.Sprint(existingID))
	_, err = c.v5POST(fmt.Sprintf("/admin/api.php?groupmanagement&action=edit_client&id=%d", existingID), form)
	return err
}

// SetClientGroup switches localIP between the default group and the school
// group. groupName should be piholeSchoolGroup or "default".
// Always called without c.mu held — it acquires it internally.
func (c *piholeClient) SetClientGroup(localIP, groupName string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.version == 0 {
		if err := c.detectVersion(); err != nil {
			return err
		}
	}
	if c.version == 6 {
		return c.v6SetClientGroup(localIP, groupName)
	}
	return c.v5SetClientGroup(localIP, groupName)
}
