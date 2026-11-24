//go:build windows

package server

import "os"

func openUploadFileNoFollow(dest string) (*os.File, error) {
	return os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
}
