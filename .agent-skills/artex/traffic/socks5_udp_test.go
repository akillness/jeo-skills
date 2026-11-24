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
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/intercept"
)

func startUDPEchoServer(t *testing.T, addr string) (*net.UDPConn, *atomic.Int32) {
	t.Helper()
	uaddr, err := net.ResolveUDPAddr("udp4", addr)
	if err != nil {
		t.Fatalf("resolve udp %s: %v", addr, err)
	}
	conn, err := net.ListenUDP("udp4", uaddr)
	if err != nil {
		t.Fatalf("listen udp %s: %v", addr, err)
	}
	var received atomic.Int32
	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 65535)
		for {
			n, from, err := conn.ReadFromUDP(buf)
			if err != nil {
				return
			}
			received.Add(1)
			reply := append([]byte("UDP-ECHO:"), buf[:n]...)
			_, _ = conn.WriteToUDP(reply, from)
		}
	}()
	t.Cleanup(func() {
		_ = conn.Close()
		<-done
	})
	return conn, &received
}

func socks5UDPAssociate(t *testing.T, proxyAddr string, useAuth bool, atyp byte, dstHost string, dstPort int) (net.Conn, *net.UDPAddr, byte) {
	t.Helper()
	c, err := net.DialTimeout("tcp4", proxyAddr, 2*time.Second)
	if err != nil {
		t.Fatalf("dial socks5 %s: %v", proxyAddr, err)
	}
	_ = c.SetDeadline(time.Now().Add(5 * time.Second))
	if useAuth {
		if _, err := c.Write([]byte{socks5Version, 1, socks5AuthUserPass}); err != nil {
			t.Fatal(err)
		}
		var sel [2]byte
		if _, err := io.ReadFull(c, sel[:]); err != nil || sel != [2]byte{socks5Version, socks5AuthUserPass} {
			t.Fatalf("auth selection = %v err=%v", sel, err)
		}
		user := egress.PaceUser
		authReq := []byte{socks5UserPassVer, byte(len(user))}
		authReq = append(authReq, []byte(user)...)
		authReq = append(authReq, 0)
		if _, err := c.Write(authReq); err != nil {
			t.Fatal(err)
		}
		var ares [2]byte
		if _, err := io.ReadFull(c, ares[:]); err != nil || ares != [2]byte{socks5UserPassVer, 0x00} {
			t.Fatalf("auth reply = %v err=%v", ares, err)
		}
	} else {
		if _, err := c.Write([]byte{socks5Version, 1, socks5AuthNone}); err != nil {
			t.Fatal(err)
		}
		var sel [2]byte
		if _, err := io.ReadFull(c, sel[:]); err != nil || sel != [2]byte{socks5Version, socks5AuthNone} {
			t.Fatalf("no-auth selection = %v err=%v", sel, err)
		}
	}

	req := []byte{socks5Version, socks5CmdUDPAssociate, 0x00, atyp}
	switch atyp {
	case socks5AtypIPv4:
		ip4 := net.ParseIP(dstHost).To4()
		if ip4 == nil {
			ip4 = net.IPv4zero.To4()
		}
		req = append(req, ip4...)
	case socks5AtypIPv6:
		ip16 := net.ParseIP(dstHost).To16()
		if ip16 == nil {
			ip16 = net.IPv6zero
		}
		req = append(req, ip16...)
	case socks5AtypDomain:
		req = append(req, byte(len(dstHost)))
		req = append(req, []byte(dstHost)...)
	}
	var p [2]byte
	binary.BigEndian.PutUint16(p[:], uint16(dstPort))
	req = append(req, p[:]...)
	if _, err := c.Write(req); err != nil {
		t.Fatal(err)
	}

	var head [4]byte
	if _, err := io.ReadFull(c, head[:]); err != nil {
		t.Fatalf("read reply head: %v", err)
	}
	var bndIP net.IP
	switch head[3] {
	case socks5AtypIPv4:
		var ip [4]byte
		if _, err := io.ReadFull(c, ip[:]); err != nil {
			t.Fatal(err)
		}
		bndIP = net.IP(ip[:])
	case socks5AtypIPv6:
		var ip [16]byte
		if _, err := io.ReadFull(c, ip[:]); err != nil {
			t.Fatal(err)
		}
		bndIP = net.IP(ip[:])
	default:
		t.Fatalf("unexpected reply atyp 0x%02x", head[3])
	}
	var bp [2]byte
	if _, err := io.ReadFull(c, bp[:]); err != nil {
		t.Fatal(err)
	}
	_ = c.SetDeadline(time.Time{})
	return c, &net.UDPAddr{IP: bndIP, Port: int(binary.BigEndian.Uint16(bp[:]))}, head[1]
}

func makeClientUDPPacketIPv4(ip net.IP, port int, frag byte, payload []byte) []byte {
	out := make([]byte, 10+len(payload))
	out[0] = 0x00
	out[1] = 0x00
	out[2] = frag
	out[3] = socks5AtypIPv4
	copy(out[4:8], ip.To4())
	binary.BigEndian.PutUint16(out[8:10], uint16(port))
	copy(out[10:], payload)
	return out
}

func makeClientUDPPacketDomain(domain string, port int, payload []byte) []byte {
	out := make([]byte, 0, 4+1+len(domain)+2+len(payload))
	out = append(out, 0x00, 0x00, 0x00, socks5AtypDomain, byte(len(domain)))
	out = append(out, []byte(domain)...)
	var p [2]byte
	binary.BigEndian.PutUint16(p[:], uint16(port))
	out = append(out, p[:]...)
	out = append(out, payload...)
	return out
}

func waitForUDPDatagrams(t *testing.T, tr *Traffic, want int) []RawUDPDatagram {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		rows, total, err := tr.ListRawUDPDatagrams(RawUDPFilter{Limit: 100})
		if err != nil {
			t.Fatalf("ListRawUDPDatagrams: %v", err)
		}
		if total >= want {
			return rows
		}
		time.Sleep(20 * time.Millisecond)
	}
	rows, total, _ := tr.ListRawUDPDatagrams(RawUDPFilter{Limit: 100})
	t.Fatalf("timed out waiting for %d raw UDP datagrams (got %d: %+v)", want, total, rows)
	return nil
}

func TestSOCKS5UDPHeaderParsingAndBuild(t *testing.T) {
	t.Run("ipv4_roundtrip", func(t *testing.T) {
		payload := []byte("dns-query-bytes")
		pkt, err := buildSOCKS5UDPPacket(net.IPv4(198, 51, 100, 53), 53, payload)
		if err != nil {
			t.Fatalf("buildSOCKS5UDPPacket: %v", err)
		}
		atyp, host, port, got, err := parseSOCKS5UDPHeader(pkt)
		if err != nil {
			t.Fatalf("parseSOCKS5UDPHeader: %v", err)
		}
		if atyp != socks5AtypIPv4 || host != "198.51.100.53" || port != 53 || !bytes.Equal(got, payload) {
			t.Fatalf("got (%d, %q, %d, %q)", atyp, host, port, got)
		}
	})

	t.Run("domain_valid", func(t *testing.T) {
		pkt := makeClientUDPPacketDomain("udp.example.test", 5353, []byte("hi"))
		atyp, host, port, got, err := parseSOCKS5UDPHeader(pkt)
		if err != nil {
			t.Fatalf("parse domain: %v", err)
		}
		if atyp != socks5AtypDomain || host != "udp.example.test" || port != 5353 || string(got) != "hi" {
			t.Fatalf("got (%d, %q, %d, %q)", atyp, host, port, got)
		}
	})

	t.Run("fragmented_rejected", func(t *testing.T) {
		pkt := makeClientUDPPacketIPv4(net.IPv4(127, 0, 0, 1), 53, 0x01, []byte("frag"))
		if _, _, _, _, err := parseSOCKS5UDPHeader(pkt); !errors.Is(err, errSOCKS5UDPFragmented) {
			t.Fatalf("err = %v, want errSOCKS5UDPFragmented", err)
		}
	})

	t.Run("bad_rsv_short_ipv6_bad_dst", func(t *testing.T) {
		if _, _, _, _, err := parseSOCKS5UDPHeader([]byte{0, 0, 0}); !errors.Is(err, errSOCKS5UDPShortPacket) {
			t.Fatalf("short err = %v", err)
		}
		badRsv := makeClientUDPPacketIPv4(net.IPv4(127, 0, 0, 1), 53, 0, nil)
		badRsv[1] = 0x01
		if _, _, _, _, err := parseSOCKS5UDPHeader(badRsv); !errors.Is(err, errSOCKS5UDPBadReserved) {
			t.Fatalf("bad rsv err = %v", err)
		}
		ipv6Pkt := make([]byte, 22)
		ipv6Pkt[3] = socks5AtypIPv6
		ipv6Pkt[19] = 1
		ipv6Pkt[21] = 53
		if _, _, _, _, err := parseSOCKS5UDPHeader(ipv6Pkt); !errors.Is(err, errSOCKS5UDPUnsupportedAtyp) {
			t.Fatalf("ipv6 err = %v", err)
		}
		portZero := makeClientUDPPacketIPv4(net.IPv4(127, 0, 0, 1), 0, 0, nil)
		if _, _, _, _, err := parseSOCKS5UDPHeader(portZero); !errors.Is(err, errSOCKS5UDPBadDestination) {
			t.Fatalf("port 0 err = %v", err)
		}
		unspec := makeClientUDPPacketIPv4(net.IPv4zero, 53, 0, nil)
		if _, _, _, _, err := parseSOCKS5UDPHeader(unspec); !errors.Is(err, errSOCKS5UDPBadDestination) {
			t.Fatalf("0.0.0.0 err = %v", err)
		}
	})
}

func TestSOCKS5UDPFlagOffMeansNoListenerAndRefusesAssociate(t *testing.T) {
	// 1. All flags off -> no listener.
	t.Setenv(SOCKS5EnabledEnv, "")
	t.Setenv(SOCKS5AddrEnv, "")
	t.Setenv(SOCKS5UDPEnabledEnv, "")
	if cfg, ok := SOCKS5ConfigFromEnv(); ok || cfg.EnableUDP {
		t.Fatalf("all off = (%+v, %v), want disabled", cfg, ok)
	}

	// 2. Explicit ARTEX_SOCKS5_ENABLED=0 overrides ARTEX_SOCKS5_UDP_ENABLED=1 (no listener).
	t.Setenv(SOCKS5EnabledEnv, "0")
	t.Setenv(SOCKS5UDPEnabledEnv, "1")
	if cfg, ok := SOCKS5ConfigFromEnv(); ok {
		t.Fatalf("explicit socks5=0 with udp=1 = (%+v, %v), want disabled", cfg, ok)
	}

	// 3. ARTEX_SOCKS5_UDP_ENABLED=1 alone enables SOCKS5 on DefaultSOCKS5Addr with EnableUDP=true.
	t.Setenv(SOCKS5EnabledEnv, "")
	t.Setenv(SOCKS5AddrEnv, "")
	t.Setenv(SOCKS5UDPEnabledEnv, "1")
	if cfg, ok := SOCKS5ConfigFromEnv(); !ok || !cfg.EnableUDP || cfg.Addr != DefaultSOCKS5Addr {
		t.Fatalf("udp=1 = (%+v, %v), want (EnableUDP=true, Addr=%s)", cfg, ok, DefaultSOCKS5Addr)
	}

	// 4. SOCKS5 enabled with EnableUDP=false refuses UDP ASSOCIATE with 0x07.
	trOff, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer trOff.Close()
	addrOff, err := trOff.StartSOCKS5(SOCKS5Config{Addr: "127.0.0.1:0", EnableUDP: false})
	if err != nil {
		t.Fatal(err)
	}
	if trOff.SOCKS5UDPEnabled() {
		t.Fatal("expected SOCKS5UDPEnabled=false")
	}
	c, _, rep := socks5UDPAssociate(t, addrOff, false, socks5AtypIPv4, "0.0.0.0", 0)
	_ = c.Close()
	if rep != socks5RepCmdNotSupported {
		t.Fatalf("UDP ASSOCIATE with flag off rep = 0x%02x, want 0x%02x", rep, socks5RepCmdNotSupported)
	}

	// 5. With EnableUDP=true, IPv6 UDP ASSOCIATE is rejected with 0x08 (IPv4 first).
	trOn, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer trOn.Close()
	addrOn, err := trOn.StartSOCKS5(SOCKS5Config{Addr: "127.0.0.1:0", EnableUDP: true})
	if err != nil {
		t.Fatal(err)
	}
	if !trOn.SOCKS5UDPEnabled() {
		t.Fatal("expected SOCKS5UDPEnabled=true")
	}
	c6, _, rep6 := socks5UDPAssociate(t, addrOn, false, socks5AtypIPv6, "::", 0)
	_ = c6.Close()
	if rep6 != socks5RepAtypNotSupported {
		t.Fatalf("IPv6 UDP ASSOCIATE rep = 0x%02x, want 0x%02x", rep6, socks5RepAtypNotSupported)
	}
}

func TestSOCKS5UDPAssociateRelayStoreAndControlConnClose(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	echo, received := startUDPEchoServer(t, "127.0.0.1:0")
	echoAddr := echo.LocalAddr().(*net.UDPAddr)

	tr, err := Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()

	proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
		Addr:      "127.0.0.1:0",
		EnableUDP: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	ctrl, relayAddr, rep := socks5UDPAssociate(t, proxyAddr, true, socks5AtypIPv4, "0.0.0.0", 0)
	if rep != socks5RepSuccess {
		t.Fatalf("UDP ASSOCIATE rep = 0x%02x, want 0x00", rep)
	}

	cliUDP, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
	if err != nil {
		t.Fatal(err)
	}
	defer cliUDP.Close()

	// 1. Send a FRAG != 0 datagram first: must be dropped silently (no fragmentation reassembly).
	fragPkt := makeClientUDPPacketIPv4(echoAddr.IP, echoAddr.Port, 0x01, []byte("fragment-must-drop"))
	if _, err := cliUDP.WriteToUDP(fragPkt, relayAddr); err != nil {
		t.Fatal(err)
	}

	// 2. Send a valid IPv4 datagram and verify echoed reply.
	msg1 := []byte("hello-socks5-udp-ipv4")
	if _, err := cliUDP.WriteToUDP(makeClientUDPPacketIPv4(echoAddr.IP, echoAddr.Port, 0x00, msg1), relayAddr); err != nil {
		t.Fatal(err)
	}
	_ = cliUDP.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 4096)
	n, _, err := cliUDP.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("read udp reply 1: %v", err)
	}
	_, repHost, repPort, repPayload, err := parseSOCKS5UDPHeader(buf[:n])
	if err != nil {
		t.Fatalf("parse reply 1 header: %v", err)
	}
	want1 := append([]byte("UDP-ECHO:"), msg1...)
	if repHost != "127.0.0.1" || repPort != echoAddr.Port || !bytes.Equal(repPayload, want1) {
		t.Fatalf("reply 1 = (%s:%d, %q), want (127.0.0.1:%d, %q)", repHost, repPort, repPayload, echoAddr.Port, want1)
	}

	// 3. Send a valid domain-addressed datagram ("localhost") and verify echoed reply.
	msg2 := []byte("hello-socks5-udp-domain")
	if _, err := cliUDP.WriteToUDP(makeClientUDPPacketDomain("localhost", echoAddr.Port, msg2), relayAddr); err != nil {
		t.Fatal(err)
	}
	_ = cliUDP.SetReadDeadline(time.Now().Add(2 * time.Second))
	n, _, err = cliUDP.ReadFromUDP(buf)
	if err != nil {
		t.Fatalf("read udp reply 2: %v", err)
	}
	_, _, _, repPayload2, err := parseSOCKS5UDPHeader(buf[:n])
	if err != nil {
		t.Fatalf("parse reply 2 header: %v", err)
	}
	want2 := append([]byte("UDP-ECHO:"), msg2...)
	if !bytes.Equal(repPayload2, want2) {
		t.Fatalf("reply 2 = %q, want %q", repPayload2, want2)
	}

	// Only the 2 valid datagrams reached upstream (fragmented datagram was dropped).
	if got := received.Load(); got != 2 {
		t.Fatalf("upstream received %d datagrams, want 2", got)
	}

	// Verify 4 SQLite raw_udp_datagrams rows (2 c2s + 2 s2c), same association_id, 0 HTTP exchanges.
	rows := waitForUDPDatagrams(t, tr, 4)
	if len(rows) != 4 {
		t.Fatalf("want 4 raw UDP datagram rows, got %d", len(rows))
	}
	assocID := rows[0].AssociationID
	if !strings.HasPrefix(assocID, "udpa-") {
		t.Fatalf("unexpected association_id %q", assocID)
	}
	var c2sCount, s2cCount int
	for _, r := range rows {
		if r.AssociationID != assocID || r.Protocol != "udp" || r.Port != echoAddr.Port || r.Timestamp <= 0 {
			t.Fatalf("unexpected row metadata: %+v", r)
		}
		switch r.Direction {
		case "c2s":
			c2sCount++
		case "s2c":
			s2cCount++
		default:
			t.Fatalf("unexpected direction %q", r.Direction)
		}
	}
	if c2sCount != 2 || s2cCount != 2 {
		t.Fatalf("direction counts = (c2s=%d, s2c=%d), want (2, 2)", c2sCount, s2cCount)
	}
	var httpRows int
	if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM exchanges`).Scan(&httpRows); err != nil || httpRows != 0 {
		t.Fatalf("HTTP exchanges rows = (%d, %v), want 0", httpRows, err)
	}

	// 4. Closing the TCP control connection must tear down the UDP association.
	// The close is processed asynchronously by the association goroutine, so a
	// single immediate probe races it: probe until a datagram is no longer
	// forwarded, then assert the relay is closed.
	_ = ctrl.Close()
	deadline := time.Now().Add(2 * time.Second)
	closed := false
	for time.Now().Before(deadline) {
		before := received.Load()
		_, _ = cliUDP.WriteToUDP(makeClientUDPPacketIPv4(echoAddr.IP, echoAddr.Port, 0x00, []byte("after-close")), relayAddr)
		time.Sleep(50 * time.Millisecond)
		if received.Load() == before {
			closed = true
			break
		}
	}
	if !closed {
		t.Fatal("UDP association still forwards datagrams 2s after the TCP control connection closed")
	}
}

func TestSOCKS5UDPPolicyPerDestinationTargetGateAndGovernor(t *testing.T) {
	t.Run("target_gate_drops_denied_destination_without_passthrough", func(t *testing.T) {
		prev := egress.CurrentProfile()
		t.Cleanup(func() { egress.SetProfile(prev) })
		egress.SetProfile(egress.Profile{Name: "off"})

		deniedEcho, deniedCount := startUDPEchoServer(t, "127.0.0.1:0")
		allowedEcho, allowedCount := startUDPEchoServer(t, "127.0.0.1:0")
		deniedAddr := deniedEcho.LocalAddr().(*net.UDPAddr)
		allowedAddr := allowedEcho.LocalAddr().(*net.UDPAddr)

		tr, err := Open(t.TempDir(), "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer tr.Close()

		deniedKey := net.JoinHostPort(deniedAddr.IP.String(), strconv.Itoa(deniedAddr.Port))
		proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
			Addr:      "127.0.0.1:0",
			EnableUDP: true,
			ResolveUDP4: func(ctx context.Context, addr string) (*net.UDPAddr, error) {
				if addr == deniedKey {
					return nil, errors.New("blocked by target gate")
				}
				return net.ResolveUDPAddr("udp4", addr)
			},
		})
		if err != nil {
			t.Fatal(err)
		}

		ctrl, relayAddr, rep := socks5UDPAssociate(t, proxyAddr, false, socks5AtypIPv4, "0.0.0.0", 0)
		if rep != socks5RepSuccess {
			t.Fatalf("rep = 0x%02x", rep)
		}
		defer ctrl.Close()

		cliUDP, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
		if err != nil {
			t.Fatal(err)
		}
		defer cliUDP.Close()

		// Datagram to denied destination must be dropped cleanly.
		_, _ = cliUDP.WriteToUDP(makeClientUDPPacketIPv4(deniedAddr.IP, deniedAddr.Port, 0x00, []byte("denied")), relayAddr)
		// Subsequent datagram to allowed destination on the SAME association succeeds.
		_, _ = cliUDP.WriteToUDP(makeClientUDPPacketIPv4(allowedAddr.IP, allowedAddr.Port, 0x00, []byte("allowed")), relayAddr)

		_ = cliUDP.SetReadDeadline(time.Now().Add(2 * time.Second))
		buf := make([]byte, 2048)
		n, _, err := cliUDP.ReadFromUDP(buf)
		if err != nil {
			t.Fatalf("allowed destination reply failed: %v", err)
		}
		_, _, gotPort, gotPayload, err := parseSOCKS5UDPHeader(buf[:n])
		if err != nil || gotPort != allowedAddr.Port || string(gotPayload) != "UDP-ECHO:allowed" {
			t.Fatalf("unexpected reply: port=%d payload=%q err=%v", gotPort, gotPayload, err)
		}

		if deniedCount.Load() != 0 {
			t.Fatalf("denied target received %d datagrams, want 0", deniedCount.Load())
		}
		if allowedCount.Load() != 1 {
			t.Fatalf("allowed target received %d datagrams, want 1", allowedCount.Load())
		}

		rows := waitForUDPDatagrams(t, tr, 2)
		for _, r := range rows {
			if r.Port == deniedAddr.Port {
				t.Fatalf("denied destination recorded in store: %+v", r)
			}
		}
	})

	t.Run("pinned_udp_resolver_fails_closed_without_interceptor", func(t *testing.T) {
		prev := egress.CurrentProfile()
		t.Cleanup(func() { egress.SetProfile(prev) })
		egress.SetProfile(egress.Profile{Name: "off"})

		echo, count := startUDPEchoServer(t, "127.0.0.1:0")
		echoAddr := echo.LocalAddr().(*net.UDPAddr)

		tr, err := Open(t.TempDir(), "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer tr.Close()

		proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
			Addr:      "127.0.0.1:0",
			EnableUDP: true,
			BaseContext: func() context.Context {
				return intercept.WithTargetScope(context.Background(), intercept.TargetScope{
					TaskID:  "77",
					Enabled: func() bool { return true },
				})
			},
			ResolveUDP4: intercept.PinnedUDP4Resolver("socks5-udp", true),
		})
		if err != nil {
			t.Fatal(err)
		}

		ctrl, relayAddr, rep := socks5UDPAssociate(t, proxyAddr, false, socks5AtypIPv4, "0.0.0.0", 0)
		if rep != socks5RepSuccess {
			t.Fatalf("rep = 0x%02x", rep)
		}
		defer ctrl.Close()

		cliUDP, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
		if err != nil {
			t.Fatal(err)
		}
		defer cliUDP.Close()

		_, _ = cliUDP.WriteToUDP(makeClientUDPPacketIPv4(echoAddr.IP, echoAddr.Port, 0x00, []byte("gated-out")), relayAddr)
		_ = cliUDP.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
		buf := make([]byte, 512)
		if _, _, rerr := cliUDP.ReadFromUDP(buf); rerr == nil {
			t.Fatal("expected gated datagram to be dropped")
		}
		if count.Load() != 0 {
			t.Fatalf("gated target received %d datagrams, want 0", count.Load())
		}
	})

	t.Run("egress_governor_drops_datagram_before_forwarding", func(t *testing.T) {
		prev := egress.CurrentProfile()
		t.Cleanup(func() { egress.SetProfile(prev) })
		egress.SetProfile(egress.Profile{Name: "tight", RPS: 0.01, Burst: 1, MaxPerHost: 1, MaxGlobal: 1})

		echo, count := startUDPEchoServer(t, "127.0.0.1:0")
		echoAddr := echo.LocalAddr().(*net.UDPAddr)

		tr, err := Open(t.TempDir(), "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer tr.Close()

		proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
			Addr:        "127.0.0.1:0",
			EnableUDP:   true,
			PaceTimeout: 40 * time.Millisecond,
		})
		if err != nil {
			t.Fatal(err)
		}

		ctrl, relayAddr, rep := socks5UDPAssociate(t, proxyAddr, true, socks5AtypIPv4, "0.0.0.0", 0)
		if rep != socks5RepSuccess {
			t.Fatalf("rep = 0x%02x", rep)
		}
		defer ctrl.Close()

		cliUDP, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
		if err != nil {
			t.Fatal(err)
		}
		defer cliUDP.Close()

		// 1st datagram consumes the single burst token.
		_, _ = cliUDP.WriteToUDP(makeClientUDPPacketIPv4(echoAddr.IP, echoAddr.Port, 0x00, []byte("first")), relayAddr)
		_ = cliUDP.SetReadDeadline(time.Now().Add(2 * time.Second))
		buf := make([]byte, 512)
		if _, _, err := cliUDP.ReadFromUDP(buf); err != nil {
			t.Fatalf("first datagram failed: %v", err)
		}

		// 2nd datagram exceeds PaceTimeout and is dropped before forwarding.
		_, _ = cliUDP.WriteToUDP(makeClientUDPPacketIPv4(echoAddr.IP, echoAddr.Port, 0x00, []byte("second-paced-out")), relayAddr)
		_ = cliUDP.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
		if _, _, rerr := cliUDP.ReadFromUDP(buf); rerr == nil {
			t.Fatal("expected governor-refused 2nd datagram to be dropped")
		}
		if got := count.Load(); got != 1 {
			t.Fatalf("upstream received %d datagrams, want 1", got)
		}
	})
}

func TestSOCKS5UDPAssociationBoundsAndBlobSpill(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})

	echo, _ := startUDPEchoServer(t, "127.0.0.1:0")
	echoAddr := echo.LocalAddr().(*net.UDPAddr)

	t.Run("blob_spill_and_max_datagrams", func(t *testing.T) {
		tr, err := Open(t.TempDir(), "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer tr.Close()

		proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
			Addr:            "127.0.0.1:0",
			EnableUDP:       true,
			UDPMaxDatagrams: 2, // 1 c2s + 1 s2c
			UDPPreviewBytes: 64,
		})
		if err != nil {
			t.Fatal(err)
		}

		ctrl, relayAddr, rep := socks5UDPAssociate(t, proxyAddr, false, socks5AtypIPv4, "0.0.0.0", 0)
		if rep != socks5RepSuccess {
			t.Fatalf("rep = 0x%02x", rep)
		}
		defer ctrl.Close()

		cliUDP, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
		if err != nil {
			t.Fatal(err)
		}
		defer cliUDP.Close()

		big := bytes.Repeat([]byte("UDPBLOB!"), 64) // 512 bytes > 64 preview
		if _, err := cliUDP.WriteToUDP(makeClientUDPPacketIPv4(echoAddr.IP, echoAddr.Port, 0x00, big), relayAddr); err != nil {
			t.Fatal(err)
		}
		_ = cliUDP.SetReadDeadline(time.Now().Add(2 * time.Second))
		buf := make([]byte, 4096)
		if _, _, err := cliUDP.ReadFromUDP(buf); err != nil {
			t.Fatalf("read reply: %v", err)
		}

		rows := waitForUDPDatagrams(t, tr, 2)
		var c2sRow *RawUDPDatagram
		for i := range rows {
			if rows[i].Direction == "c2s" {
				c2sRow = &rows[i]
			}
		}
		if c2sRow == nil || c2sRow.Size != 512 || len(c2sRow.Preview) != 64 || c2sRow.Blob == "" {
			t.Fatalf("expected 512-byte datagram with 64-byte preview and blob hash, got %+v", c2sRow)
		}
		blobFile := filepath.Join(tr.dir, "_blobs", "sha256", c2sRow.Blob[:2], c2sRow.Blob+".bin")
		blobData, err := os.ReadFile(blobFile)
		if err != nil || !bytes.Equal(blobData, big) {
			t.Fatalf("blob read %s: len=%d err=%v", blobFile, len(blobData), err)
		}
		var refs int
		if err := tr.DB().QueryRow(`SELECT COUNT(*) FROM blob_refs WHERE exchange_id = ?`, c2sRow.ID).Scan(&refs); err != nil || refs != 1 {
			t.Fatalf("blob_refs for %s = (%d, %v), want 1", c2sRow.ID, refs, err)
		}

		// 3rd datagram exceeds UDPMaxDatagrams=2 and closes the association (and TCP control conn).
		_, _ = cliUDP.WriteToUDP(makeClientUDPPacketIPv4(echoAddr.IP, echoAddr.Port, 0x00, []byte("over-limit")), relayAddr)
		_ = ctrl.SetReadDeadline(time.Now().Add(2 * time.Second))
		one := make([]byte, 1)
		if _, rerr := ctrl.Read(one); rerr == nil {
			t.Fatal("expected TCP control conn to close when UDPMaxDatagrams exceeded")
		}
	})

	t.Run("max_bytes_and_idle_timeout", func(t *testing.T) {
		tr, err := Open(t.TempDir(), "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer tr.Close()

		proxyAddr, err := tr.StartSOCKS5(SOCKS5Config{
			Addr:           "127.0.0.1:0",
			EnableUDP:      true,
			UDPMaxBytes:    16,
			UDPIdleTimeout: 150 * time.Millisecond,
		})
		if err != nil {
			t.Fatal(err)
		}

		// Idle timeout closes association without any datagrams.
		ctrlIdle, _, rep := socks5UDPAssociate(t, proxyAddr, false, socks5AtypIPv4, "0.0.0.0", 0)
		if rep != socks5RepSuccess {
			t.Fatalf("idle rep = 0x%02x", rep)
		}
		_ = ctrlIdle.SetReadDeadline(time.Now().Add(2 * time.Second))
		one := make([]byte, 1)
		if _, rerr := ctrlIdle.Read(one); rerr == nil {
			t.Fatal("expected idle UDP association to close after UDPIdleTimeout")
		}
		_ = ctrlIdle.Close()

		// MaxBytes=16 rejects a 32-byte datagram and closes the association.
		ctrlBytes, relayAddr, rep := socks5UDPAssociate(t, proxyAddr, false, socks5AtypIPv4, "0.0.0.0", 0)
		if rep != socks5RepSuccess {
			t.Fatalf("bytes rep = 0x%02x", rep)
		}
		defer ctrlBytes.Close()
		cliUDP, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
		if err != nil {
			t.Fatal(err)
		}
		defer cliUDP.Close()

		_, _ = cliUDP.WriteToUDP(makeClientUDPPacketIPv4(echoAddr.IP, echoAddr.Port, 0x00, bytes.Repeat([]byte("A"), 32)), relayAddr)
		_ = ctrlBytes.SetReadDeadline(time.Now().Add(2 * time.Second))
		if _, rerr := ctrlBytes.Read(one); rerr == nil {
			t.Fatal("expected UDP association to close when UDPMaxBytes exceeded")
		}
	})
}
