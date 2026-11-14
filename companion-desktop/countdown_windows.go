//go:build windows

package main

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"
)

// A separate native window: no injection, game hooks, focus changes or input capture.
// Exclusive-fullscreen games can cover ordinary Windows topmost windows.
var hudGDI = syscall.NewLazyDLL("gdi32.dll")

type hudRect struct{ Left, Top, Right, Bottom int32 }
type hudPoint struct{ X, Y int32 }
type hudMessage struct {
	Window         uintptr
	Message        uint32
	WParam, LParam uintptr
	Time           uint32
	Point          hudPoint
	Private        uint32
}
type hudWindowClass struct {
	Size, Style                        uint32
	Proc                               uintptr
	ClassExtra, WindowExtra            int32
	Instance, Icon, Cursor, Background uintptr
	Menu, Class                        *uint16
	SmallIcon                          uintptr
}
type hudPaint struct {
	DC                 uintptr
	Erase              int32
	Paint              hudRect
	Restore, IncUpdate int32
	Reserved           [32]byte
}

func hudColor(r, g, b uint32) uintptr { return uintptr(r | (g << 8) | (b << 16)) }
func hudUTF(s string) *uint16         { p, _ := syscall.UTF16PtrFromString(s); return p }
func startCountdownHUD(ctx context.Context, e *Engine) {
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		instance, _, _ := observationKernel32.NewProc("GetModuleHandleW").Call(0)
		scale := float64(1)
		if p := observationUser32.NewProc("GetDpiForSystem"); p.Find() == nil {
			dpi, _, _ := p.Call()
			if dpi >= 96 {
				scale = float64(dpi) / 96
			}
		}
		px := func(v int32) int32 { return int32(float64(v) * scale) }
		width, height := px(350), px(205)
		var icon uintptr
		if exe, err := os.Executable(); err == nil {
			icon, _, _ = observationUser32.NewProc("LoadImageW").Call(0, uintptr(unsafe.Pointer(hudUTF(filepath.Join(filepath.Dir(exe), "ChoreZap.ico")))), 1, uintptr(px(24)), uintptr(px(24)), 0x10)
		}
		if icon != 0 {
			defer observationUser32.NewProc("DestroyIcon").Call(icon)
		}
		var hwnd uintptr
		visible := false
		current := Countdown{}
		proc := syscall.NewCallback(func(window uintptr, message uint32, wparam, lparam uintptr) uintptr {
			switch message {
			case 0x21:
				return 3 // WM_MOUSEACTIVATE -> MA_NOACTIVATE
			case 0x84:
				return ^uintptr(0) // WM_NCHITTEST -> HTTRANSPARENT
			case 0x10:
				return 0 // no close button; application lifecycle owns this window
			case 0x113: // WM_TIMER
				select {
				case <-ctx.Done():
					observationUser32.NewProc("DestroyWindow").Call(window)
					return 0
				default:
				}
				next := e.countdownSnapshot()
				// Never display over the lock screen or another user's session.
				if !interactiveDesktop() {
					next.Visible = false
				}
				if next.Visible && !visible {
					var work hudRect
					observationUser32.NewProc("SystemParametersInfoW").Call(0x30, 0, uintptr(unsafe.Pointer(&work)), 0)
					foreground, _, _ := observationForeground.Call()
					monitor, _, _ := observationUser32.NewProc("MonitorFromWindow").Call(foreground, 2)
					info := struct {
						Size          uint32
						Monitor, Work hudRect
						Flags         uint32
					}{}
					info.Size = uint32(unsafe.Sizeof(info))
					if monitor != 0 {
						ok, _, _ := observationUser32.NewProc("GetMonitorInfoW").Call(monitor, uintptr(unsafe.Pointer(&info)))
						if ok != 0 {
							work = info.Work
						}
					}
					x, y := work.Right-width-px(22), work.Top+px(22)
					shown, _, _ := observationUser32.NewProc("SetWindowPos").Call(window, ^uintptr(0), uintptr(x), uintptr(y), uintptr(width), uintptr(height), 0x10|0x40)
					if next.Phase == "demo" && shown != 0 {
						e.mu.Lock()
						e.demoHUDDisplayed = true
						e.mu.Unlock()
					}
				} else if !next.Visible && visible {
					observationUser32.NewProc("ShowWindow").Call(window, 0)
				}
				if next.Visible && visible && next.Phase == "demo" {
					e.mu.Lock()
					e.demoHUDDisplayed = true
					e.mu.Unlock()
				}
				visible = next.Visible
				if next != current {
					current = next
					observationUser32.NewProc("InvalidateRect").Call(window, 0, 0)
				}
				return 0
			case 0x14:
				return 1 // erase in buffered paint
			case 0xF: // WM_PAINT, buffered to avoid flicker
				var paint hudPaint
				dc, _, _ := observationUser32.NewProc("BeginPaint").Call(window, uintptr(unsafe.Pointer(&paint)))
				mem, _, _ := hudGDI.NewProc("CreateCompatibleDC").Call(dc)
				bitmap, _, _ := hudGDI.NewProc("CreateCompatibleBitmap").Call(dc, uintptr(width), uintptr(height))
				old, _, _ := hudGDI.NewProc("SelectObject").Call(mem, bitmap)
				drawCountdownHUD(mem, current, px, width, height, icon)
				hudGDI.NewProc("BitBlt").Call(dc, 0, 0, uintptr(width), uintptr(height), mem, 0, 0, 0x00CC0020)
				hudGDI.NewProc("SelectObject").Call(mem, old)
				hudGDI.NewProc("DeleteObject").Call(bitmap)
				hudGDI.NewProc("DeleteDC").Call(mem)
				observationUser32.NewProc("EndPaint").Call(window, uintptr(unsafe.Pointer(&paint)))
				return 0
			case 0x2:
				observationUser32.NewProc("PostQuitMessage").Call(0)
				return 0
			}
			result, _, _ := observationUser32.NewProc("DefWindowProcW").Call(window, uintptr(message), wparam, lparam)
			return result
		})
		class := hudUTF("ChoreZapCountdownHUD")
		wc := hudWindowClass{Size: uint32(unsafe.Sizeof(hudWindowClass{})), Proc: proc, Instance: instance, Class: class}
		registered, _, _ := observationUser32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&wc)))
		if registered == 0 {
			return
		}
		defer observationUser32.NewProc("UnregisterClassW").Call(uintptr(unsafe.Pointer(class)), instance)
		// TOPMOST | TOOLWINDOW | NOACTIVATE | TRANSPARENT. WS_POPUP, initially hidden.
		hwnd, _, _ = observationUser32.NewProc("CreateWindowExW").Call(0x080800A8, uintptr(unsafe.Pointer(class)), uintptr(unsafe.Pointer(hudUTF("ChoreZap · Time remaining"))), 0x80000000, 0, 0, uintptr(width), uintptr(height), 0, 0, instance, 0)
		if hwnd == 0 {
			return
		}
		observationUser32.NewProc("SetLayeredWindowAttributes").Call(hwnd, 0, 255, 2)
		region, _, _ := hudGDI.NewProc("CreateRoundRectRgn").Call(0, 0, uintptr(width+1), uintptr(height+1), uintptr(px(22)), uintptr(px(22)))
		if region != 0 {
			ok, _, _ := observationUser32.NewProc("SetWindowRgn").Call(hwnd, region, 1)
			if ok == 0 {
				hudGDI.NewProc("DeleteObject").Call(region)
			}
		}
		observationUser32.NewProc("SetTimer").Call(hwnd, 1, 250, 0)
		var msg hudMessage
		for {
			r, _, _ := observationUser32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
			if int32(r) <= 0 {
				break
			}
			observationUser32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&msg)))
			observationUser32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&msg)))
		}
		runtime.KeepAlive(proc)
	}()
}
func drawCountdownHUD(dc uintptr, c Countdown, px func(int32) int32, width, height int32, icon uintptr) {
	bg := hudColor(10, 17, 32)
	teal := hudColor(45, 212, 191)
	yellow := hudColor(250, 201, 34)
	soft := hudColor(168, 179, 197)
	white := hudColor(241, 245, 249)
	accent := teal
	if c.Urgent {
		accent = yellow
	}
	fill := func(x, y, w, h int32, color uintptr) {
		brush, _, _ := hudGDI.NewProc("CreateSolidBrush").Call(color)
		r := hudRect{px(x), px(y), px(x + w), px(y + h)}
		observationUser32.NewProc("FillRect").Call(dc, uintptr(unsafe.Pointer(&r)), brush)
		hudGDI.NewProc("DeleteObject").Call(brush)
	}
	brush, _, _ := hudGDI.NewProc("CreateSolidBrush").Call(bg)
	r := hudRect{0, 0, width, height}
	observationUser32.NewProc("FillRect").Call(dc, uintptr(unsafe.Pointer(&r)), brush)
	hudGDI.NewProc("DeleteObject").Call(brush)
	hudGDI.NewProc("SetBkMode").Call(dc, 1)
	text := func(value string, x, y, w, h, size, weight int32, color uintptr, font string) {
		f, _, _ := hudGDI.NewProc("CreateFontW").Call(uintptr(-px(size)), 0, 0, 0, uintptr(weight), 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(hudUTF(font))))
		previous, _, _ := hudGDI.NewProc("SelectObject").Call(dc, f)
		hudGDI.NewProc("SetTextColor").Call(dc, color)
		bounds := hudRect{px(x), px(y), px(x + w), px(y + h)}
		chars := syscall.StringToUTF16(value)
		observationUser32.NewProc("DrawTextW").Call(dc, uintptr(unsafe.Pointer(&chars[0])), uintptr(len(chars)-1), uintptr(unsafe.Pointer(&bounds)), 0x20|0x8000|0x800)
		hudGDI.NewProc("SelectObject").Call(dc, previous)
		hudGDI.NewProc("DeleteObject").Call(f)
	}
	fill(0, 0, 350, 3, accent)
	brandX := int32(22)
	if icon != 0 {
		observationUser32.NewProc("DrawIconEx").Call(dc, uintptr(px(22)), uintptr(px(14)), icon, uintptr(px(24)), uintptr(px(24)), 0, 0, 3)
		brandX = 56
	}
	text("Chore", brandX, 15, 49, 24, 17, 600, white, "Segoe UI")
	text("Zap", brandX+48, 15, 40, 24, 17, 700, yellow, "Segoe UI")
	text(c.Title, 22, 48, 310, 19, 11, 600, accent, "Segoe UI")
	text(c.Clock, 18, 65, 220, 68, 61, 600, white, "Bahnschrift")
	text(c.Game, 23, 134, 300, 20, 13, 600, soft, "Segoe UI")
	total := c.Total
	if total < 1 {
		total = 300
	}
	active := (c.Seconds*24 + total - 1) / total
	if active > 24 {
		active = 24
	}
	for i := 0; i < 24; i++ {
		color := hudColor(41, 51, 72)
		if i < active {
			color = accent
		}
		fill(23+int32(i)*13, 164, 9, 5, color)
	}
	text(c.Detail, 23, 179, 306, 19, 10, 400, soft, "Segoe UI")
}
