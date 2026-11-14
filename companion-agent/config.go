package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	Server      string `json:"server"`
	DeviceToken string `json:"deviceToken"`
}

func configDir() string {
	if pd := os.Getenv("ProgramData"); pd != "" {
		return filepath.Join(pd, "ChoreZap")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".chorezap")
}

func configPath() string { return filepath.Join(configDir(), "device.json") }

func loadConfig() (Config, error) {
	var c Config
	b, err := os.ReadFile(configPath())
	if err != nil {
		return c, err
	}
	err = json.Unmarshal(b, &c)
	if err == nil && (c.Server == "" || c.DeviceToken == "") {
		err = os.ErrNotExist
	}
	return c, err
}

func saveConfig(c Config) error {
	if err := os.MkdirAll(configDir(), 0o700); err != nil {
		return err
	}
	b, _ := json.Marshal(c)
	if err := os.WriteFile(configPath(), b, 0o600); err != nil {
		return err
	}
	return lockDown(configDir())
}

func removeConfig() error {
	err := os.Remove(configPath())
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
