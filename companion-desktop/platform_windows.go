//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"syscall"
	"unsafe"
)

var crypt32 = syscall.NewLazyDLL("crypt32.dll")
var notificationActive atomic.Bool

func acquireInstance() (func(), error)        { return acquireNamedInstance("Desktop") }
func acquireUpdaterInstance() (func(), error) { return acquireNamedInstance("Updater") }
func acquireUpdateStageLock() (func(), error) {
	runtime.LockOSThread()
	p, err := syscall.GetCurrentProcess()
	if err != nil {
		runtime.UnlockOSThread()
		return nil, err
	}
	sid, err := processSID(p)
	if err != nil {
		runtime.UnlockOSThread()
		return nil, err
	}
	name, _ := syscall.UTF16PtrFromString(`Local\ChoreZapStage-` + digest(sid))
	h, _, err := observationKernel32.NewProc("CreateMutexW").Call(0, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		runtime.UnlockOSThread()
		return nil, err
	}
	state, _, waitErr := observationKernel32.NewProc("WaitForSingleObject").Call(h, 20000)
	if state != 0 && state != 0x80 {
		syscall.CloseHandle(syscall.Handle(h))
		runtime.UnlockOSThread()
		return nil, fmt.Errorf("update staging busy: %v", waitErr)
	}
	return func() {
		observationKernel32.NewProc("ReleaseMutex").Call(h)
		syscall.CloseHandle(syscall.Handle(h))
		runtime.UnlockOSThread()
	}, nil
}
func acquireNamedInstance(kind string) (func(), error) {
	p, err := syscall.GetCurrentProcess()
	if err != nil {
		return nil, err
	}
	sid, err := processSID(p)
	if err != nil {
		return nil, err
	}
	name, _ := syscall.UTF16PtrFromString(`Local\ChoreZap` + kind + "-" + digest(sid))
	h, _, callErr := observationKernel32.NewProc("CreateMutexW").Call(0, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return nil, callErr
	}
	if callErr == syscall.Errno(183) {
		syscall.CloseHandle(syscall.Handle(h))
		return nil, fmt.Errorf("ChoreZap is already running in this Windows account. Use its existing dashboard.")
	}
	return func() { syscall.CloseHandle(syscall.Handle(h)) }, nil
}
func accountTag() (string, error) {
	p, err := syscall.GetCurrentProcess()
	if err != nil {
		return "", err
	}
	sid, err := processSID(p)
	return digest(sid), err
}

type blob struct {
	Size uint32
	Data *byte
}

func seal(data []byte) ([]byte, error)   { return cryptData(data, "CryptProtectData") }
func unseal(data []byte) ([]byte, error) { return cryptData(data, "CryptUnprotectData") }
func cryptData(data []byte, name string) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty protected data")
	}
	in := blob{uint32(len(data)), &data[0]}
	var out blob
	ok, _, err := crypt32.NewProc(name).Call(uintptr(unsafe.Pointer(&in)), 0, 0, 0, 0, 1, uintptr(unsafe.Pointer(&out)))
	runtime.KeepAlive(data)
	if ok == 0 {
		return nil, err
	}
	defer observationKernel32.NewProc("LocalFree").Call(uintptr(unsafe.Pointer(out.Data)))
	return append([]byte(nil), unsafe.Slice(out.Data, out.Size)...), nil
}
var advapi32 = syscall.NewLazyDLL("advapi32.dll")

// registerAutostart registers ChoreZap to start at login via Task Scheduler
// (with restart-on-failure so the supervisor is relaunched if killed) and falls
// back to a registry Run key. The named mutex in acquireInstance prevents a
// double-start if both triggers fire. Clean exits (code 0, e.g. "Stop app")
// are never restarted; only non-zero exits (kill / crash) trigger a restart.
func registerAutostart() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	// Escape single-quotes for the PowerShell string literal.
	safePath := strings.ReplaceAll(exe, `'`, `''`)
	ps := `$a=New-ScheduledTaskAction -Execute '` + safePath + `';` +
		`$t=New-ScheduledTaskTrigger -AtLogOn;` +
		`$s=New-ScheduledTaskSettingsSet -RestartCount 10 ` +
		`-RestartInterval (New-TimeSpan -Minutes 1) ` +
		`-ExecutionTimeLimit 0 ` +
		`-DisallowStartIfOnBatteries $false ` +
		`-StopIfGoingOnBatteries $false;` +
		`$p=New-ScheduledTaskPrincipal ` +
		`-UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) ` +
		`-LogonType Interactive -RunLevel Limited;` +
		`Register-ScheduledTask -TaskName ChoreZap -Action $a -Trigger $t -Settings $s -Principal $p -Force`
	exec.Command("powershell", "-NonInteractive", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps).Run()

	// Registry Run key as a belt-and-suspenders fallback.
	subkey, _ := syscall.UTF16PtrFromString(`SOFTWARE\Microsoft\Windows\CurrentVersion\Run`)
	valueName, _ := syscall.UTF16PtrFromString("ChoreZap")
	valueData := syscall.StringToUTF16(`"` + exe + `"`)
	var hKey syscall.Handle
	r, _, _ := advapi32.NewProc("RegOpenKeyExW").Call(
		uintptr(syscall.HKEY_CURRENT_USER),
		uintptr(unsafe.Pointer(subkey)),
		0,
		0x20006, // KEY_SET_VALUE | KEY_WOW64_64KEY
		uintptr(unsafe.Pointer(&hKey)),
	)
	if r != 0 {
		return
	}
	defer advapi32.NewProc("RegCloseKey").Call(uintptr(hKey))
	advapi32.NewProc("RegSetValueExW").Call(
		uintptr(hKey),
		uintptr(unsafe.Pointer(valueName)),
		0,
		1, // REG_SZ
		uintptr(unsafe.Pointer(&valueData[0])),
		uintptr(uint32(len(valueData)*2)),
	)
}
func openDashboard(url string) error {
	return exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url).Start()
}
func showError(message string) {
	title, _ := syscall.UTF16PtrFromString("ChoreZap")
	body, _ := syscall.UTF16PtrFromString(message)
	observationUser32.NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(body)), uintptr(unsafe.Pointer(title)), 0x10)
}
func notifyLimit() {
	if !notificationActive.CompareAndSwap(false, true) {
		return
	}
	defer notificationActive.Store(false)
	title, _ := syscall.UTF16PtrFromString("ChoreZap · Game time")
	body, _ := syscall.UTF16PtrFromString("Your game allowance is up. Check ChoreZap for the current rule. If your parent selected closing games, save now: the game closes after a 30-second warning.")
	observationUser32.NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(body)), uintptr(unsafe.Pointer(title)), 0x40030)
}
func closeObservedGame(o Observation) error {
	if protected[o.Executable] || o.PID == 0 {
		return fmt.Errorf("protected or unknown application")
	}
	current := foregroundObservation()
	if !current.Available || current.PID != o.PID || current.Executable != o.Executable {
		return fmt.Errorf("foreground application changed")
	}
	p, err := syscall.OpenProcess(0x1000|1|0x100000, false, o.PID)
	if err != nil {
		return err
	}
	defer syscall.CloseHandle(p)
	mine, _ := syscall.GetCurrentProcess()
	sid, err := processSID(mine)
	if err != nil {
		return err
	}
	owner, err := processSID(p)
	if err != nil || owner != sid {
		return fmt.Errorf("application belongs to another account")
	}
	var path [32768]uint16
	size := uint32(len(path))
	ok, _, _ := observationImageName.Call(uintptr(p), 0, uintptr(unsafe.Pointer(&path[0])), uintptr(unsafe.Pointer(&size)))
	if ok == 0 || strings.ToLower(filepath.Base(syscall.UTF16ToString(path[:size]))) != o.Executable {
		return fmt.Errorf("application identity changed")
	}
	if err := syscall.TerminateProcess(p, 0); err != nil {
		return err
	}
	result, err := syscall.WaitForSingleObject(p, 1000)
	if err != nil {
		return err
	}
	if result != 0 {
		return fmt.Errorf("close was requested but not confirmed")
	}
	return nil
}
