//go:build !linux

package traffic

import "net"

const transparentTCPSupported = false

func originalDstIPv4(_ net.Conn) (net.IP, int, error) {
	return nil, 0, ErrTransparentTCPNotLinux
}
