//go:build windows

package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

func installedExePath() (string, error) {
	local := os.Getenv("LOCALAPPDATA")
	if local == "" {
		return "", fmt.Errorf("LOCALAPPDATA not set")
	}
	return filepath.Join(local, "Programs", "ChoreZap", "ChoreZap.exe"), nil
}

// maybeInstall installs ChoreZap from whatever folder it was run from into the
// per-user Programs folder, then relaunches. Returns (true, nil) when it
// launches a new instance and the caller should exit. If already running from
// the installed location it checks for missing files and returns (false, nil).
func maybeInstall(currentExe string) (bool, error) {
	target, err := installedExePath()
	if err != nil {
		return false, nil // Cannot determine path; fall through to normal run.
	}

	alreadyInstalled := strings.EqualFold(filepath.Clean(currentExe), filepath.Clean(target))
	if alreadyInstalled {
		// Repair: server.json must exist beside the exe.
		cfgPath := filepath.Join(filepath.Dir(target), "server.json")
		if _, err = os.Stat(cfgPath); err != nil {
			return false, fmt.Errorf("server.json is missing from the ChoreZap folder.\nPut server.json beside ChoreZap.exe and run again.")
		}
		return false, nil
	}

	// --- Fresh install or relocation ---
	installDir := filepath.Dir(target)
	local := os.Getenv("LOCALAPPDATA")
	pidFile := filepath.Join(local, "ChoreZapDesktop", "supervisor.pid")

	// Replace only the verified same-account installed supervisor.
	replaceRunningInstance(pidFile)
	time.Sleep(3 * time.Second)

	if err = os.MkdirAll(installDir, 0755); err != nil {
		return false, fmt.Errorf("cannot create installation folder: %w", err)
	}

	// Copy the exe; retry once in case the file was briefly locked.
	if err = copyFile(currentExe, target); err != nil {
		time.Sleep(2 * time.Second)
		err = copyFile(currentExe, target)
	}
	if err != nil {
		return false, fmt.Errorf("cannot install ChoreZap.exe: %w", err)
	}

	// Copy server.json from wherever the exe was run from.
	srcCfg := filepath.Join(filepath.Dir(currentExe), "server.json")
	dstCfg := filepath.Join(installDir, "server.json")
	if _, statErr := os.Stat(srcCfg); statErr == nil {
		if copyErr := copyFile(srcCfg, dstCfg); copyErr != nil {
			return false, fmt.Errorf("cannot install server.json: %w", copyErr)
		}
	}

	registerAutostartAt(target)
	registerUninstaller(target)

	// Relaunch from the installed path; this instance is done.
	cmd := exec.Command(target)
	if err = cmd.Start(); err != nil {
		return false, fmt.Errorf("installed but could not start: %w", err)
	}
	return true, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func registerUninstaller(exePath string) {
	installDir := filepath.Dir(exePath)
	uninstallCmd := `"` + exePath + `" --uninstall`

	subkey, _ := syscall.UTF16PtrFromString(`SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ChoreZap`)
	var hKey syscall.Handle
	var disp uint32
	r, _, _ := advapi32.NewProc("RegCreateKeyExW").Call(
		uintptr(syscall.HKEY_CURRENT_USER),
		uintptr(unsafe.Pointer(subkey)),
		0, 0, 0,
		0x20006, // KEY_SET_VALUE | KEY_WOW64_64KEY
		0,
		uintptr(unsafe.Pointer(&hKey)),
		uintptr(unsafe.Pointer(&disp)),
	)
	if r != 0 {
		return
	}
	defer advapi32.NewProc("RegCloseKey").Call(uintptr(hKey))

	str := func(name, val string) {
		n, _ := syscall.UTF16PtrFromString(name)
		v := syscall.StringToUTF16(val)
		advapi32.NewProc("RegSetValueExW").Call(
			uintptr(hKey), uintptr(unsafe.Pointer(n)), 0, 1,
			uintptr(unsafe.Pointer(&v[0])), uintptr(uint32(len(v)*2)),
		)
	}
	dword := func(name string, val uint32) {
		n, _ := syscall.UTF16PtrFromString(name)
		advapi32.NewProc("RegSetValueExW").Call(
			uintptr(hKey), uintptr(unsafe.Pointer(n)), 0, 4,
			uintptr(unsafe.Pointer(&val)), 4,
		)
	}

	str("DisplayName", "ChoreZap")
	str("DisplayIcon", exePath+",0")
	str("InstallLocation", installDir)
	str("Publisher", "ChoreZap")
	str("UninstallString", uninstallCmd)
	str("QuietUninstallString", uninstallCmd)
	dword("NoModify", 1)
	dword("NoRepair", 1)
	dword("EstimatedSize", 13000) // KB
}

func runUninstall() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	installed, err := installedExePath()
	if err != nil {
		return err
	}
	installDir, err := canonicalUninstallDir(exe, installed)
	if err != nil {
		return err
	}
	local := os.Getenv("LOCALAPPDATA")
	if local == "" {
		return fmt.Errorf("LOCALAPPDATA not set")
	}

	// Kill running tracker.
	pidFile := filepath.Join(local, "ChoreZapDesktop", "supervisor.pid")
	replaceRunningInstance(pidFile)
	time.Sleep(time.Second)

	// Remove scheduled task.
	exec.Command("schtasks", "/Delete", "/TN", "ChoreZap", "/F").Run() //nolint

	// Remove registry Run key.
	runKey, _ := syscall.UTF16PtrFromString(`SOFTWARE\Microsoft\Windows\CurrentVersion\Run`)
	var hRun syscall.Handle
	if r, _, _ := advapi32.NewProc("RegOpenKeyExW").Call(
		uintptr(syscall.HKEY_CURRENT_USER),
		uintptr(unsafe.Pointer(runKey)), 0, 0x20006,
		uintptr(unsafe.Pointer(&hRun)),
	); r == 0 {
		defer advapi32.NewProc("RegCloseKey").Call(uintptr(hRun))
		vn, _ := syscall.UTF16PtrFromString("ChoreZap")
		advapi32.NewProc("RegDeleteValueW").Call(uintptr(hRun), uintptr(unsafe.Pointer(vn)))
	}

	// Remove from Add/Remove Programs.
	unKey, _ := syscall.UTF16PtrFromString(`SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ChoreZap`)
	advapi32.NewProc("RegDeleteKeyW").Call(
		uintptr(syscall.HKEY_CURRENT_USER), uintptr(unsafe.Pointer(unKey)),
	)

	// Remove only ChoreZap-owned files. The app's cache/ledger remains for
	// recovery, and unrelated files in the install folder are untouched.
	for _, path := range ownedInstallFiles(installed)[:2] {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("could not remove ChoreZap file: %w", err)
		}
	}
	if err := os.Remove(installed); err != nil && !os.IsNotExist(err) {
		// Windows can lock the currently executing EXE. Queue only this exact
		// file for deletion on reboot; never invoke cmd/rmdir on a directory.
		name, _ := syscall.UTF16PtrFromString(installed)
		ok, _, callErr := observationKernel32.NewProc("MoveFileExW").Call(uintptr(unsafe.Pointer(name)), 0, 4)
		if ok == 0 {
			return fmt.Errorf("startup disabled, but installed EXE could not be removed; close ChoreZap and remove it manually: %v", callErr)
		}
	}
	_ = os.Remove(installDir) // Succeeds only when empty.
	showError("ChoreZap startup was disabled and its app files were removed or queued for deletion at restart. Saved usage was kept.")

	return nil
}
