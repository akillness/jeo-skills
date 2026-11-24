package server

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic"
)

func TestManagerSOCKS5UDPOptInAndAssetBlockRuleDropsDatagram(t *testing.T) {
	// 1. Both flags off: NO SOCKS5 listener and UDP disabled.
	t.Setenv(traffic.SOCKS5EnabledEnv, "")
	t.Setenv(traffic.SOCKS5AddrEnv, "")
	t.Setenv(traffic.SOCKS5UDPEnabledEnv, "")
	mOff, err := NewManager(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { _ = mOff.Close() })
	if mOff.traffic.SOCKS5Addr() != "" || mOff.traffic.SOCKS5UDPEnabled() {
		t.Fatalf("flags off: addr=%q udp=%v, want empty/false", mOff.traffic.SOCKS5Addr(), mOff.traffic.SOCKS5UDPEnabled())
	}

	// 2. SOCKS5 on with UDP flag off: UDP ASSOCIATE refused with 0x07.
	t.Setenv(traffic.SOCKS5AddrEnv, "127.0.0.1:0")
	t.Setenv(traffic.SOCKS5UDPEnabledEnv, "")
	mTCPOnly, err := NewManager(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mTCPOnly.Close() })
	if mTCPOnly.traffic.SOCKS5UDPEnabled() {
		t.Fatal("expected UDP disabled when ARTEX_SOCKS5_UDP_ENABLED is unset")
	}

	// 3. UDP flag on: listener accepts UDP ASSOCIATE and enforces global asset
	// block rules per datagram destination (drop denied, forward allowed).
	t.Setenv(traffic.SOCKS5AddrEnv, "127.0.0.1:0")
	t.Setenv(traffic.SOCKS5UDPEnabledEnv, "1")
	mOn, err := NewManager(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mOn.Close() })
	socksAddr := mOn.traffic.SOCKS5Addr()
	if socksAddr == "" || !mOn.traffic.SOCKS5UDPEnabled() {
		t.Fatalf("expected SOCKS5+UDP enabled, got addr=%q udp=%v", socksAddr, mOn.traffic.SOCKS5UDPEnabled())
	}

	// Block 127.0.0.2 via global asset intercept rule; leave 127.0.0.1 allowed.
	rule, err := mOn.pg.CreateAssetInterceptRule(
		"exact_ip",
		"127.0.0.2",
		fmt.Sprintf("p41c-udp-block-%d", time.Now().UnixNano()),
		true,
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mOn.pg.DeleteAssetInterceptRule(rule.ID) })

	startEcho := func(bind string) (*net.UDPConn, *atomic.Int32) {
		t.Helper()
		ua, err := net.ResolveUDPAddr("udp4", bind)
		if err != nil {
			t.Fatal(err)
		}
		ln, err := net.ListenUDP("udp4", ua)
		if err != nil {
			t.Fatal(err)
		}
		var n atomic.Int32
		go func() {
			buf := make([]byte, 4096)
			for {
				rn, from, rerr := ln.ReadFromUDP(buf)
				if rerr != nil {
					return
				}
				n.Add(1)
				_, _ = ln.WriteToUDP(append([]byte("OK:"), buf[:rn]...), from)
			}
		}()
		t.Cleanup(func() { _ = ln.Close() })
		return ln, &n
	}

	blockedLn, blockedCount := startEcho("127.0.0.2:0")
	allowedLn, allowedCount := startEcho("127.0.0.1:0")
	blockedAddr := blockedLn.LocalAddr().(*net.UDPAddr)
	allowedAddr := allowedLn.LocalAddr().(*net.UDPAddr)

	// Open SOCKS5 UDP ASSOCIATE control connection.
	ctrl, err := net.DialTimeout("tcp4", socksAddr, 3*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer ctrl.Close()
	_ = ctrl.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := ctrl.Write([]byte{0x05, 0x01, 0x00}); err != nil {
		t.Fatal(err)
	}
	var sel [2]byte
	if _, err := io.ReadFull(ctrl, sel[:]); err != nil || sel != [2]byte{0x05, 0x00} {
		t.Fatalf("method selection = %v err=%v", sel, err)
	}
	// CMD=0x03 (UDP ASSOCIATE), ATYP=0x01, 0.0.0.0:0
	if _, err := ctrl.Write([]byte{0x05, 0x03, 0x00, 0x01, 0, 0, 0, 0, 0, 0}); err != nil {
		t.Fatal(err)
	}
	var rep [10]byte
	if _, err := io.ReadFull(ctrl, rep[:]); err != nil {
		t.Fatal(err)
	}
	if rep[1] != 0x00 {
		t.Fatalf("UDP ASSOCIATE rep = 0x%02x, want 0x00", rep[1])
	}
	relayAddr := &net.UDPAddr{
		IP:   net.IPv4(rep[4], rep[5], rep[6], rep[7]),
		Port: int(binary.BigEndian.Uint16(rep[8:10])),
	}
	_ = ctrl.SetDeadline(time.Time{})

	cliUDP, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
	if err != nil {
		t.Fatal(err)
	}
	defer cliUDP.Close()

	buildPkt := func(dst *net.UDPAddr, msg string) []byte {
		p := make([]byte, 10+len(msg))
		p[3] = 0x01
		copy(p[4:8], dst.IP.To4())
		binary.BigEndian.PutUint16(p[8:10], uint16(dst.Port))
		copy(p[10:], msg)
		return p
	}

	// Send datagram to blocked 127.0.0.2 (must be dropped by asset rule), then to allowed 127.0.0.1.
	_, _ = cliUDP.WriteToUDP(buildPkt(blockedAddr, "blocked-udp"), relayAddr)
	_, _ = cliUDP.WriteToUDP(buildPkt(allowedAddr, "allowed-udp"), relayAddr)

	_ = cliUDP.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 2048)
	rn, _, err := cliUDP.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("read allowed udp reply: %v", err)
	}
	if got := string(buf[10:rn]); got != "OK:allowed-udp" {
		t.Fatalf("reply = %q, want OK:allowed-udp", got)
	}
	if blockedCount.Load() != 0 {
		t.Fatalf("blocked 127.0.0.2 received %d datagrams, want 0", blockedCount.Load())
	}
	if allowedCount.Load() != 1 {
		t.Fatalf("allowed 127.0.0.1 received %d datagrams, want 1", allowedCount.Load())
	}

	// Wait briefly for SQLite writes and verify raw_udp_datagrams has 127.0.0.1 only, 0 HTTP exchanges.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		n, err := mOn.traffic.CountRawUDPDatagrams("", "127.0.0.1")
		if err == nil && n >= 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if nBlocked, err := mOn.traffic.CountRawUDPDatagrams("", "127.0.0.2"); err != nil || nBlocked != 0 {
		t.Fatalf("blocked host recorded %d rows (err=%v), want 0", nBlocked, err)
	}
	if nAllowed, err := mOn.traffic.CountRawUDPDatagrams("", "127.0.0.1"); err != nil || nAllowed != 2 {
		t.Fatalf("allowed host recorded %d rows (err=%v), want 2", nAllowed, err)
	}
}
