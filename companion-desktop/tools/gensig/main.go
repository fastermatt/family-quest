// gensig signs a ChoreZap companion release binary and writes the manifest.
//
// Usage (run from companion-desktop/):
//
//	go run ./tools/gensig \
//	  -key /path/to/update-signing.pem \
//	  -version 0.3.11 \
//	  -seq 20
//
// The signed manifest is written to:
//
//	../public/api/companion/v2/updates/manifest.json
//
// And the binary is copied to:
//
//	../public/api/companion/v2/updates/<sha256>.exe
//
// Run from companion-desktop/, the directory that contains go.mod.
package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "gensig:", err)
		os.Exit(1)
	}
}

func run() error {
	keyPath := flag.String("key", "", "path to Ed25519 private key PEM file (required)")
	exePath := flag.String("exe", "desktop.exe", "path to the Windows .exe to publish (default: desktop.exe in current dir)")
	version := flag.String("version", "", "version string, e.g. 0.3.11 (required)")
	seq := flag.Int("seq", 0, "release sequence number, must be greater than current manifest (required)")
	flag.Parse()

	if *keyPath == "" || *version == "" || *seq <= 0 {
		flag.Usage()
		return fmt.Errorf("key, version, and seq are required")
	}

	// Load Ed25519 private key from PEM.
	privKey, err := loadPrivateKey(*keyPath)
	if err != nil {
		return fmt.Errorf("load key: %w", err)
	}

	// Hash the exe.
	f, err := os.Open(*exePath)
	if err != nil {
		return fmt.Errorf("open exe: %w", err)
	}
	defer f.Close()
	h := sha256.New()
	size, err := io.Copy(h, f)
	if err != nil {
		return fmt.Errorf("hash exe: %w", err)
	}
	shaHex := hex.EncodeToString(h.Sum(nil))
	f.Close()

	// Build payload. Field order matches the companion's release struct
	// (matches the original manifest format for reproducibility).
	type releasePayload struct {
		Sequence int    `json:"sequence"`
		Version  string `json:"version"`
		SHA256   string `json:"sha256"`
		Size     int64  `json:"size"`
		Protocol int    `json:"protocol"`
	}
	payload, err := json.Marshal(releasePayload{
		Sequence: *seq,
		Version:  *version,
		SHA256:   shaHex,
		Size:     size,
		Protocol: 1,
	})
	if err != nil {
		return err
	}

	// Sign.
	sig := ed25519.Sign(privKey, payload)

	manifest, err := json.MarshalIndent(map[string]string{
		"payload":   base64.StdEncoding.EncodeToString(payload),
		"signature": base64.StdEncoding.EncodeToString(sig),
	}, "", "  ")
	if err != nil {
		return err
	}

	// Copy exe to updates directory (relative to companion-desktop/, which is the module root).
	updatesDir := filepath.Join("..", "public", "api", "companion", "v2", "updates")
	if err = os.MkdirAll(updatesDir, 0755); err != nil {
		return fmt.Errorf("create updates dir: %w", err)
	}
	destExe := filepath.Join(updatesDir, shaHex+".exe")
	if _, err = os.Stat(destExe); os.IsNotExist(err) {
		if err = copyFile(*exePath, destExe); err != nil {
			return fmt.Errorf("copy exe: %w", err)
		}
		fmt.Println("copied:", destExe)
	} else {
		fmt.Println("binary already exists:", destExe)
	}

	// Write manifest.
	manifestPath := filepath.Join(updatesDir, "manifest.json")
	if err = os.WriteFile(manifestPath, manifest, 0644); err != nil {
		return fmt.Errorf("write manifest: %w", err)
	}
	fmt.Println("manifest written:", manifestPath)
	fmt.Printf("  version:  %s\n", *version)
	fmt.Printf("  sequence: %d\n", *seq)
	fmt.Printf("  sha256:   %s\n", shaHex)
	fmt.Printf("  size:     %d bytes\n", size)
	fmt.Println()
	fmt.Println("Next: vercel --prod --yes  (from app-family-controls/)")
	return nil
}

func loadPrivateKey(path string) (ed25519.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("no PEM block found in %s", path)
	}
	// PEM block is "PRIVATE KEY" (PKCS#8) or raw 64-byte seed.
	// The companion's key was generated as a raw 32-byte seed wrapped in PEM.
	switch block.Type {
	case "PRIVATE KEY":
		// PKCS#8: last 32 bytes are the seed.
		if len(block.Bytes) < 32 {
			return nil, fmt.Errorf("PRIVATE KEY block too short (%d bytes)", len(block.Bytes))
		}
		seed := block.Bytes[len(block.Bytes)-32:]
		return ed25519.NewKeyFromSeed(seed), nil
	case "ED25519 PRIVATE KEY":
		if len(block.Bytes) != 32 {
			return nil, fmt.Errorf("ED25519 PRIVATE KEY block must be 32 bytes, got %d", len(block.Bytes))
		}
		return ed25519.NewKeyFromSeed(block.Bytes), nil
	default:
		return nil, fmt.Errorf("unexpected PEM type %q; expected PRIVATE KEY or ED25519 PRIVATE KEY", block.Type)
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
