//go:build !unix

package server

// syncDir does nothing here: Windows does not support fsync on a directory
// handle (FlushFileBuffers fails on it), and the contents of the file written in
// the directory are already synced by the caller.
func syncDir(path string) error { return nil }
