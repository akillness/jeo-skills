//go:build linux

package traffic

import (
	"fmt"
	"net"
	"syscall"
	"unsafe"
)

const (
	transparentTCPSupported = true
	// soOriginalDst is Linux SO_ORIGINAL_DST from <linux/netfilter_ipv4.h>.
	soOriginalDst = 80
)

// originalDstIPv4 recovers the pre-REDIRECT IPv4 destination of an accepted
// Linux TCP connection using getsockopt(SOL_IP, SO_ORIGINAL_DST).
func originalDstIPv4(conn net.Conn) (net.IP, int, error) {
	if ta, ok := conn.LocalAddr().(*net.TCPAddr); ok && ta.IP != nil && ta.IP.To4() == nil {
		return nil, 0, ErrTransparentTCPIPv6Unsupported
	}
	sc, ok := conn.(syscall.Conn)
	if !ok {
		return nil, 0, fmt.Errorf("connection %T does not expose syscall.Conn", conn)
	}
	rc, err := sc.SyscallConn()
	if err != nil {
		return nil, 0, fmt.Errorf("syscall conn: %w", err)
	}
	var raw [sockaddrInSize]byte
	optlen := uint32(len(raw))
	var sockErr error
	if err := rc.Control(func(fd uintptr) {
		_, _, errno := syscall.Syscall6(
			syscall.SYS_GETSOCKOPT,
			fd,
			uintptr(syscall.SOL_IP),
			uintptr(soOriginalDst),
			uintptr(unsafe.Pointer(&raw[0])),
			uintptr(unsafe.Pointer(&optlen)),
			0,
		)
		if errno != 0 {
			sockErr = errno
		}
	}); err != nil {
		return nil, 0, fmt.Errorf("control fd: %w", err)
	}
	if sockErr != nil {
		return nil, 0, fmt.Errorf("getsockopt(SO_ORIGINAL_DST): %w", sockErr)
	}
	if int(optlen) > len(raw) {
		optlen = uint32(len(raw))
	}
	return parseOriginalDstIPv4(raw[:optlen])
}
