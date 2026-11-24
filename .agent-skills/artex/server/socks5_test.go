package server

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic"
)

func TestManagerSOCKS5OptInFlagAndAssetBlockRuleRefusal(t *testing.T) {
	// 1. Flag off (default): Manager starts NO SOCKS5 listener.
	t.Setenv(traffic.SOCKS5EnabledEnv, "")
	t.Setenv(traffic.SOCKS5AddrEnv, "")
	mOff, err := NewManager(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { _ = mOff.Close() })
	if mOff.traffic == nil {
		t.Fatal("expected HTTP recording proxy to start")
	}
	if got := mOff.traffic.SOCKS5Addr(); got != "" {
		t.Fatalf("SOCKS5Addr with flag off = %q, want empty", got)
	}

	// 2. Flag on (ARTEX_SOCKS5_ADDR=127.0.0.1:0): listener starts and enforces
	// global asset block rules via m.interceptor.DialSOCKS5 BEFORE dialing.
	t.Setenv(traffic.SOCKS5AddrEnv, "127.0.0.1:0")
	mOn, err := NewManager(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mOn.Close() })
	socksAddr := mOn.traffic.SOCKS5Addr()
	if socksAddr == "" {
		t.Fatal("expected SOCKS5 listener when ARTEX_SOCKS5_ADDR is set")
	}

	// Add a global asset block rule for 127.0.0.1 and ensure cleanup.
	rule, err := mOn.pg.CreateAssetInterceptRule(
		"exact_ip",
		"127.0.0.1",
		fmt.Sprintf("p41a-block-test-%d", time.Now().UnixNano()),
		true,
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mOn.pg.DeleteAssetInterceptRule(rule.ID) })

	// Target TCP server on 127.0.0.1: must NEVER receive a connection.
	targetLn, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer targetLn.Close()
	var accepted atomic.Int32
	go func() {
		for {
			c, err := targetLn.Accept()
			if err != nil {
				return
			}
			accepted.Add(1)
			_ = c.Close()
		}
	}()
	_, portStr, _ := net.SplitHostPort(targetLn.Addr().String())
	port, _ := strconv.Atoi(portStr)

	c, err := net.DialTimeout("tcp", socksAddr, 3*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	_ = c.SetDeadline(time.Now().Add(5 * time.Second))
	// Greeting: VER=5, NMETHODS=1, NO AUTH
	if _, err := c.Write([]byte{0x05, 0x01, 0x00}); err != nil {
		t.Fatal(err)
	}
	var sel [2]byte
	if _, err := io.ReadFull(c, sel[:]); err != nil || sel != [2]byte{0x05, 0x00} {
		t.Fatalf("method selection = %v err=%v", sel, err)
	}
	// CONNECT 127.0.0.1:<port>
	req := []byte{0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, 0, 0}
	binary.BigEndian.PutUint16(req[8:10], uint16(port))
	if _, err := c.Write(req); err != nil {
		t.Fatal(err)
	}
	var rep [10]byte
	if _, err := io.ReadFull(c, rep[:]); err != nil {
		t.Fatal(err)
	}
	if rep[1] != 0x02 {
		t.Fatalf("blocked target SOCKS5 reply = 0x%02x, want 0x02 (not allowed by ruleset)", rep[1])
	}
	if accepted.Load() != 0 {
		t.Fatalf("blocked target accepted %d connections, want 0", accepted.Load())
	}
}
