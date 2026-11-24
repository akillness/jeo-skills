package traffic

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/intercept"
)

func startEchoServer(t *testing.T, network, addr string) (net.Listener, *atomic.Int32) {
	t.Helper()
	ln, err := net.Listen(network, addr)
	if err != nil {
		t.Fatalf("listen %s %s: %v", network, addr, err)
	}
	var accepted atomic.Int32
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			accepted.Add(1)
			wg.Add(1)
			go func(conn net.Conn) {
				defer wg.Done()
				defer conn.Close()
				_, _ = io.Copy(conn, conn)
			}(c)
		}
	}()
	t.Cleanup(func() {
		_ = ln.Close()
		wg.Wait()
	})
	return ln, &accepted
}

func socks5BuildRequest(cmd byte, host string, port int) []byte {
	req := []byte{socks5Version, cmd, 0x00}
	if ip := net.ParseIP(host); ip != nil {
		if ip4 := ip.To4(); ip4 != nil {
			req = append(req, socks5AtypIPv4)
			req = append(req, ip4...)
		} else {
			req = append(req, socks5AtypIPv6)
			req = append(req, ip.To16()...)
		}
	} else {
		req = append(req, socks5AtypDomain, byte(len(host)))
		req = append(req, []byte(host)...)
	}
	var p [2]byte
	binary.BigEndian.PutUint16(p[:], uint16(port))
	return append(req, p[:]...)
}

func socks5ReadReply(t *testing.T, conn net.Conn) byte {
	t.Helper()
	var hdr [4]byte
	if _, err := io.ReadFull(conn, hdr[:]); err != nil {
		t.Fatalf("read socks5 reply header: %v", err)
	}
	if hdr[0] != socks5Version {
		t.Fatalf("reply version = 0x%02x, want 0x05", hdr[0])
	}
	switch hdr[3] {
	case socks5AtypIPv4:
		var buf [6]byte
		if _, err := io.ReadFull(conn, buf[:]); err != nil {
			t.Fatalf("read ipv4 reply tail: %v", err)
		}
	case socks5AtypIPv6:
		var buf [18]byte
		if _, err := io.ReadFull(conn, buf[:]); err != nil {
			t.Fatalf("read ipv6 reply tail: %v", err)
		}
	case socks5AtypDomain:
		var l [1]byte
		if _, err := io.ReadFull(conn, l[:]); err != nil {
			t.Fatalf("read domain len: %v", err)
		}
		buf := make([]byte, int(l[0])+2)
		if _, err := io.ReadFull(conn, buf); err != nil {
			t.Fatalf("read domain tail: %v", err)
		}
	default:
		t.Fatalf("unexpected reply atyp 0x%02x", hdr[3])
	}
	return hdr[1]
}

func socks5DialNoAuth(t *testing.T, proxyAddr, host string, port int) (net.Conn, byte) {
	t.Helper()
	c, err := net.DialTimeout("tcp", proxyAddr, 3*time.Second)
	if err != nil {
		t.Fatalf("dial proxy %s: %v", proxyAddr, err)
	}
	_ = c.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := c.Write([]byte{socks5Version, 1, socks5AuthNone}); err != nil {
		_ = c.Close()
		t.Fatalf("write greeting: %v", err)
	}
	var sel [2]byte
	if _, err := io.ReadFull(c, sel[:]); err != nil {
		_ = c.Close()
		t.Fatalf("read method selection: %v", err)
	}
	if sel[0] != socks5Version || sel[1] != socks5AuthNone {
		_ = c.Close()
		t.Fatalf("method selection = %v, want [5 0]", sel)
	}
	if _, err := c.Write(socks5BuildRequest(socks5CmdConnect, host, port)); err != nil {
		_ = c.Close()
		t.Fatalf("write connect req: %v", err)
	}
	rep := socks5ReadReply(t, c)
	_ = c.SetDeadline(time.Time{})
	return c, rep
}

func socks5DialUserPass(t *testing.T, proxyAddr, user, pass, host string, port int) (net.Conn, byte) {
	t.Helper()
	c, err := net.DialTimeout("tcp", proxyAddr, 3*time.Second)
	if err != nil {
		t.Fatalf("dial proxy %s: %v", proxyAddr, err)
	}
	_ = c.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := c.Write([]byte{socks5Version, 2, socks5AuthNone, socks5AuthUserPass}); err != nil {
		_ = c.Close()
		t.Fatalf("write greeting: %v", err)
	}
	var sel [2]byte
	if _, err := io.ReadFull(c, sel[:]); err != nil {
		_ = c.Close()
		t.Fatalf("read method selection: %v", err)
	}
	if sel[0] != socks5Version || sel[1] != socks5AuthUserPass {
		_ = c.Close()
		t.Fatalf("method selection = %v, want [5 2]", sel)
	}
	auth := []byte{socks5UserPassVer, byte(len(user))}
	auth = append(auth, []byte(user)...)
	auth = append(auth, byte(len(pass)))
	auth = append(auth, []byte(pass)...)
	if _, err := c.Write(auth); err != nil {
		_ = c.Close()
		t.Fatalf("write user/pass: %v", err)
	}
	var aresp [2]byte
	if _, err := io.ReadFull(c, aresp[:]); err != nil {
		_ = c.Close()
		t.Fatalf("read user/pass reply: %v", err)
	}
	if aresp[0] != socks5UserPassVer || aresp[1] != 0x00 {
		_ = c.Close()
		t.Fatalf("auth reply = %v, want [1 0]", aresp)
	}
	if _, err := c.Write(socks5BuildRequest(socks5CmdConnect, host, port)); err != nil {
		_ = c.Close()
		t.Fatalf("write connect req: %v", err)
	}
	rep := socks5ReadReply(t, c)
	_ = c.SetDeadline(time.Time{})
	return c, rep
}

func waitForRawStreams(t *testing.T, tr *Traffic, want int) []RawTCPStream {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		items, total, err := tr.ListRawTCPStreams(RawTCPFilter{Limit: 100})
		if err != nil {
			t.Fatalf("ListRawTCPStreams: %v", err)
		}
		if total >= want {
			return items
		}
		time.Sleep(15 * time.Millisecond)
	}
	items, total, _ := tr.ListRawTCPStreams(RawTCPFilter{Limit: 100})
	t.Fatalf("timed out waiting for %d raw tcp streams; got total=%d (%+v)", want, total, items)
	return nil
}

func TestSOCKS5FlagOffMeansNoListener(t *testing.T) {
	t.Setenv(SOCKS5EnabledEnv, "")
	t.Setenv(SOCKS5AddrEnv, "")
	if cfg, ok := SOCKS5ConfigFromEnv(); ok || cfg.Addr != "" {
		t.Fatalf("default SOCKS5ConfigFromEnv = (%+v, %v), want disabled", cfg, ok)
	}
	t.Setenv(SOCKS5EnabledEnv, "0")
	t.Setenv(SOCKS5AddrEnv, "127.0.0.1:1080")
	if _, ok := SOCKS5ConfigFromEnv(); ok {
		t.Fatalf("explicit ARTEX_SOCKS5_ENABLED=0 must stay disabled even when addr is set")
	}
	t.Setenv(SOCKS5EnabledEnv, "1")
	t.Setenv(SOCKS5AddrEnv, "")
	cfg, ok := SOCKS5ConfigFromEnv()
	if !ok || cfg.Addr != DefaultSOCKS5Addr {
		t.Fatalf("enabled default = (%+v, %v), want (%s, true)", cfg, ok, DefaultSOCKS5Addr)
	}

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()
	if got := tr.SOCKS5Addr(); got != "" {
		t.Fatalf("SOCKS5Addr with flag off = %q, want empty", got)
	}
}

func TestSOCKS5HandshakeSuccessAuthAndHalfCloseNoHTTPExchange(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	// Server that reads until client half-closes (CloseWrite), then replies.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(conn net.Conn) {
				defer conn.Close()
				req, _ := io.ReadAll(conn)
				_, _ = conn.Write(append([]byte("ACK:"), req...))
			}(c)
		}
	}()
	targetHost, targetPortStr, _ := net.SplitHostPort(ln.Addr().String())
	targetPort, _ := strconv.Atoi(targetPortStr)

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	var pacedSeen atomic.Bool
	var unpacedSeen atomic.Bool
	proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
		Addr: "127.0.0.1:0",
		OnRecord: func(rec RawTCPCapture) {
			if rec.Paced {
				pacedSeen.Store(true)
			} else {
				unpacedSeen.Store(true)
			}
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	// 1. Loopback no-auth + half-close relay.
	c1, rep := socks5DialNoAuth(t, proxyAddr, targetHost, targetPort)
	if rep != socks5RepSuccess {
		t.Fatalf("no-auth connect rep = 0x%02x, want 0x00", rep)
	}
	if _, err := c1.Write([]byte("hello-half-close")); err != nil {
		t.Fatal(err)
	}
	if err := c1.(*net.TCPConn).CloseWrite(); err != nil {
		t.Fatal(err)
	}
	resp1, err := io.ReadAll(c1)
	_ = c1.Close()
	if err != nil {
		t.Fatal(err)
	}
	if string(resp1) != "ACK:hello-half-close" {
		t.Fatalf("half-close reply = %q, want %q", resp1, "ACK:hello-half-close")
	}

	// 2. Username/password with pace marker (egress.PaceUser).
	c2, rep := socks5DialUserPass(t, proxyAddr, egress.PaceUser, egress.PaceUser, targetHost, targetPort)
	if rep != socks5RepSuccess {
		t.Fatalf("user/pass pace connect rep = 0x%02x, want 0x00", rep)
	}
	_, _ = c2.Write([]byte("paced-payload"))
	_ = c2.(*net.TCPConn).CloseWrite()
	resp2, err := io.ReadAll(c2)
	_ = c2.Close()
	if err != nil || string(resp2) != "ACK:paced-payload" {
		t.Fatalf("paced reply = %q err=%v", resp2, err)
	}

	// 3. Username/password with arbitrary/empty credentials still accepted.
	c3, rep := socks5DialUserPass(t, proxyAddr, "", "", targetHost, targetPort)
	if rep != socks5RepSuccess {
		t.Fatalf("empty user/pass connect rep = 0x%02x, want 0x00", rep)
	}
	_, _ = c3.Write([]byte("anon"))
	_ = c3.(*net.TCPConn).CloseWrite()
	_, _ = io.ReadAll(c3)
	_ = c3.Close()

	streams := waitForRawStreams(t, tr, 3)
	if !pacedSeen.Load() || !unpacedSeen.Load() {
		t.Fatalf("paced=%v unpaced=%v, want both true", pacedSeen.Load(), unpacedSeen.Load())
	}

	// Verify store fields, CountRawTCPStreams, GetRawTCPStream, and ZERO HTTP exchanges.
	cntAll, err := tr.CountRawTCPStreams("")
	if err != nil || cntAll != 3 {
		t.Fatalf("CountRawTCPStreams('') = %d err=%v, want 3", cntAll, err)
	}
	cntHost, err := tr.CountRawTCPStreams(targetHost)
	if err != nil || cntHost != 3 {
		t.Fatalf("CountRawTCPStreams(%q) = %d err=%v, want 3", targetHost, cntHost, err)
	}
	got, err := tr.GetRawTCPStream(streams[0].ID)
	if err != nil || got == nil {
		t.Fatalf("GetRawTCPStream(%q) = %+v err=%v", streams[0].ID, got, err)
	}
	if got.Protocol != "tcp" || got.Host != targetHost || got.Port != targetPort || got.Truncated {
		t.Fatalf("unexpected stream metadata: %+v", got)
	}
	if got.C2SBlob != "" || got.S2CBlob != "" {
		t.Fatalf("small payload unexpectedly spilled to blob: %+v", got)
	}

	var httpRows int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM exchanges`).Scan(&httpRows); err != nil {
		t.Fatal(err)
	}
	if httpRows != 0 {
		t.Fatalf("raw TCP streams created %d HTTP exchanges rows, want 0", httpRows)
	}
}

type fakeRemoteAddrConn struct {
	net.Conn
	remote net.Addr
}

func (f fakeRemoteAddrConn) RemoteAddr() net.Addr { return f.remote }

func TestSOCKS5HandshakeFailuresUnsupportedCommandsAndMalformedInput(t *testing.T) {
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
		Addr:             "127.0.0.1:0",
		HandshakeTimeout: 150 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}

	// 1. BIND and UDP ASSOCIATE rejected with 0x07 (command not supported).
	for _, tc := range []struct {
		name string
		cmd  byte
	}{
		{"bind", socks5CmdBind},
		{"udp_associate", socks5CmdUDPAssociate},
		{"unknown_cmd", 0x09},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, err := net.DialTimeout("tcp", proxyAddr, 2*time.Second)
			if err != nil {
				t.Fatal(err)
			}
			defer c.Close()
			_, _ = c.Write([]byte{socks5Version, 1, socks5AuthNone})
			var sel [2]byte
			if _, err := io.ReadFull(c, sel[:]); err != nil {
				t.Fatal(err)
			}
			_, _ = c.Write(socks5BuildRequest(tc.cmd, "127.0.0.1", 8080))
			if rep := socks5ReadReply(t, c); rep != socks5RepCmdNotSupported {
				t.Fatalf("%s reply = 0x%02x, want 0x%02x", tc.name, rep, socks5RepCmdNotSupported)
			}
		})
	}

	// 2. Unsupported auth method -> 0x05 0xFF.
	t.Run("unsupported_auth_method", func(t *testing.T) {
		c, err := net.DialTimeout("tcp", proxyAddr, 2*time.Second)
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		_, _ = c.Write([]byte{socks5Version, 1, 0x03})
		var sel [2]byte
		if _, err := io.ReadFull(c, sel[:]); err != nil {
			t.Fatal(err)
		}
		if sel != [2]byte{socks5Version, socks5AuthNoAccept} {
			t.Fatalf("reply = %v, want [5 255]", sel)
		}
	})

	// 3. Non-loopback client offering only no-auth -> rejected with 0x05 0xFF.
	t.Run("non_loopback_no_auth_rejected", func(t *testing.T) {
		srvSide, cliSide := net.Pipe()
		defer cliSide.Close()
		done := make(chan struct{})
		go func() {
			defer close(done)
			defer srvSide.Close()
			tr.socks.handleConn(fakeRemoteAddrConn{
				Conn:   srvSide,
				remote: &net.TCPAddr{IP: net.ParseIP("198.51.100.10"), Port: 54321},
			})
		}()
		_, _ = cliSide.Write([]byte{socks5Version, 1, socks5AuthNone})
		var sel [2]byte
		if _, err := io.ReadFull(cliSide, sel[:]); err != nil {
			t.Fatal(err)
		}
		if sel != [2]byte{socks5Version, socks5AuthNoAccept} {
			t.Fatalf("non-loopback no-auth reply = %v, want [5 255]", sel)
		}
		<-done
	})

	// 4. Unsupported ATYP -> 0x08.
	t.Run("unsupported_atyp", func(t *testing.T) {
		c, err := net.DialTimeout("tcp", proxyAddr, 2*time.Second)
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		_, _ = c.Write([]byte{socks5Version, 1, socks5AuthNone})
		var sel [2]byte
		_, _ = io.ReadFull(c, sel[:])
		_, _ = c.Write([]byte{socks5Version, socks5CmdConnect, 0x00, 0x09, 0x00, 0x50})
		if rep := socks5ReadReply(t, c); rep != socks5RepAtypNotSupported {
			t.Fatalf("atyp reply = 0x%02x, want 0x%02x", rep, socks5RepAtypNotSupported)
		}
	})

	// 5. Malformed inputs & handshake deadline: must close cleanly without panic.
	malformed := [][]byte{
		{0x04, 0x01, 0x00}, // wrong version
		{0x05, 0x00},       // 0 methods
		{0x05},             // truncated greeting
		{0x05, 0x01, 0x02, 0x02, 0x01, 'a', 0x01, 'b'},                  // bad RFC1929 version
		{0x05, 0x01, 0x00, 0x05, 0x01, 0xFF, 0x01, 127, 0, 0, 1, 0, 80}, // bad RSV
		{0x05, 0x01, 0x00, 0x05, 0x01, 0x00, 0x03, 0x00, 0, 80},         // empty domain
		{0x05, 0x01, 0x00, 0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, 0, 0},  // zero port
		nil, // silent client -> handshake timeout
	}
	baseG := runtime.NumGoroutine()
	for i, payload := range malformed {
		c, err := net.DialTimeout("tcp", proxyAddr, 2*time.Second)
		if err != nil {
			t.Fatalf("malformed[%d] dial: %v", i, err)
		}
		if len(payload) > 0 {
			_, _ = c.Write(payload)
			_ = c.(*net.TCPConn).CloseWrite()
		}
		_ = c.SetReadDeadline(time.Now().Add(time.Second))
		_, _ = io.Copy(io.Discard, c)
		_ = c.Close()
	}
	time.Sleep(50 * time.Millisecond)
	if afterG := runtime.NumGoroutine(); afterG > baseG+4 {
		t.Fatalf("possible goroutine leak after malformed handshakes: before=%d after=%d", baseG, afterG)
	}
}

func TestSOCKS5DeniedTargetRefusedBeforeDial(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	echoLn, accepted := startEchoServer(t, "tcp4", "127.0.0.1:0")
	host, portStr, _ := net.SplitHostPort(echoLn.Addr().String())
	port, _ := strconv.Atoi(portStr)

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	// Use intercept.PinnedDialer with a gated TargetScope whose Interceptor is nil:
	// PinnedDialer returns TargetGateUnavailable (a platform dialError) BEFORE dialing.
	proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
		Addr: "127.0.0.1:0",
		BaseContext: func() context.Context {
			return intercept.WithTargetScope(context.Background(), intercept.TargetScope{
				TaskID:  "99",
				Enabled: func() bool { return true },
			})
		},
		DialContext: intercept.PinnedDialer("socks5", true),
	})
	if err != nil {
		t.Fatal(err)
	}

	c, rep := socks5DialNoAuth(t, proxyAddr, host, port)
	_ = c.Close()
	if rep != socks5RepNotAllowed {
		t.Fatalf("denied target reply = 0x%02x, want 0x%02x", rep, socks5RepNotAllowed)
	}
	if accepted.Load() != 0 {
		t.Fatalf("upstream accepted %d connections despite target gate refusal", accepted.Load())
	}
	if n, _ := tr.CountRawTCPStreams(""); n != 0 {
		t.Fatalf("refused connection recorded %d raw streams, want 0", n)
	}
}

func TestSOCKS5GovernorRefusalBeforeDial(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	// 1 token burst, very slow refill: 2nd request must wait far longer than PaceTimeout.
	egress.SetProfile(egress.Profile{Name: "tight", RPS: 0.01, Burst: 1, MaxPerHost: 1, MaxGlobal: 1})

	echoLn, _ := startEchoServer(t, "tcp4", "127.0.0.1:0")
	host, portStr, _ := net.SplitHostPort(echoLn.Addr().String())
	port, _ := strconv.Atoi(portStr)

	var dialCalls atomic.Int32
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
		Addr:        "127.0.0.1:0",
		PaceTimeout: 40 * time.Millisecond,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			dialCalls.Add(1)
			return (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, network, addr)
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	// First call consumes the single burst token.
	c1, rep1 := socks5DialUserPass(t, proxyAddr, egress.PaceUser, egress.PaceUser, host, port)
	if rep1 != socks5RepSuccess {
		t.Fatalf("first connect rep = 0x%02x, want 0x00", rep1)
	}
	_ = c1.Close()

	// Second call exceeds PaceTimeout inside egress.Do and is refused BEFORE dial.
	before := dialCalls.Load()
	c2, rep2 := socks5DialUserPass(t, proxyAddr, egress.PaceUser, egress.PaceUser, host, port)
	_ = c2.Close()
	if rep2 != socks5RepNotAllowed {
		t.Fatalf("governor refusal reply = 0x%02x, want 0x%02x", rep2, socks5RepNotAllowed)
	}
	if dialCalls.Load() != before {
		t.Fatalf("dialer was called despite egress governor refusal (before=%d after=%d)", before, dialCalls.Load())
	}
}

func TestSOCKS5ByteCapsTruncationAndBlobSpill(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	echoLn, _ := startEchoServer(t, "tcp4", "127.0.0.1:0")
	host, portStr, _ := net.SplitHostPort(echoLn.Addr().String())
	port, _ := strconv.Atoi(portStr)

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	const (
		maxPerDir  = 2048
		previewCap = 256
		sendTotal  = 6144
	)
	proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
		Addr:           "127.0.0.1:0",
		MaxBytesPerDir: maxPerDir,
		PreviewBytes:   previewCap,
	})
	if err != nil {
		t.Fatal(err)
	}

	payload := make([]byte, sendTotal)
	for i := range payload {
		payload[i] = byte(i % 251) // includes NUL bytes (binary stream)
	}

	c, rep := socks5DialNoAuth(t, proxyAddr, host, port)
	if rep != socks5RepSuccess {
		t.Fatalf("connect rep = 0x%02x", rep)
	}
	go func() {
		_, _ = c.Write(payload)
		_ = c.(*net.TCPConn).CloseWrite()
	}()
	echoed, err := io.ReadAll(c)
	_ = c.Close()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(echoed, payload) {
		t.Fatalf("relayed payload len=%d differed from sent len=%d", len(echoed), len(payload))
	}

	streams := waitForRawStreams(t, tr, 1)
	s := streams[0]
	if !s.Truncated {
		t.Fatalf("expected Truncated=true when %d > %d", sendTotal, maxPerDir)
	}
	if s.C2SBytes != sendTotal || s.S2CBytes != sendTotal {
		t.Fatalf("byte counts = (%d, %d), want (%d, %d)", s.C2SBytes, s.S2CBytes, sendTotal, sendTotal)
	}
	if len(s.C2SPreview) != previewCap || len(s.S2CPreview) != previewCap {
		t.Fatalf("preview lengths = (%d, %d), want (%d, %d)", len(s.C2SPreview), len(s.S2CPreview), previewCap, previewCap)
	}
	if !bytes.Equal(s.C2SPreview, payload[:previewCap]) || !bytes.Equal(s.S2CPreview, payload[:previewCap]) {
		t.Fatalf("preview bytes mismatch")
	}
	if s.C2SBlob == "" || s.S2CBlob == "" {
		t.Fatalf("expected spilled blob hashes, got c2s=%q s2c=%q", s.C2SBlob, s.S2CBlob)
	}

	// Blob must be readable via Traffic.Blob and registered in blob_refs.
	f, sz, err := tr.Blob(s.C2SBlob)
	if err != nil {
		t.Fatalf("tr.Blob(%q): %v", s.C2SBlob, err)
	}
	defer f.Close()
	blobData, _ := io.ReadAll(f)
	if sz != maxPerDir || !bytes.Equal(blobData, payload[:maxPerDir]) {
		t.Fatalf("spilled blob size=%d len=%d, want %d matching prefix", sz, len(blobData), maxPerDir)
	}
	var refs int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM blob_refs WHERE hash=? AND exchange_id=?`, s.C2SBlob, s.ID).Scan(&refs); err != nil || refs != 1 {
		t.Fatalf("blob_refs count = %d err=%v, want 1", refs, err)
	}
}

func TestSOCKS5IPv4IPv6HostnameAndDNSFailure(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	echo4, _ := startEchoServer(t, "tcp4", "127.0.0.1:0")
	_, p4s, _ := net.SplitHostPort(echo4.Addr().String())
	p4, _ := strconv.Atoi(p4s)

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
		Addr: "127.0.0.1:0",
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			h, _, _ := net.SplitHostPort(addr)
			if h == "nonexistent.invalid" {
				return nil, &net.DNSError{Err: "no such host", Name: h, IsNotFound: true}
			}
			return (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, network, addr)
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	// 1. IPv4 literal
	c4, rep := socks5DialNoAuth(t, proxyAddr, "127.0.0.1", p4)
	if rep != socks5RepSuccess {
		t.Fatalf("ipv4 rep = 0x%02x", rep)
	}
	_, _ = c4.Write([]byte("v4"))
	_ = c4.(*net.TCPConn).CloseWrite()
	got4, _ := io.ReadAll(c4)
	_ = c4.Close()
	if string(got4) != "v4" {
		t.Fatalf("ipv4 echo = %q", got4)
	}

	// 2. Hostname (localhost)
	ch, rep := socks5DialNoAuth(t, proxyAddr, "localhost", p4)
	if rep != socks5RepSuccess {
		t.Fatalf("hostname rep = 0x%02x", rep)
	}
	_, _ = ch.Write([]byte("host"))
	_ = ch.(*net.TCPConn).CloseWrite()
	goth, _ := io.ReadAll(ch)
	_ = ch.Close()
	if string(goth) != "host" {
		t.Fatalf("hostname echo = %q", goth)
	}

	// 3. DNS failure -> 0x04 Host unreachable
	cd, rep := socks5DialNoAuth(t, proxyAddr, "nonexistent.invalid", 443)
	_ = cd.Close()
	if rep != socks5RepHostUnreachable {
		t.Fatalf("dns failure rep = 0x%02x, want 0x%02x", rep, socks5RepHostUnreachable)
	}

	// 4. IPv6 literal (::1) if available in this kernel/environment.
	wantStreams := 2
	if echo6, err := net.Listen("tcp6", "[::1]:0"); err == nil {
		t.Cleanup(func() { _ = echo6.Close() })
		go func() {
			for {
				c, err := echo6.Accept()
				if err != nil {
					return
				}
				go func(conn net.Conn) {
					defer conn.Close()
					_, _ = io.Copy(conn, conn)
				}(c)
			}
		}()
		_, p6s, _ := net.SplitHostPort(echo6.Addr().String())
		p6, _ := strconv.Atoi(p6s)
		c6, rep6 := socks5DialNoAuth(t, proxyAddr, "::1", p6)
		if rep6 != socks5RepSuccess {
			t.Fatalf("ipv6 rep = 0x%02x", rep6)
		}
		_, _ = c6.Write([]byte("v6"))
		_ = c6.(*net.TCPConn).CloseWrite()
		got6, _ := io.ReadAll(c6)
		_ = c6.Close()
		if string(got6) != "v6" {
			t.Fatalf("ipv6 echo = %q", got6)
		}
		wantStreams++
	}

	waitForRawStreams(t, tr, wantStreams)
}

func TestSOCKS5ConcurrentStreamsMaxLimitAndIdleTimeout(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	echoLn, _ := startEchoServer(t, "tcp4", "127.0.0.1:0")
	host, portStr, _ := net.SplitHostPort(echoLn.Addr().String())
	port, _ := strconv.Atoi(portStr)

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
		Addr:          "127.0.0.1:0",
		MaxConcurrent: 2,
		IdleTimeout:   200 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Open 2 concurrent streams simultaneously.
	c1, rep1 := socks5DialNoAuth(t, proxyAddr, host, port)
	if rep1 != socks5RepSuccess {
		t.Fatalf("stream 1 rep = 0x%02x", rep1)
	}
	defer c1.Close()
	c2, rep2 := socks5DialNoAuth(t, proxyAddr, host, port)
	if rep2 != socks5RepSuccess {
		t.Fatalf("stream 2 rep = 0x%02x", rep2)
	}
	defer c2.Close()

	// 3rd simultaneous stream must be rejected with 0x01 (MaxConcurrent=2).
	c3, rep3 := socks5DialNoAuth(t, proxyAddr, host, port)
	_ = c3.Close()
	if rep3 != socks5RepGeneralFailure {
		t.Fatalf("3rd concurrent stream rep = 0x%02x, want 0x%02x", rep3, socks5RepGeneralFailure)
	}

	// Exchange bytes on both active streams while both are open.
	var wg sync.WaitGroup
	wg.Add(2)
	checkEcho := func(c net.Conn, msg string) {
		defer wg.Done()
		if _, err := c.Write([]byte(msg)); err != nil {
			t.Errorf("write %s: %v", msg, err)
			return
		}
		buf := make([]byte, len(msg))
		if _, err := io.ReadFull(c, buf); err != nil || string(buf) != msg {
			t.Errorf("echo %s: got %q err=%v", msg, buf, err)
		}
	}
	go checkEcho(c1, "stream-one")
	go checkEcho(c2, "stream-two")
	wg.Wait()

	// Leave both idle past IdleTimeout (200ms): relay must close them cleanly and record both.
	_ = c1.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 1)
	_, rerr := c1.Read(buf)
	if rerr == nil || !errors.Is(rerr, io.EOF) {
		// Peer close on idle may return EOF or connection reset depending on OS timing.
		if rerr == nil {
			t.Fatalf("expected idle stream 1 to close after IdleTimeout")
		}
	}
	_ = c1.Close()
	_ = c2.Close()

	streams := waitForRawStreams(t, tr, 2)
	if len(streams) < 2 {
		t.Fatalf("want at least 2 recorded concurrent streams, got %d", len(streams))
	}
}

func TestRawTCPAtomicBlobSpillConcurrent(t *testing.T) {
	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()
	payload := bytes.Repeat([]byte("ATOMIC-BLOB-"), 128) // 1536 bytes > 64 preview
	const workers = 8
	var wg sync.WaitGroup
	hashes := make([]string, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			prev, h := tr.spillRawDir(payload, 64)
			if len(prev) != 64 {
				t.Errorf("worker %d preview len = %d, want 64", idx, len(prev))
			}
			hashes[idx] = h
		}(i)
	}
	wg.Wait()

	wantHash := hashes[0]
	if wantHash == "" {
		t.Fatal("expected non-empty blob hash")
	}
	for i, h := range hashes {
		if h != wantHash {
			t.Fatalf("worker %d hash = %q, want %q", i, h, wantHash)
		}
	}
	blobDir := filepath.Join(tr.dir, "_blobs", "sha256", wantHash[:2])
	entries, err := os.ReadDir(blobDir)
	if err != nil {
		t.Fatalf("ReadDir(%s): %v", blobDir, err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Fatalf("leftover temp blob file: %s", e.Name())
		}
	}
	got, err := os.ReadFile(filepath.Join(blobDir, wantHash+".bin"))
	if err != nil {
		t.Fatalf("ReadFile blob: %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("blob content mismatch: got %d bytes, want %d", len(got), len(payload))
	}
}
