//go:build windows

package main

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

type trayData struct {
	Size                uint32
	Window              uintptr
	ID, Flags, Callback uint32
	Icon                uintptr
	Tip                 [128]uint16
	State, StateMask    uint32
	Info                [256]uint16
	Timeout             uint32
	InfoTitle           [64]uint16
	InfoFlags           uint32
	GUID                [16]byte
	BalloonIcon         uintptr
}

type trayNotice struct{ title, body string }

var trayNotices = make(chan trayNotice, 32)

func showDesktopNotice(title, body string) {
	select {
	case trayNotices <- trayNotice{title, body}:
	default:
		// Tracking must never wait for Explorer to show a notification.
	}
}

func copyNoticeText(dst []uint16, value string) {
	text := utf16.Encode([]rune(strings.ReplaceAll(value, "\x00", "")))
	if len(text) >= len(dst) {
		text = text[:len(dst)-1]
		if last := text[len(text)-1]; last >= 0xd800 && last <= 0xdbff {
			text = text[:len(text)-1]
		}
	}
	copy(dst, text)
}

// Visible notification-area presence, never hidden from Windows task management.
func startTray(ctx context.Context, address string) error {
	ready := make(chan error, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		shell := syscall.NewLazyDLL("shell32.dll")
		notify := shell.NewProc("Shell_NotifyIconW")
		instance, _, _ := observationKernel32.NewProc("GetModuleHandleW").Call(0)
		exe, err := os.Executable()
		if err != nil {
			ready <- err
			return
		}
		var icon uintptr
		shell.NewProc("ExtractIconExW").Call(uintptr(unsafe.Pointer(hudUTF(exe))), 0, 0, uintptr(unsafe.Pointer(&icon)), 1)
		if icon == 0 {
			icon, _, _ = observationUser32.NewProc("LoadIconW").Call(0, 32512)
		} else {
			defer observationUser32.NewProc("DestroyIcon").Call(icon)
		}
		taskbar, _, _ := observationUser32.NewProc("RegisterWindowMessageW").Call(uintptr(unsafe.Pointer(hudUTF("TaskbarCreated"))))
		data := trayData{ID: 1, Flags: 7, Callback: 0x8001, Icon: icon}
		data.Size = uint32(unsafe.Sizeof(data))
		copy(data.Tip[:], syscall.StringToUTF16("ChoreZap · Tracking is running · Click to open"))
		proc := syscall.NewCallback(func(window uintptr, msg uint32, wp, lp uintptr) uintptr {
			if uintptr(msg) == taskbar {
				notify.Call(0, uintptr(unsafe.Pointer(&data)))
				return 0
			}
			switch msg {
			case 0x8001:
				if lp == 0x202 || lp == 0x205 || lp == 0x203 {
					go openDashboard(address)
				}
				return 0
			case 0x113:
				select {
				case <-ctx.Done():
					notify.Call(2, uintptr(unsafe.Pointer(&data)))
					observationUser32.NewProc("DestroyWindow").Call(window)
				case notice := <-trayNotices:
					// Modify only the notification fields on the existing tray icon.
					balloon := trayData{Size: data.Size, Window: window, ID: data.ID, Flags: 0x10, InfoFlags: 0x81}
					copyNoticeText(balloon.InfoTitle[:], notice.title)
					copyNoticeText(balloon.Info[:], notice.body)
					notify.Call(1, uintptr(unsafe.Pointer(&balloon)))
				default:
				}
				return 0
			case 0x2:
				observationUser32.NewProc("PostQuitMessage").Call(0)
				return 0
			}
			result, _, _ := observationUser32.NewProc("DefWindowProcW").Call(window, uintptr(msg), wp, lp)
			return result
		})
		class := hudWindowClass{Proc: proc, Instance: instance, Class: hudUTF("ChoreZapTray")}
		class.Size = uint32(unsafe.Sizeof(class))
		atom, _, e := observationUser32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&class)))
		if atom == 0 {
			ready <- fmt.Errorf("tray registration failed: %v", e)
			return
		}
		defer observationUser32.NewProc("UnregisterClassW").Call(uintptr(unsafe.Pointer(class.Class)), instance)
		hwnd, _, e := observationUser32.NewProc("CreateWindowExW").Call(0, uintptr(unsafe.Pointer(class.Class)), uintptr(unsafe.Pointer(hudUTF("ChoreZap"))), 0, 0, 0, 0, 0, 0, 0, instance, 0)
		if hwnd == 0 {
			ready <- fmt.Errorf("tray window failed: %v", e)
			return
		}
		data.Window = hwnd
		ok, _, e := notify.Call(0, uintptr(unsafe.Pointer(&data)))
		if ok == 0 {
			observationUser32.NewProc("DestroyWindow").Call(hwnd)
			ready <- fmt.Errorf("tray icon failed: %v", e)
			return
		}
		observationUser32.NewProc("SetTimer").Call(hwnd, 1, 500, 0)
		ready <- nil
		var message hudMessage
		for {
			r, _, _ := observationUser32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
			if int32(r) <= 0 {
				break
			}
			observationUser32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&message)))
			observationUser32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&message)))
		}
	}()
	return <-ready
}
