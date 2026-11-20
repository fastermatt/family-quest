package main

import (
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"
)

// Installation metadata is an untrusted suggestion, never permission to close an app.
// Full paths stay on the PC and are never included in a hint or upload.
type AppHint struct {
	Label  string `json:"label"`
	Source string `json:"source"`
	AppID  string `json:"appId,omitempty"`
}
type hintCache struct {
	hint *AppHint
	at   time.Time
}
type gameDetector struct{ cache map[string]hintCache }

func (d *gameDetector) lookup(path string) *AppHint {
	if path == "" || protected[strings.ToLower(filepath.Base(path))] {
		return nil
	}
	if d.cache == nil {
		d.cache = map[string]hintCache{}
	}
	if c, ok := d.cache[path]; ok && time.Since(c.at) < 30*time.Minute {
		return c.hint
	}
	if len(d.cache) >= 512 {
		d.cache = map[string]hintCache{}
	}
	hint := detectInstalledApp(path)
	d.cache[path] = hintCache{hint, time.Now()}
	return hint
}
func cleanHintLabel(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || strings.HasPrefix(strings.ToLower(s), "ms-resource:") || strings.ContainsAny(s, `/\`) {
		return ""
	}
	out := []rune{}
	for _, r := range s {
		if unicode.IsControl(r) {
			return ""
		}
		out = append(out, r)
		if len(out) >= 60 {
			break
		}
	}
	return string(out)
}
func readMetadata(path string, max int64) []byte {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > max {
		return nil
	}
	b, err := io.ReadAll(io.LimitReader(f, max+1))
	if err != nil || int64(len(b)) > max {
		return nil
	}
	return b
}

var vdfPair = regexp.MustCompile(`(?m)^\s*"(appid|name|installdir)"\s*"((?:\\.|[^"\\])*)"`)

func steamHint(data []byte, folder string) *AppHint {
	fields := map[string]string{}
	for _, m := range vdfPair.FindAllSubmatch(data, -1) {
		key := string(m[1])
		if _, ok := fields[key]; ok {
			return nil
		}
		fields[key] = strings.ReplaceAll(strings.ReplaceAll(string(m[2]), `\"`, `"`), `\\`, `\`)
	}
	if !strings.EqualFold(fields["installdir"], folder) || strings.ContainsAny(folder, `/\`) {
		return nil
	}
	label := cleanHintLabel(fields["name"])
	id := fields["appid"]
	if label == "" || len(id) > 12 || id == "" {
		return nil
	}
	for _, r := range id {
		if r < '0' || r > '9' {
			return nil
		}
	}
	return &AppHint{Label: label, Source: "steam", AppID: id}
}
func xboxHint(data []byte, relativeExe string) *AppHint {
	var game struct {
		XMLName xml.Name `xml:"Game"`
		Visuals struct {
			Name string `xml:"DefaultDisplayName,attr"`
		} `xml:"ShellVisuals"`
		Executables []struct {
			Name  string `xml:"Name,attr"`
			Label string `xml:"OverrideDisplayName,attr"`
		} `xml:"ExecutableList>Executable"`
	}
	if xml.Unmarshal(data, &game) != nil {
		return nil
	}
	normalize := func(s string) string { return strings.ToLower(strings.ReplaceAll(s, `\`, "/")) }
	for _, exe := range game.Executables {
		if normalize(exe.Name) == normalize(relativeExe) {
			label := cleanHintLabel(exe.Label)
			if label == "" {
				label = cleanHintLabel(game.Visuals.Name)
			}
			if label != "" {
				return &AppHint{Label: label, Source: "xbox"}
			}
		}
	}
	return nil
}
func detectInstalledApp(path string) *AppHint {
	dir := filepath.Dir(path)
	for n := 0; n < 8; n++ {
		if data := readMetadata(filepath.Join(dir, "MicrosoftGame.config"), 256<<10); data != nil {
			rel, err := filepath.Rel(dir, path)
			if err == nil {
				if hint := xboxHint(data, rel); hint != nil {
					return hint
				}
			}
		}
		parent := filepath.Dir(dir)
		if strings.EqualFold(filepath.Base(parent), "common") && strings.EqualFold(filepath.Base(filepath.Dir(parent)), "steamapps") {
			steamapps := filepath.Dir(parent)
			f, err := os.Open(steamapps)
			if err != nil {
				return nil
			}
			entries, _ := f.ReadDir(2048)
			f.Close()
			total := 0
			for _, entry := range entries {
				name := entry.Name()
				if entry.IsDir() || !strings.HasPrefix(name, "appmanifest_") || !strings.HasSuffix(name, ".acf") {
					continue
				}
				data := readMetadata(filepath.Join(steamapps, name), 256<<10)
				total += len(data)
				if total > 8<<20 {
					break
				}
				if hint := steamHint(data, filepath.Base(dir)); hint != nil {
					return hint
				}
			}
			return nil
		}
		if parent == dir {
			break
		}
		dir = parent
	}
	return nil
}
