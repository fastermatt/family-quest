// ChoreZap companion agent, stage 1: link this PC to ChoreZap and report what it is.
// It blocks nothing and changes no settings. Run it as the parent's admin account.
//
//	chorezap-agent.exe            link this PC (shows a code), then report
//	chorezap-agent.exe report     send a fresh report
//	chorezap-agent.exe status     show whether this PC is linked
//	chorezap-agent.exe inventory  print the report without sending it
//	chorezap-agent.exe unlink     forget the link on this PC
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

var version = "0.1.0"

// Set at build time:  -ldflags "-X main.defaultServer=https://..."
var defaultServer = "https://family-tasks-deploy.vercel.app"

func main() {
	server := flag.String("server", envOr("CHOREZAP_SERVER", defaultServer), "ChoreZap address")
	flag.Parse()
	cmd := "link"
	if flag.NArg() > 0 {
		cmd = strings.ToLower(flag.Arg(0))
	}
	*server = strings.TrimRight(*server, "/")

	switch cmd {
	case "link":
		fail(link(*server))
	case "report":
		fail(report())
	case "status":
		cfg, err := loadConfig()
		if err != nil {
			fmt.Println("Not linked.")
			return
		}
		fmt.Println("Linked to", cfg.Server)
	case "inventory":
		b, _ := json.MarshalIndent(collectInventory(), "", "  ")
		fmt.Println(string(b))
	case "unlink":
		fail(removeConfig())
		fmt.Println("Unlinked on this PC. Also remove it in ChoreZap (Filters > Your PCs).")
	default:
		fmt.Println("Unknown command. Try: link, report, status, inventory, unlink")
		os.Exit(2)
	}
}

func fail(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

var client = &http.Client{Timeout: 20 * time.Second}

func postJSON(url, bearer string, in, out any) (int, error) {
	body, _ := json.Marshal(in)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	res, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if out != nil {
		_ = json.Unmarshal(data, out)
	}
	return res.StatusCode, nil
}

func link(server string) error {
	if cfg, err := loadConfig(); err == nil {
		fmt.Println("This PC is already linked to", cfg.Server)
		fmt.Println("Run 'unlink' first to link it again.")
		return nil
	}
	host, _ := os.Hostname()
	var start struct {
		PairID           string `json:"pairId"`
		Code             string `json:"code"`
		PollSecret       string `json:"pollSecret"`
		ExpiresInSeconds int    `json:"expiresInSeconds"`
		Error            string `json:"error"`
	}
	code, err := postJSON(server+"/api/companion/pair/start", "", map[string]string{"name": host}, &start)
	if err != nil {
		return fmt.Errorf("could not reach ChoreZap at %s: %w", server, err)
	}
	if code != 200 {
		return fmt.Errorf("ChoreZap said no (%d): %s", code, start.Error)
	}

	fmt.Println()
	fmt.Println("  On your phone: ChoreZap > Filters > Your PCs > enter this code")
	fmt.Println()
	fmt.Printf("        %s %s\n\n", start.Code[:3], start.Code[3:])
	fmt.Printf("  The code works for %d minutes. Waiting...\n", start.ExpiresInSeconds/60)

	deadline := time.Now().Add(time.Duration(start.ExpiresInSeconds) * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(3 * time.Second)
		var poll struct {
			Status      string `json:"status"`
			DeviceToken string `json:"deviceToken"`
		}
		status, err := postJSON(server+"/api/companion/pair/poll", "", map[string]string{"pairId": start.PairID, "pollSecret": start.PollSecret}, &poll)
		if err != nil {
			continue // network blip: keep waiting
		}
		if status == 410 || poll.Status == "expired" {
			break
		}
		if poll.Status == "approved" && poll.DeviceToken != "" {
			if err := saveConfig(Config{Server: server, DeviceToken: poll.DeviceToken}); err != nil {
				return fmt.Errorf("linked, but could not save the link on this PC: %w", err)
			}
			fmt.Println("  Linked.")
			return report()
		}
	}
	return fmt.Errorf("the code expired. Run the app again for a new one")
}

func report() error {
	cfg, err := loadConfig()
	if err != nil {
		return fmt.Errorf("this PC is not linked yet. Run without arguments to link it")
	}
	var res struct {
		Error string `json:"error"`
	}
	code, err := postJSON(cfg.Server+"/api/companion/report", cfg.DeviceToken, collectInventory(), &res)
	if err != nil {
		return fmt.Errorf("could not reach ChoreZap: %w", err)
	}
	if code == 401 {
		return fmt.Errorf("ChoreZap no longer recognizes this PC (%s). Run 'unlink', then link again", res.Error)
	}
	if code != 200 {
		return fmt.Errorf("report failed (%d): %s", code, res.Error)
	}
	fmt.Println("  Report sent. Check ChoreZap > Filters > Your PCs.")
	return nil
}
