//go:build windows

package main

import (
	"fmt"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var observationUser32 = syscall.NewLazyDLL("user32.dll")
var observationKernel32 = syscall.NewLazyDLL("kernel32.dll")
var observationForeground = observationUser32.NewProc("GetForegroundWindow")
var observationWindowPID = observationUser32.NewProc("GetWindowThreadProcessId")
var observationLastInput = observationUser32.NewProc("GetLastInputInfo")
var observationOpenDesktop = observationUser32.NewProc("OpenInputDesktop")
var observationCloseDesktop = observationUser32.NewProc("CloseDesktop")
var observationDesktopName = observationUser32.NewProc("GetUserObjectInformationW")
var observationImageName = observationKernel32.NewProc("QueryFullProcessImageNameW")
var observationTicks = observationKernel32.NewProc("GetTickCount64")
var observationConsole = observationKernel32.NewProc("WTSGetActiveConsoleSessionId")
var observationProcessSession = observationKernel32.NewProc("ProcessIdToSessionId")
var observationCurrentPID = observationKernel32.NewProc("GetCurrentProcessId")

func processSID(process syscall.Handle) (string, error) {
	var token syscall.Token
	if err := syscall.OpenProcessToken(process, syscall.TOKEN_QUERY, &token); err != nil {
		return "", err
	}
	defer token.Close()
	user, err := token.GetTokenUser()
	if err != nil {
		return "", err
	}
	return user.User.Sid.String()
}

func checkObservationPlatform() error {
	process, err := syscall.GetCurrentProcess()
	if err != nil {
		return err
	}
	var token syscall.Token
	if err := syscall.OpenProcessToken(process, syscall.TOKEN_QUERY, &token); err != nil {
		return err
	}
	defer token.Close()
	// The pilot must not accidentally gather the parent's elevated session.
	var elevated uint32
	var size uint32
	if err := syscall.GetTokenInformation(token, syscall.TokenElevation, (*byte)(unsafe.Pointer(&elevated)), 4, &size); err != nil {
		return err
	}
	if elevated != 0 {
		return fmt.Errorf("run ChoreZap without administrator elevation in the child's account")
	}
	return nil
}

func interactiveDesktop() bool {
	pid, _, _ := observationCurrentPID.Call()
	var session uint32
	ok, _, _ := observationProcessSession.Call(pid, uintptr(unsafe.Pointer(&session)))
	active, _, _ := observationConsole.Call()
	if ok == 0 || uint32(active) == 0xffffffff || session != uint32(active) {
		return false
	}
	desktop, _, _ := observationOpenDesktop.Call(0, 0, 1) // DESKTOP_READOBJECTS
	if desktop == 0 {
		return false
	}
	defer observationCloseDesktop.Call(desktop)
	var name [64]uint16
	var needed uint32
	ok, _, _ = observationDesktopName.Call(desktop, 2, uintptr(unsafe.Pointer(&name[0])), uintptr(len(name)*2), uintptr(unsafe.Pointer(&needed)))
	return ok != 0 && strings.EqualFold(syscall.UTF16ToString(name[:]), "Default")
}

func foregroundObservation() Observation {
	if !interactiveDesktop() {
		return Observation{}
	}
	window, _, _ := observationForeground.Call()
	if window == 0 {
		return Observation{}
	}
	var pid uint32
	observationWindowPID.Call(window, uintptr(unsafe.Pointer(&pid)))
	process, err := syscall.OpenProcess(0x1000, false, pid) // QUERY_LIMITED_INFORMATION
	if err != nil {
		return Observation{}
	}
	defer syscall.CloseHandle(process)
	current, err := syscall.GetCurrentProcess()
	if err != nil {
		return Observation{}
	}
	mine, err := processSID(current)
	if err != nil {
		return Observation{}
	}
	owner, err := processSID(process)
	if err != nil || mine != owner {
		return Observation{}
	}
	var path [32768]uint16
	size := uint32(len(path))
	ok, _, _ := observationImageName.Call(uintptr(process), 0, uintptr(unsafe.Pointer(&path[0])), uintptr(unsafe.Pointer(&size)))
	if ok == 0 {
		return Observation{}
	}
	executable := strings.ToLower(filepath.Base(syscall.UTF16ToString(path[:size])))
	idle := int64(-1)
	input := struct {
		Size uint32
		Tick uint32
	}{Size: 8}
	ok, _, _ = observationLastInput.Call(uintptr(unsafe.Pointer(&input)))
	if ok != 0 {
		ticks, _, _ := observationTicks.Call()
		idle = int64(uint32(ticks)-input.Tick) / 1000
	}
	return Observation{Executable: executable, IdleSeconds: idle, Available: true, PID: pid, Path: syscall.UTF16ToString(path[:size])}
}
