//go:build linux

package server

import (
	"fmt"
	"os"
	"strconv"
	"syscall"
)

// reexecSealed replaces the server image with the same binary and the given
// environment block. The payload goes through a pipe whose read end stays open across
// the exec; its number is passed in sealFDEnv. Only returns on failure.
func reexecSealed(env []string, payload []byte) error {
	var fds [2]int
	// No close-on-exec: the read end must survive the exec. The write end is closed
	// below before the exec, so the new image sees end-of-file after the payload.
	if err := syscall.Pipe2(fds[:], 0); err != nil {
		return fmt.Errorf("pipe: %w", err)
	}
	rfd, wfd := fds[0], fds[1]
	if err := writeFully(wfd, payload); err != nil {
		syscall.Close(rfd)
		syscall.Close(wfd)
		return fmt.Errorf("handoff write: %w", err)
	}
	syscall.Close(wfd)

	exe, err := os.Executable()
	if err != nil {
		syscall.Close(rfd)
		return fmt.Errorf("locate the server binary: %w", err)
	}
	env = append(env, sealFDEnv+"="+strconv.Itoa(rfd))
	err = syscall.Exec(exe, os.Args, env)
	syscall.Close(rfd)
	return fmt.Errorf("exec: %w", err)
}

func writeFully(fd int, b []byte) error {
	for len(b) > 0 {
		n, err := syscall.Write(fd, b)
		if err != nil {
			return err
		}
		b = b[n:]
	}
	return nil
}
