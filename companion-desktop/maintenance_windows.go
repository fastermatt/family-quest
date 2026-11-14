//go:build windows

package main

import (
	"fmt"
	"strings"
	"syscall"
	"unsafe"
)

type processEntry struct {
	Size, Usage, PID             uint32
	DefaultHeapID                uintptr
	ModuleID, Threads, ParentPID uint32
	Priority                     int32
	Flags                        uint32
	Exe                          [260]uint16
}

// runningClassifiedGame returns the exe name and PID of a classified game
// running in the current user's session, or ("", 0) if none is found.
// Used for a single shared game-time track when a classified game remains
// running behind another window, including exclusive full-screen cases.
func runningClassifiedGame(games map[string]bool) (string, uint32) {
	if len(games) == 0 {
		return "", 0
	}
	mine, err := syscall.GetCurrentProcess()
	if err != nil {
		return "", 0
	}
	sid, err := processSID(mine)
	if err != nil {
		return "", 0
	}
	currentPID, _, _ := observationCurrentPID.Call()
	var currentSession uint32
	if ok, _, _ := observationProcessSession.Call(currentPID, uintptr(unsafe.Pointer(&currentSession))); ok == 0 {
		return "", 0
	}
	h, _, _ := observationKernel32.NewProc("CreateToolhelp32Snapshot").Call(2, 0)
	if h == ^uintptr(0) {
		return "", 0
	}
	defer syscall.CloseHandle(syscall.Handle(h))
	entry := processEntry{Size: uint32(unsafe.Sizeof(processEntry{}))}
	first, _, _ := observationKernel32.NewProc("Process32FirstW").Call(h, uintptr(unsafe.Pointer(&entry)))
	if first == 0 {
		return "", 0
	}
	selectedName, selectedPID := "", uint32(0)
	for {
		name := strings.ToLower(syscall.UTF16ToString(entry.Exe[:]))
		if games[name] {
			var session uint32
			inSession, _, _ := observationProcessSession.Call(uintptr(entry.PID), uintptr(unsafe.Pointer(&session)))
			if inSession == 0 || session != currentSession {
				goto nextProcess
			}
			process, openErr := syscall.OpenProcess(0x1000, false, entry.PID)
			if openErr == nil {
				owner, ownerErr := processSID(process)
				syscall.CloseHandle(process)
				if ownerErr == nil && owner == sid {
					if selectedName == "" || name < selectedName || (name == selectedName && entry.PID < selectedPID) {
						selectedName, selectedPID = name, entry.PID
					}
				}
			}
		}
	nextProcess:
		next, _, nextErr := observationKernel32.NewProc("Process32NextW").Call(h, uintptr(unsafe.Pointer(&entry)))
		if next == 0 {
			if nextErr == syscall.Errno(18) {
				return selectedName, selectedPID
			}
			return "", 0
		}
	}
}

// Enumerate all processes, including minimized games. An inaccessible
// classified process is treated as unsafe rather than assumed absent.
func classifiedGamesIdle(games map[string]bool) (bool, error) {
	if len(games) == 0 {
		return true, nil
	}
	mine, err := syscall.GetCurrentProcess()
	if err != nil {
		return false, err
	}
	sid, err := processSID(mine)
	if err != nil {
		return false, err
	}
	h, _, callErr := observationKernel32.NewProc("CreateToolhelp32Snapshot").Call(2, 0)
	if h == ^uintptr(0) {
		return false, callErr
	}
	defer syscall.CloseHandle(syscall.Handle(h))
	entry := processEntry{Size: uint32(unsafe.Sizeof(processEntry{}))}
	first, _, err := observationKernel32.NewProc("Process32FirstW").Call(h, uintptr(unsafe.Pointer(&entry)))
	if first == 0 {
		return false, err
	}
	for {
		name := strings.ToLower(syscall.UTF16ToString(entry.Exe[:]))
		if games[name] {
			process, openErr := syscall.OpenProcess(0x1000, false, entry.PID)
			if openErr != nil {
				return false, fmt.Errorf("classified process unavailable")
			}
			owner, ownerErr := processSID(process)
			syscall.CloseHandle(process)
			if ownerErr != nil {
				return false, fmt.Errorf("classified process owner unavailable")
			}
			if owner == sid {
				return false, nil
			}
		}
		next, _, nextErr := observationKernel32.NewProc("Process32NextW").Call(h, uintptr(unsafe.Pointer(&entry)))
		if next == 0 {
			if nextErr == syscall.Errno(18) {
				return true, nil
			}
			return false, nextErr
		}
	}
}
