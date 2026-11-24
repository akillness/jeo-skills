//go:build !unix

package agent

import "io/fs"

// extraHardLinks: the link count is not available here; the executor identity that
// could plant a link only exists on unix (server/execpriv_unix.go).
func extraHardLinks(fs.FileInfo) bool { return false }
