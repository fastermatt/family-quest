package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

// What the PC tells ChoreZap about itself. Stage 1 reports and enforces nothing.
// Field names match the server's cleanInventory (src/lib/companion/pairing.ts).
type Account struct {
	Name    string `json:"name"`
	Type    string `json:"type"` // local | microsoft | unknown
	IsAdmin bool   `json:"isAdmin"`
	Enabled bool   `json:"enabled"`
}

type WindowsInfo struct {
	Edition        string `json:"edition"`
	DisplayVersion string `json:"displayVersion"`
	Build          string `json:"build"`
}

// Status is how the watcher is doing, so ChoreZap can show "Watching" and the last problem.
type Status struct {
	Watching     bool   `json:"watching"`
	Samples      int    `json:"samples"`
	LastSampleAt string `json:"lastSampleAt"`
	LastUploadAt string `json:"lastUploadAt"`
	LastError    string `json:"lastError"`
}

type Inventory struct {
	AgentVersion  string      `json:"agentVersion"`
	Hostname      string      `json:"hostname"`
	Windows       WindowsInfo `json:"windows"`
	RunningAs     string      `json:"runningAs"`
	Accounts      []Account   `json:"accounts"`
	Browsers      []string    `json:"browsers"`
	Avast         bool        `json:"avast"`
	OtherSecurity []string    `json:"otherSecurity"`
	Status        Status      `json:"status"`
}

const adminGroupSID = "S-1-5-32-544"

// parseRegValue pulls a value out of `reg query` output:
//
//	EditionID    REG_SZ    Core
func parseRegValue(output, name string) string {
	for _, line := range strings.Split(strings.ReplaceAll(output, "\r", ""), "\n") {
		f := strings.Fields(line)
		if len(f) >= 3 && strings.EqualFold(f[0], name) && strings.HasPrefix(f[1], "REG_") {
			return strings.Join(f[2:], " ")
		}
	}
	return ""
}

type psUser struct {
	Name    string `json:"Name"`
	Enabled bool   `json:"Enabled"`
	Source  string `json:"Source"`
	SID     string `json:"SID"`
}

// buildAccounts combines Get-LocalUser output with the SIDs of Administrators members.
// Both are JSON arrays (PowerShell is asked for arrays even for one item).
func buildAccounts(usersJSON, adminSIDsJSON string) ([]Account, error) {
	var users []psUser
	if err := json.Unmarshal([]byte(strings.TrimSpace(usersJSON)), &users); err != nil {
		return nil, fmt.Errorf("users: %w", err)
	}
	var admins []string
	if s := strings.TrimSpace(adminSIDsJSON); s != "" {
		if err := json.Unmarshal([]byte(s), &admins); err != nil {
			return nil, fmt.Errorf("admins: %w", err)
		}
	}
	isAdmin := map[string]bool{}
	for _, a := range admins {
		isAdmin[strings.ToUpper(a)] = true
	}
	out := make([]Account, 0, len(users))
	for _, u := range users {
		t := "unknown"
		switch strings.ToLower(u.Source) {
		case "local":
			t = "local"
		case "microsoftaccount":
			t = "microsoft"
		}
		out = append(out, Account{Name: u.Name, Type: t, IsAdmin: isAdmin[strings.ToUpper(u.SID)], Enabled: u.Enabled})
	}
	return out, nil
}
