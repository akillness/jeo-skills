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
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/intercept"
)

func makeSockaddrInBytes(family uint16, port uint16, ip [4]byte) []byte {
	var raw [sockaddrInSize]byte
	binary.NativeEndian.PutUint16(raw[0:2], family)
	binary.BigEndian.PutUint16(raw[2:4], port)
	copy(raw[4:8], ip[:])
	return raw[:]
}

func TestParseOriginalDstIPv4(t *testing.T) {
	t.Run("valid_ipv4", func(t *testing.T) {
		raw := makeSockaddrInBytes(afInet, 8443, [4]byte{198, 51, 100, 42})
		ip, port, err := parseOriginalDstIPv4(raw)
		if err != nil {
			t.Fatalf("parseOriginalDstIPv4: %v", err)
		}
		if ip.String() != "198.51.100.42" || port != 8443 {
			t.Fatalf("got (%s, %d), want (198.51.100.42, 8443)", ip, port)
		}
	})

	t.Run("valid_port_boundaries", func(t *testing.T) {
		for _, wantPort := range []uint16{1, 80, 443, 65535} {
			raw := makeSockaddrInBytes(afInet, wantPort, [4]byte{127, 0, 0, 2})
			ip, port, err := parseOriginalDstIPv4(raw)
			if err != nil || ip.String() != "127.0.0.2" || port != int(wantPort) {
				t.Fatalf("port %d: got (%v, %d, %v)", wantPort, ip, port, err)
			}
		}
	})

	t.Run("short_buffer", func(t *testing.T) {
		for _, n := range []int{0, 2, 8, 15} {
			if _, _, err := parseOriginalDstIPv4(make([]byte, n)); err == nil {
				t.Fatalf("expected error for %d-byte buffer", n)
			}
		}
	})

	t.Run("ipv6_family_rejected", func(t *testing.T) {
		raw := makeSockaddrInBytes(10, 443, [4]byte{198, 51, 100, 1})
		_, _, err := parseOriginalDstIPv4(raw)
		if !errors.Is(err, ErrTransparentTCPIPv6Unsupported) {
			t.Fatalf("err = %v, want ErrTransparentTCPIPv6Unsupported", err)
		}
	})

	t.Run("unknown_family_rejected", func(t *testing.T) {
		raw := makeSockaddrInBytes(99, 443, [4]byte{198, 51, 100, 1})
		if _, _, err := parseOriginalDstIPv4(raw); err == nil {
			t.Fatal("expected error for unknown address family")
		}
	})

	t.Run("port_zero_rejected", func(t *testing.T) {
		raw := makeSockaddrInBytes(afInet, 0, [4]byte{198, 51, 100, 1})
		if _, _, err := parseOriginalDstIPv4(raw); err == nil {
			t.Fatal("expected error for port 0")
		}
	})

	t.Run("unspecified_ip_rejected", func(t *testing.T) {
		raw := makeSockaddrInBytes(afInet, 80, [4]byte{0, 0, 0, 0})
		if _, _, err := parseOriginalDstIPv4(raw); err == nil {
			t.Fatal("expected error for 0.0.0.0")
		}
	})
}

func TestIsSelfRedirect(t *testing.T) {
	localLoopback := &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 1081}
	localAny := &net.TCPAddr{IP: net.IPv4zero, Port: 1081}

	cases := []struct {
		name  string
		ip    net.IP
		port  int
		local net.Addr
		want  bool
	}{
		{"exact_self_loop", net.IPv4(127, 0, 0, 1), 1081, localLoopback, true},
		{"wildcard_same_port", net.IPv4(198, 51, 100, 9), 1081, localAny, true},
		{"different_port", net.IPv4(127, 0, 0, 1), 8080, localLoopback, false},
		{"different_loopback_ip_same_port", net.IPv4(127, 0, 0, 2), 1081, localLoopback, false},
		{"wildcard_different_port", net.IPv4(198, 51, 100, 9), 443, localAny, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isSelfRedirect(tc.ip, tc.port, tc.local); got != tc.want {
				t.Fatalf("isSelfRedirect(%s:%d, %v) = %v, want %v", tc.ip, tc.port, tc.local, got, tc.want)
			}
		})
	}
}

func TestTransparentTCPFlagOffAndIPv6BindRejected(t *testing.T) {
	t.Setenv(TransparentTCPEnabledEnv, "")
	t.Setenv(TransparentTCPAddrEnv, "")
	if cfg, ok := TransparentTCPConfigFromEnv(); ok || cfg.Addr != "" {
		t.Fatalf("default TransparentTCPConfigFromEnv = (%+v, %v), want disabled", cfg, ok)
	}

	t.Setenv(TransparentTCPEnabledEnv, "0")
	t.Setenv(TransparentTCPAddrEnv, "127.0.0.1:1081")
	if _, ok := TransparentTCPConfigFromEnv(); ok {
		t.Fatal("explicit ARTEX_TRANSPARENT_TCP_ENABLED=0 must stay disabled even when addr is set")
	}

	t.Setenv(TransparentTCPEnabledEnv, "1")
	t.Setenv(TransparentTCPAddrEnv, "")
	cfg, ok := TransparentTCPConfigFromEnv()
	if !ok || cfg.Addr != DefaultTransparentTCPAddr {
		t.Fatalf("enabled default = (%+v, %v), want (%s, true)", cfg, ok, DefaultTransparentTCPAddr)
	}

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()
	if got := tr.TransparentTCPAddr(); got != "" {
		t.Fatalf("TransparentTCPAddr with flag off = %q, want empty", got)
	}

	// IPv6 bind address must be rejected explicitly (P4.1b covers IPv4 only).
	if _, err := tr.StartTransparentTCP(TransparentTCPConfig{
		Addr:    "[::1]:0",
		origDst: func(net.Conn) (net.IP, int, error) { return net.IPv4(127, 0, 0, 1), 80, nil },
	}); !errors.Is(err, ErrTransparentTCPIPv6Unsupported) {
		t.Fatalf("IPv6 bind err = %v, want ErrTransparentTCPIPv6Unsupported", err)
	}
}

func TestTransparentTCPRelayHalfCloseAndStoreRow(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	// Echo-after-EOF server to verify bidirectional half-close propagation.
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
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
				_, _ = conn.Write(append([]byte("TPROXY-REPLY:"), req...))
			}(c)
		}
	}()
	echoAddr := ln.Addr().(*net.TCPAddr)

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	listenAddr, err := tr.StartTransparentTCP(TransparentTCPConfig{
		Addr: "127.0.0.1:0",
		origDst: func(net.Conn) (net.IP, int, error) {
			return echoAddr.IP.To4(), echoAddr.Port, nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	c, err := net.DialTimeout("tcp4", listenAddr, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	payload := []byte("hello-transparent-tcp")
	if _, err := c.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := c.(*net.TCPConn).CloseWrite(); err != nil {
		t.Fatal(err)
	}
	got, err := io.ReadAll(c)
	if err != nil {
		t.Fatal(err)
	}
	want := append([]byte("TPROXY-REPLY:"), payload...)
	if !bytes.Equal(got, want) {
		t.Fatalf("reply = %q, want %q", got, want)
	}
	_ = c.Close()

	streams := waitForRawStreams(t, tr, 1)
	s := streams[0]
	if s.Protocol != "tcp" || s.Host != "127.0.0.1" || s.Port != echoAddr.Port {
		t.Fatalf("unexpected stream metadata: %+v", s)
	}
	if s.C2SBytes != int64(len(payload)) || s.S2CBytes != int64(len(want)) || s.Truncated {
		t.Fatalf("unexpected stream counters: %+v", s)
	}
	if !bytes.Equal(s.C2SPreview, payload) || !bytes.Equal(s.S2CPreview, want) {
		t.Fatalf("preview mismatch: c2s=%q s2c=%q", s.C2SPreview, s.S2CPreview)
	}

	// Raw TCP stream must NEVER create an HTTP exchanges row.
	var httpRows int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM exchanges`).Scan(&httpRows); err != nil {
		t.Fatal(err)
	}
	if httpRows != 0 {
		t.Fatalf("HTTP exchanges rows = %d, want 0", httpRows)
	}
}

func TestTransparentTCPMalformedOrigDstAndSelfLoopRefusedBeforeDial(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	cases := []struct {
		name    string
		origDst func(listenAddr *net.TCPAddr) func(net.Conn) (net.IP, int, error)
	}{
		{
			name: "getsockopt_error",
			origDst: func(*net.TCPAddr) func(net.Conn) (net.IP, int, error) {
				return func(net.Conn) (net.IP, int, error) { return nil, 0, errors.New("ENOENT") }
			},
		},
		{
			name: "ipv6_orig_dst_rejected",
			origDst: func(*net.TCPAddr) func(net.Conn) (net.IP, int, error) {
				return func(net.Conn) (net.IP, int, error) { return net.ParseIP("2001:db8::1"), 443, nil }
			},
		},
		{
			name: "port_zero_rejected",
			origDst: func(*net.TCPAddr) func(net.Conn) (net.IP, int, error) {
				return func(net.Conn) (net.IP, int, error) { return net.IPv4(198, 51, 100, 1), 0, nil }
			},
		},
		{
			name: "unspecified_ip_rejected",
			origDst: func(*net.TCPAddr) func(net.Conn) (net.IP, int, error) {
				return func(net.Conn) (net.IP, int, error) { return net.IPv4zero, 80, nil }
			},
		},
		{
			name: "self_loop_rejected",
			origDst: func(lnAddr *net.TCPAddr) func(net.Conn) (net.IP, int, error) {
				return func(net.Conn) (net.IP, int, error) { return lnAddr.IP.To4(), lnAddr.Port, nil }
			},
		},
	}

	baseGoroutines := runtime.NumGoroutine()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tr, err := Open(t.TempDir(), "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			defer tr.Close()

			var dialCalls atomic.Int32
			var boundTCP atomic.Pointer[net.TCPAddr]
			listenAddr, err := tr.StartTransparentTCP(TransparentTCPConfig{
				Addr:             "127.0.0.1:0",
				HandshakeTimeout: 500 * time.Millisecond,
				DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
					dialCalls.Add(1)
					return nil, errors.New("must not dial")
				},
				origDst: func(c net.Conn) (net.IP, int, error) {
					return tc.origDst(boundTCP.Load())(c)
				},
			})
			if err != nil {
				t.Fatal(err)
			}
			la, err := net.ResolveTCPAddr("tcp4", listenAddr)
			if err != nil {
				t.Fatal(err)
			}
			boundTCP.Store(la)

			c, err := net.DialTimeout("tcp4", listenAddr, 2*time.Second)
			if err != nil {
				t.Fatal(err)
			}
			_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
			buf := make([]byte, 1)
			if _, rerr := c.Read(buf); rerr == nil {
				t.Fatal("expected connection to be closed on malformed/self-loop origDst")
			}
			_ = c.Close()

			if dialCalls.Load() != 0 {
				t.Fatalf("DialContext called %d times, want 0", dialCalls.Load())
			}
			n, err := tr.CountRawTCPStreams("")
			if err != nil || n != 0 {
				t.Fatalf("CountRawTCPStreams = (%d, %v), want 0", n, err)
			}
		})
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if runtime.NumGoroutine() <= baseGoroutines+10 {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	if after := runtime.NumGoroutine(); after > baseGoroutines+10 {
		t.Fatalf("possible goroutine leak: before=%d after=%d", baseGoroutines, after)
	}
}

func TestTransparentTCPDeniedTargetAndGovernorRefusedBeforeDial(t *testing.T) {
	t.Run("target_gate_refuses_before_dial", func(t *testing.T) {
		prev := egress.CurrentProfile()
		t.Cleanup(func() { egress.SetProfile(prev) })
		egress.SetProfile(egress.Profile{Name: "off"})

		echo, accepted := startEchoServer(t, "tcp4", "127.0.0.1:0")
		echoAddr := echo.Addr().(*net.TCPAddr)

		tr, err := Open(t.TempDir(), "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer tr.Close()

		// Use intercept.PinnedDialer with a gated TargetScope whose Interceptor is nil:
		// PinnedDialer refuses BEFORE dialing any socket.
		listenAddr, err := tr.StartTransparentTCP(TransparentTCPConfig{
			Addr: "127.0.0.1:0",
			BaseContext: func() context.Context {
				return intercept.WithTargetScope(context.Background(), intercept.TargetScope{
					TaskID:  "99",
					Enabled: func() bool { return true },
				})
			},
			DialContext: intercept.PinnedDialer("transparent", true),
			origDst: func(net.Conn) (net.IP, int, error) {
				return echoAddr.IP.To4(), echoAddr.Port, nil
			},
		})
		if err != nil {
			t.Fatal(err)
		}

		c, err := net.DialTimeout("tcp4", listenAddr, 2*time.Second)
		if err != nil {
			t.Fatal(err)
		}
		_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
		buf := make([]byte, 1)
		if _, rerr := c.Read(buf); rerr == nil {
			t.Fatal("expected blocked target connection to close immediately")
		}
		_ = c.Close()

		if accepted.Load() != 0 {
			t.Fatalf("target accepted %d connections despite target gate refusal, want 0", accepted.Load())
		}
		n, err := tr.CountRawTCPStreams("")
		if err != nil || n != 0 {
			t.Fatalf("CountRawTCPStreams = (%d, %v), want 0", n, err)
		}
	})

	t.Run("governor_refuses_before_dial", func(t *testing.T) {
		prev := egress.CurrentProfile()
		t.Cleanup(func() { egress.SetProfile(prev) })
		// 1 token burst, very slow refill: 2nd connection exceeds PaceTimeout and is refused BEFORE dial.
		egress.SetProfile(egress.Profile{Name: "tight", RPS: 0.01, Burst: 1, MaxPerHost: 1, MaxGlobal: 1})

		echo, _ := startEchoServer(t, "tcp4", "127.0.0.1:0")
		echoAddr := echo.Addr().(*net.TCPAddr)

		var dialCalls atomic.Int32
		tr, err := Open(t.TempDir(), "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer tr.Close()

		listenAddr, err := tr.StartTransparentTCP(TransparentTCPConfig{
			Addr:        "127.0.0.1:0",
			PaceTimeout: 40 * time.Millisecond,
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				dialCalls.Add(1)
				return (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, network, addr)
			},
			origDst: func(net.Conn) (net.IP, int, error) {
				return echoAddr.IP.To4(), echoAddr.Port, nil
			},
		})
		if err != nil {
			t.Fatal(err)
		}

		// 1st connection consumes the single burst token.
		c1, err := net.DialTimeout("tcp4", listenAddr, 2*time.Second)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = c1.Write([]byte("ok"))
		buf2 := make([]byte, 2)
		if _, err := io.ReadFull(c1, buf2); err != nil {
			t.Fatalf("first connection failed: %v", err)
		}
		_ = c1.Close()

		// 2nd connection exceeds PaceTimeout inside egress.Do and is refused BEFORE dial.
		before := dialCalls.Load()
		c2, err := net.DialTimeout("tcp4", listenAddr, 2*time.Second)
		if err != nil {
			t.Fatal(err)
		}
		_ = c2.SetReadDeadline(time.Now().Add(2 * time.Second))
		one := make([]byte, 1)
		if _, rerr := c2.Read(one); rerr == nil {
			t.Fatal("expected governor-refused connection to close")
		}
		_ = c2.Close()

		if dialCalls.Load() != before {
			t.Fatalf("DialContext called despite governor refusal (before=%d after=%d)", before, dialCalls.Load())
		}
	})
}

func TestTransparentTCPByteCapsTruncationBlobSpillAndConcurrency(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	echo, _ := startEchoServer(t, "tcp4", "127.0.0.1:0")
	echoAddr := echo.Addr().(*net.TCPAddr)

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	listenAddr, err := tr.StartTransparentTCP(TransparentTCPConfig{
		Addr:           "127.0.0.1:0",
		MaxConcurrent:  2,
		MaxBytesPerDir: 512,
		PreviewBytes:   64,
		IdleTimeout:    200 * time.Millisecond,
		origDst: func(net.Conn) (net.IP, int, error) {
			return echoAddr.IP.To4(), echoAddr.Port, nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	// 1. Oversized stream -> truncated=true, preview=64, blob spilled atomically with blob_refs.
	c, err := net.DialTimeout("tcp4", listenAddr, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	big := bytes.Repeat([]byte("TP"), 512) // 1024 bytes > MaxBytesPerDir(512) > PreviewBytes(64)
	if _, err := c.Write(big); err != nil {
		t.Fatal(err)
	}
	if err := c.(*net.TCPConn).CloseWrite(); err != nil {
		t.Fatal(err)
	}
	got, err := io.ReadAll(c)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, big) {
		t.Fatalf("relayed %d bytes, want %d", len(got), len(big))
	}
	_ = c.Close()

	streams := waitForRawStreams(t, tr, 1)
	st := streams[0]
	if !st.Truncated || st.C2SBytes != 1024 || st.S2CBytes != 1024 {
		t.Fatalf("unexpected truncation/counts: %+v", st)
	}
	if len(st.C2SPreview) != 64 || st.C2SBlob == "" || st.S2CBlob == "" {
		t.Fatalf("expected 64-byte preview and blob hashes: %+v", st)
	}
	blobFile := filepath.Join(tr.dir, "_blobs", "sha256", st.C2SBlob[:2], st.C2SBlob+".bin")
	blobBytes, err := os.ReadFile(blobFile)
	if err != nil || len(blobBytes) != 512 {
		t.Fatalf("blob file (%s): len=%d err=%v, want 512", blobFile, len(blobBytes), err)
	}
	var refs int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM blob_refs WHERE exchange_id = ?`, st.ID).Scan(&refs); err != nil || refs < 1 {
		t.Fatalf("blob_refs for %s = (%d, %v), want >= 1", st.ID, refs, err)
	}

	// 2. MaxConcurrent=2 + IdleTimeout: hold 2 active streams, verify 3rd is rejected cleanly.
	c1, err := net.DialTimeout("tcp4", listenAddr, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer c1.Close()
	c2, err := net.DialTimeout("tcp4", listenAddr, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer c2.Close()

	// Send one byte on each so both goroutines acquire semaphore slots.
	var wg sync.WaitGroup
	wg.Add(2)
	for _, conn := range []net.Conn{c1, c2} {
		go func(cn net.Conn) {
			defer wg.Done()
			_, _ = cn.Write([]byte("hi"))
			buf := make([]byte, 2)
			_, _ = io.ReadFull(cn, buf)
		}(conn)
	}
	wg.Wait()

	c3, err := net.DialTimeout("tcp4", listenAddr, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	_ = c3.SetReadDeadline(time.Now().Add(2 * time.Second))
	one := make([]byte, 1)
	if _, rerr := c3.Read(one); rerr == nil {
		t.Fatal("expected 3rd concurrent stream beyond MaxConcurrent=2 to close")
	}
	_ = c3.Close()

	// IdleTimeout closes c1 and c2 cleanly.
	_ = c1.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, rerr := c1.Read(one); rerr == nil {
		t.Fatal("expected idle stream to close after IdleTimeout")
	}
	_ = c1.Close()
	_ = c2.Close()

	all := waitForRawStreams(t, tr, 3)
	if len(all) != 3 {
		t.Fatalf("want 3 recorded streams (1 big + 2 concurrent), got %d", len(all))
	}
	_ = strconv.Itoa(len(all))
}
