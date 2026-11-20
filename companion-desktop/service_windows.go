//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows/svc"
)

const watchdogSvcName = "ChoreZapWatchdog"

var (
	wtsapi32   = syscall.NewLazyDLL("wtsapi32.dll")
	userenvDll = syscall.NewLazyDLL("userenv.dll")
)

// installWatchdogService creates and starts the SYSTEM-level watchdog service.
// Must be called with administrator rights (the installer triggers UAC first).
func installWatchdogService(exePath string) error {
	safe := strings.ReplaceAll(exePath, `'`, `''`)
	// Binary path stored in SCM: quoted exe + " -svc" argument.
	ps := `$n='` + watchdogSvcName + `';` +
		`$b='"` + safe + `" -svc';` +
		// Remove any stale service first.
		`$svc=Get-Service -Name $n -ErrorAction SilentlyContinue;` +
		`if($svc){` +
		`Stop-Service $n -Force -ErrorAction SilentlyContinue;` +
		`Start-Sleep 2;` +
		`sc.exe delete $n | Out-Null;` +
		`Start-Sleep 1};` +
		// Create new service running as LocalSystem.
		`New-Service -Name $n -BinaryPathName $b ` +
		`-DisplayName 'ChoreZap Watchdog' ` +
		`-StartupType Automatic | Out-Null;` +
		// Failure actions: restart after 5s, 30s, 60s, indefinitely.
		`sc.exe failure $n reset= 86400 actions= restart/5000/restart/30000/restart/60000 | Out-Null;` +
		`sc.exe description $n 'Keeps ChoreZap running for parental controls.' | Out-Null;` +
		`Start-Service $n`
	out, err := exec.Command("powershell",
		"-NonInteractive", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps,
	).CombinedOutput()
	if err != nil {
		return fmt.Errorf("install watchdog service: %w: %s", err, out)
	}
	return nil
}

// removeWatchdogService stops and deletes the watchdog service.
func removeWatchdogService() {
	ps := `$n='` + watchdogSvcName + `';` +
		`Stop-Service $n -Force -ErrorAction SilentlyContinue;` +
		`Start-Sleep 2;` +
		`sc.exe delete $n | Out-Null`
	exec.Command("powershell",
		"-NonInteractive", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps,
	).Run()
}

// tryElevatedServiceInstall launches this same exe with -install-service under
// UAC elevation. The call blocks until the elevated process exits. If the user
// declines UAC or the install fails the error is silently ignored; Task
// Scheduler remains the autostart fallback.
func tryElevatedServiceInstall(exePath string) {
	safe := strings.ReplaceAll(exePath, `'`, `''`)
	ps := `Start-Process -FilePath '` + safe + `' ` +
		`-ArgumentList '-install-service' -Verb RunAs -Wait`
	exec.Command("powershell",
		"-NonInteractive", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps,
	).Run()
}

// --- Windows service runtime ---

// runAsService is called when the SCM launches this binary with -svc.
// It watches the active user session and relaunches ChoreZap.exe if it stops.
func runAsService(exePath string) error {
	return svc.Run(watchdogSvcName, &watchdogHandler{exe: exePath})
}

type watchdogHandler struct{ exe string }

func (h *watchdogHandler) Execute(_ []string, r <-chan svc.ChangeRequest, status chan<- svc.Status) (bool, uint32) {
	status <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	// Check immediately so the companion starts without waiting 30s.
	h.ensureRunning()
	for {
		select {
		case <-tick.C:
			h.ensureRunning()
		case c := <-r:
			switch c.Cmd {
			case svc.Stop, svc.Shutdown:
				status <- svc.Status{State: svc.StopPending}
				return false, 0
			}
		}
	}
}

func (h *watchdogHandler) ensureRunning() {
	sessionID := activeConsoleSessionID()
	if sessionID == 0xFFFFFFFF {
		return // No user logged in.
	}
	if companionRunningInSession(sessionID) {
		return
	}
	launchCompanionAsUser(h.exe, sessionID)
}

func activeConsoleSessionID() uint32 {
	// WTSGetActiveConsoleSessionId is in kernel32.dll.
	r, _, _ := observationKernel32.NewProc("WTSGetActiveConsoleSessionId").Call()
	return uint32(r)
}

// companionRunningInSession returns true if any ChoreZap.exe process is
// running in the given Windows session.
func companionRunningInSession(sessionID uint32) bool {
	snap, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return false
	}
	defer syscall.CloseHandle(snap)
	var pe syscall.ProcessEntry32
	pe.Size = uint32(unsafe.Sizeof(pe))
	if err = syscall.Process32First(snap, &pe); err != nil {
		return false
	}
	for {
		if strings.EqualFold(syscall.UTF16ToString(pe.ExeFile[:]), "ChoreZap.exe") {
			var sid uint32
			r, _, _ := observationKernel32.NewProc("ProcessIdToSessionId").Call(
				uintptr(pe.ProcessID), uintptr(unsafe.Pointer(&sid)))
			if r != 0 && sid == sessionID {
				return true
			}
		}
		if err = syscall.Process32Next(snap, &pe); err != nil {
			break
		}
	}
	return false
}

// launchCompanionAsUser creates a process in the user's interactive session
// using their token (via WTSQueryUserToken). The service runs as SYSTEM which
// holds SE_TCB_PRIVILEGE, so this succeeds without additional setup.
func launchCompanionAsUser(exePath string, sessionID uint32) {
	var token syscall.Handle
	r, _, _ := wtsapi32.NewProc("WTSQueryUserToken").Call(
		uintptr(sessionID), uintptr(unsafe.Pointer(&token)))
	if r == 0 {
		return
	}
	defer syscall.CloseHandle(token)

	// Build the user's environment block so APPDATA, LOCALAPPDATA, etc. resolve.
	var envBlock unsafe.Pointer
	r, _, _ = userenvDll.NewProc("CreateEnvironmentBlock").Call(
		uintptr(unsafe.Pointer(&envBlock)), uintptr(token), 0)
	if r != 0 {
		defer userenvDll.NewProc("DestroyEnvironmentBlock").Call(uintptr(envBlock))
	}

	exeW, _ := syscall.UTF16PtrFromString(exePath)
	desktop, _ := syscall.UTF16PtrFromString(`winsta0\default`)
	var si syscall.StartupInfo
	var pi syscall.ProcessInformation
	si.Cb = uint32(unsafe.Sizeof(si))
	si.Desktop = desktop

	const CREATE_UNICODE_ENVIRONMENT = 0x00000400
	var envPtr uintptr
	if envBlock != nil {
		envPtr = uintptr(envBlock)
	}
	// CreateProcessAsUserW: runs the companion as the user, in their session.
	advapi32.NewProc("CreateProcessAsUserW").Call(
		uintptr(token),
		uintptr(unsafe.Pointer(exeW)), 0, 0, 0, 0,
		uintptr(CREATE_UNICODE_ENVIRONMENT),
		envPtr, 0,
		uintptr(unsafe.Pointer(&si)),
		uintptr(unsafe.Pointer(&pi)),
	)
	if pi.Process != 0 {
		syscall.CloseHandle(pi.Process)
	}
	if pi.Thread != 0 {
		syscall.CloseHandle(pi.Thread)
	}
}
