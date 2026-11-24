//go:build unix

package server

import (
	"errors"
	"os"
)

// syncDir flushes a directory, so that an entry just created or renamed in it
// survives a crash.
func syncDir(path string) error {
	d, err := os.Open(path)
	if err != nil {
		return err
	}
	return errors.Join(d.Sync(), d.Close())
}
