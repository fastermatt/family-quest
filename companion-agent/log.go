package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const maxLogBytes = 1 << 20

// logf prints and also appends to agent.log (rotated at 1 MB), so a PC running
// with no window still leaves a trail. Never logs tokens or the sites seen.
func logf(format string, a ...any) {
	line := fmt.Sprintf(format, a...)
	fmt.Println(line)
	path := filepath.Join(configDir(), "agent.log")
	if st, err := os.Stat(path); err == nil && st.Size() > maxLogBytes {
		_ = os.Rename(path, path+".old")
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s %s\n", time.Now().Format("2006-01-02 15:04:05"), line)
}
