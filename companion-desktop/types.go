package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"time"
)

const appVersion = "0.3.7"

type Observation struct {
	Executable     string
	IdleSeconds    int64
	Available      bool
	Path           string // Local only: never serialized or uploaded.
	Hint           *AppHint
	PID            uint32
	BackgroundGame bool // Running in this session, but not the foreground window.
}
type AppTime struct {
	Executable string   `json:"executable"`
	Seconds    float64  `json:"seconds"`
	Hint       *AppHint `json:"hint,omitempty"`
}
type Rule struct {
	Executable   string `json:"executable"`
	Label        string `json:"label"`
	Category     string `json:"category"`
	DailyMinutes *int   `json:"daily_minutes"`
}
type Settings struct {
	GamingMinutes      *int     `json:"gaming_minutes"`
	GamingSeconds      *float64 `json:"-"`
	Paused             bool     `json:"paused"`
	Mode               string   `json:"mode"`
	StopPinRequired    bool     `json:"stop_pin_required"`
	BlockedExecutables []string `json:"blocked_executables"`
}

func (s *Settings) UnmarshalJSON(data []byte) error {
	var wire struct {
		GamingMinutes      *float64 `json:"gaming_minutes"`
		Paused             bool     `json:"paused"`
		Mode               string   `json:"mode"`
		StopPinRequired    bool     `json:"stop_pin_required"`
		LegacyStopPin      string   `json:"stop_pin"`
		BlockedExecutables []string `json:"blocked_executables"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	s.Paused, s.Mode = wire.Paused, wire.Mode
	s.StopPinRequired = wire.StopPinRequired || wire.LegacyStopPin != ""
	s.BlockedExecutables = wire.BlockedExecutables
	s.GamingMinutes, s.GamingSeconds = nil, nil
	if wire.GamingMinutes != nil {
		if *wire.GamingMinutes < 0 || *wire.GamingMinutes > 100000 || math.IsNaN(*wire.GamingMinutes) || math.IsInf(*wire.GamingMinutes, 0) {
			return fmt.Errorf("invalid gaming minutes")
		}
		whole := int(math.Floor(*wire.GamingMinutes))
		seconds := *wire.GamingMinutes * 60
		s.GamingMinutes, s.GamingSeconds = &whole, &seconds
	}
	return nil
}
func (s Settings) MarshalJSON() ([]byte, error) {
	var minutes any = s.GamingMinutes
	if s.GamingSeconds != nil {
		minutes = *s.GamingSeconds / 60
	}
	return json.Marshal(struct {
		GamingMinutes      any      `json:"gaming_minutes"`
		Paused             bool     `json:"paused"`
		Mode               string   `json:"mode"`
		StopPinRequired    bool     `json:"stop_pin_required"`
		BlockedExecutables []string `json:"blocked_executables,omitempty"`
	}{minutes, s.Paused, s.Mode, s.StopPinRequired, s.BlockedExecutables})
}

type FamilyPolicy struct {
	Enabled   bool   `json:"enabled"`
	Revision  int64  `json:"revision"`
	Day       string `json:"day"`
	Timezone  string `json:"timezone"`
	Eligible  bool   `json:"eligible"`
	Allowed   bool   `json:"allowed"`
	Reason    string `json:"reason"`
	ExpiresAt string `json:"expiresAt"`
}
type Policy struct {
	Waiting            bool          `json:"waiting"`
	ClientID           string        `json:"clientId"`
	ChildName          string        `json:"childName"`
	ServerTime         string        `json:"serverTime"`
	Day                string        `json:"day"`
	Rules              []Rule        `json:"rules"`
	Settings           Settings      `json:"settings"`
	OwnApps            []AppTime     `json:"ownApps"`
	OtherApps          []AppTime     `json:"otherApps"`
	FamilyPolicy       *FamilyPolicy `json:"familyPolicy,omitempty"`
	PolicyLeaseSeconds *int          `json:"policyLeaseSeconds,omitempty"`
}
type Batch struct {
	ID      string    `json:"id"`
	Start   time.Time `json:"start"`
	End     time.Time `json:"end"`
	Apps    []AppTime `json:"apps"`
	Gaps    float64   `json:"gaps"`
	Version string    `json:"version"`
}
type Account struct {
	Token      string `json:"token"`
	Claim      string `json:"claim"`
	AccountTag string `json:"accountTag"`
	Name       string `json:"name"`
}
type Bootstrap struct {
	Server      string `json:"server"`
	Certificate string `json:"certificate"`
}

func secret(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func digest(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func batchID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}

var denver, _ = time.LoadLocation("America/Denver")

func dayOf(t time.Time) string { return t.In(denver).Format("2006-01-02") }
