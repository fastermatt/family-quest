//go:build windows

package main

import (
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
)

func run(name string, args ...string) string {
	out, err := exec.Command(name, args...).Output()
	if err != nil {
		return ""
	}
	return string(out)
}

func ps(script string) string {
	return run("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
}

// anyMatch reports whether any pattern (globs allowed) matches a file.
func anyMatch(patterns ...string) bool {
	for _, p := range patterns {
		if m, _ := filepath.Glob(p); len(m) > 0 {
			return true
		}
	}
	return false
}

func collectInventory() Inventory {
	inv := Inventory{AgentVersion: version}
	inv.Hostname, _ = os.Hostname()
	if u, err := user.Current(); err == nil {
		inv.RunningAs = u.Username
	}

	cv := run("reg", "query", `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`)
	inv.Windows = WindowsInfo{
		Edition:        parseRegValue(cv, "EditionID"),
		DisplayVersion: parseRegValue(cv, "DisplayVersion"),
		Build:          parseRegValue(cv, "CurrentBuild"),
	}

	users := ps(`ConvertTo-Json -Compress -InputObject @(Get-LocalUser | ForEach-Object { @{ Name = $_.Name; Enabled = [bool]$_.Enabled; Source = "$($_.PrincipalSource)"; SID = $_.SID.Value } })`)
	admins := ps(`ConvertTo-Json -Compress -InputObject @(Get-LocalGroupMember -SID ` + adminGroupSID + ` | ForEach-Object { $_.SID.Value })`)
	if accts, err := buildAccounts(users, admins); err == nil {
		inv.Accounts = accts
	}

	pf, pf86 := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)")
	// Per-user installs live under each profile, so scan C:\Users\*.
	userInstalls := `C:\Users\*\AppData\Local\`
	found := func(label string, patterns ...string) {
		if anyMatch(patterns...) {
			inv.Browsers = append(inv.Browsers, label)
		}
	}
	found("Edge", pf86+`\Microsoft\Edge\Application\msedge.exe`, pf+`\Microsoft\Edge\Application\msedge.exe`)
	found("Chrome", pf+`\Google\Chrome\Application\chrome.exe`, pf86+`\Google\Chrome\Application\chrome.exe`, userInstalls+`Google\Chrome\Application\chrome.exe`)
	found("Firefox", pf+`\Mozilla Firefox\firefox.exe`, pf86+`\Mozilla Firefox\firefox.exe`)
	found("Brave", pf+`\BraveSoftware\Brave-Browser\Application\brave.exe`, userInstalls+`BraveSoftware\Brave-Browser\Application\brave.exe`)
	found("Opera", userInstalls+`Programs\Opera*\opera.exe`, userInstalls+`Programs\Opera*\launcher.exe`)
	found("Avast Secure Browser", pf+`\AVAST Software\Browser\Application\AvastBrowser.exe`, pf86+`\AVAST Software\Browser\Application\AvastBrowser.exe`)

	inv.Avast = anyMatch(pf+`\Avast Software\Avast\AvastUI.exe`, pf86+`\Avast Software\Avast\AvastUI.exe`)
	if strings.Contains(strings.ToLower(ps(`(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct | ForEach-Object { $_.displayName }) -join ';'`)), "malwarebytes") {
		inv.OtherSecurity = append(inv.OtherSecurity, "Malwarebytes")
	}
	return inv
}
