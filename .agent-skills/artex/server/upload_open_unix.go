//go:build !windows

package server

import (
	"os"
	"syscall"
)

// openUploadFileNoFollow opens dest for writing without following a symlink at
// the final path component, closing the TOCTOU window after refuseUploadSymlink.
func openUploadFileNoFollow(dest string) (*os.File, error) {
	return os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC|syscall.O_NOFOLLOW, 0o644)
}
