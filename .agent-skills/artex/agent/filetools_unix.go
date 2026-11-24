//go:build unix

package agent

import (
	"io/fs"
	"syscall"
)

// extraHardLinks reports a file that has a name besides the one being opened.
func extraHardLinks(fi fs.FileInfo) bool {
	st, ok := fi.Sys().(*syscall.Stat_t)
	return ok && st.Nlink > 1
}
