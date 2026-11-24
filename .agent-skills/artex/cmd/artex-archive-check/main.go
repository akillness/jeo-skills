// artex-archive-check tests the configured object store without touching tasks.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/Autumn-27/artex/archivestore"
)

func main() {
	if err := check(); err != nil {
		log.Fatal(err)
	}
}

func check() error {
	s, err := archivestore.FromEnv()
	if err != nil {
		return err
	}
	if s == nil {
		return fmt.Errorf("S3 archive storage is not configured")
	}
	dir, err := os.MkdirTemp("", "artex-archive-check-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	data := []byte("ARTEX object storage connectivity check " + time.Now().UTC().Format(time.RFC3339Nano))
	h := sha256.Sum256(data)
	checksum := hex.EncodeToString(h[:])
	uri := s.URI(0, time.Now().UnixNano(), checksum)
	file := filepath.Join(dir, "check")
	if err := os.WriteFile(file, data, 0600); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.Delete(cleanup, uri); err != nil {
			log.Printf("test object cleanup failed for %s: %v", uri, err)
		}
	}()
	if err := s.Upload(ctx, uri, file, checksum); err != nil {
		return err
	}
	if err := s.Download(ctx, uri, filepath.Join(dir, "download"), checksum, int64(len(data))); err != nil {
		return err
	}
	if err := s.Delete(ctx, uri); err != nil {
		return err
	}
	fmt.Println("S3 upload, full SHA-256 verification, download and delete passed")
	return nil
}
