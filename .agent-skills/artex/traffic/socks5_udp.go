package traffic

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Autumn-27/artex/egress"
)

var (
	errSOCKS5UDPShortPacket     = errors.New("short SOCKS5 UDP packet")
	errSOCKS5UDPBadReserved     = errors.New("non-zero SOCKS5 UDP RSV field")
	errSOCKS5UDPFragmented      = errors.New("SOCKS5 UDP fragmentation (FRAG != 0) is not supported")
	errSOCKS5UDPUnsupportedAtyp = errors.New("unsupported SOCKS5 UDP address type (IPv4/domain only)")
	errSOCKS5UDPBadDestination  = errors.New("invalid SOCKS5 UDP destination address or port")
)

var fallbackUDPAssocSeq atomic.Int64

// RawUDPCapture holds one forwarded UDP datagram observed on a SOCKS5 UDP
// ASSOCIATE relay. Each datagram is recorded individually as it arrives with
// no fragmentation reassembly.
type RawUDPCapture struct {
	AssociationID string
	Host          string
	Port          int
	Direction     string // "c2s" | "s2c"
	Timestamp     time.Time
	Payload       []byte
}

// parseSOCKS5UDPHeader parses an RFC 1928 §7 UDP request header.
//
//	+----+------+------+----------+----------+----------+
//	|RSV | FRAG | ATYP | DST.ADDR | DST.PORT |   DATA   |
//	+----+------+------+----------+----------+----------+
//	| 2  |  1   |  1   | Variable |    2     | Variable |
//	+----+------+------+----------+----------+----------+
//
// Fragmentation reassembly is intentionally unsupported: any datagram with
// FRAG != 0 returns errSOCKS5UDPFragmented and must be dropped per RFC 1928 §7.
// P4.1c covers IPv4 destinations (ATYP=0x01) and domain names resolved to IPv4
// (ATYP=0x03); IPv6 (ATYP=0x04) is rejected with errSOCKS5UDPUnsupportedAtyp.
func parseSOCKS5UDPHeader(pkt []byte) (atyp byte, host string, port int, payload []byte, err error) {
	if len(pkt) < 4 {
		return 0, "", 0, nil, errSOCKS5UDPShortPacket
	}
	if pkt[0] != 0x00 || pkt[1] != 0x00 {
		return 0, "", 0, nil, errSOCKS5UDPBadReserved
	}
	if pkt[2] != 0x00 {
		return 0, "", 0, nil, errSOCKS5UDPFragmented
	}
	atyp = pkt[3]
	off := 4
	switch atyp {
	case socks5AtypIPv4:
		if len(pkt) < off+4+2 {
			return atyp, "", 0, nil, errSOCKS5UDPShortPacket
		}
		ip := net.IPv4(pkt[off], pkt[off+1], pkt[off+2], pkt[off+3]).To4()
		if ip == nil || ip.IsUnspecified() {
			return atyp, "", 0, nil, errSOCKS5UDPBadDestination
		}
		host = ip.String()
		off += 4
	case socks5AtypDomain:
		if len(pkt) < off+1 {
			return atyp, "", 0, nil, errSOCKS5UDPShortPacket
		}
		domLen := int(pkt[off])
		off++
		if domLen == 0 || len(pkt) < off+domLen+2 {
			return atyp, "", 0, nil, errSOCKS5UDPShortPacket
		}
		host = strings.TrimSpace(string(pkt[off : off+domLen]))
		if host == "" {
			return atyp, "", 0, nil, errSOCKS5UDPBadDestination
		}
		off += domLen
	default:
		return atyp, "", 0, nil, errSOCKS5UDPUnsupportedAtyp
	}

	port = int(binary.BigEndian.Uint16(pkt[off : off+2]))
	off += 2
	if port <= 0 || port > 65535 {
		return atyp, "", 0, nil, errSOCKS5UDPBadDestination
	}
	return atyp, host, port, pkt[off:], nil
}

// buildSOCKS5UDPPacket wraps an IPv4 upstream reply datagram in an RFC 1928 §7
// UDP header (RSV=0x0000, FRAG=0x00, ATYP=0x01).
func buildSOCKS5UDPPacket(srcIP net.IP, srcPort int, payload []byte) ([]byte, error) {
	ip4 := srcIP.To4()
	if ip4 == nil || srcPort <= 0 || srcPort > 65535 {
		return nil, errSOCKS5UDPBadDestination
	}
	out := make([]byte, 10+len(payload))
	out[0] = 0x00
	out[1] = 0x00
	out[2] = 0x00
	out[3] = socks5AtypIPv4
	copy(out[4:8], ip4)
	binary.BigEndian.PutUint16(out[8:10], uint16(srcPort))
	copy(out[10:], payload)
	return out, nil
}

func (s *socks5Server) newUDPAssociationID(started time.Time) string {
	var n int64
	if s.t != nil {
		n = s.t.seq.Add(1)
	} else {
		n = fallbackUDPAssocSeq.Add(1)
	}
	return fmt.Sprintf("udpa-%d-%04d", started.UnixMilli(), n%10000)
}

func (s *socks5Server) handleUDPAssociate(client net.Conn, reqAtyp byte, reqHost string, reqPort int) {
	// 1. Enforce max concurrent sessions before allocating UDP sockets.
	select {
	case s.sem <- struct{}{}:
		defer func() { <-s.sem }()
	default:
		_ = writeSOCKS5Reply(client, socks5RepGeneralFailure, nil)
		return
	}

	// 2. Bind client-facing IPv4 UDP relay socket on the TCP local interface IP.
	bindIP := net.IPv4(127, 0, 0, 1)
	if ltcp, ok := client.LocalAddr().(*net.TCPAddr); ok && ltcp != nil {
		if ip4 := ltcp.IP.To4(); ip4 != nil && !ip4.IsUnspecified() {
			bindIP = ip4
		}
	}
	relayConn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: bindIP, Port: 0})
	if err != nil {
		_ = writeSOCKS5Reply(client, socks5RepGeneralFailure, nil)
		return
	}
	if !s.trackConn(relayConn) {
		_ = relayConn.Close()
		_ = writeSOCKS5Reply(client, socks5RepGeneralFailure, nil)
		return
	}
	defer s.untrackConn(relayConn)
	defer relayConn.Close()

	// 3. Bind upstream IPv4 UDP socket for forwarding to verified targets.
	upstreamConn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
	if err != nil {
		_ = writeSOCKS5Reply(client, socks5RepGeneralFailure, nil)
		return
	}
	if !s.trackConn(upstreamConn) {
		_ = upstreamConn.Close()
		_ = writeSOCKS5Reply(client, socks5RepGeneralFailure, nil)
		return
	}
	defer s.untrackConn(upstreamConn)
	defer upstreamConn.Close()

	// Clear handshake deadline and send BND.ADDR + BND.PORT on TCP control conn.
	_ = client.SetDeadline(time.Time{})
	relayAddr := relayConn.LocalAddr().(*net.UDPAddr)
	if err := writeSOCKS5Reply(client, socks5RepSuccess, relayAddr); err != nil {
		return
	}

	// Determine allowed client UDP source IP/port.
	var expectedClientIP net.IP
	expectedClientPort := 0
	if reqAtyp == socks5AtypIPv4 {
		if ip := net.ParseIP(reqHost).To4(); ip != nil && !ip.IsUnspecified() {
			expectedClientIP = ip
		}
		if reqPort > 0 && reqPort <= 65535 {
			expectedClientPort = reqPort
		}
	}
	if expectedClientIP == nil {
		if rtcp, ok := client.RemoteAddr().(*net.TCPAddr); ok && rtcp != nil {
			expectedClientIP = rtcp.IP.To4()
		}
	}

	assocID := s.newUDPAssociationID(time.Now().UTC())

	baseCtx := context.Background()
	if s.cfg.BaseContext != nil {
		if ctx := s.cfg.BaseContext(); ctx != nil {
			baseCtx = ctx
		}
	}
	assocCtx, assocCancel := context.WithCancel(baseCtx)
	var closeOnce sync.Once
	closeAssoc := func() {
		closeOnce.Do(func() {
			assocCancel()
			_ = relayConn.Close()
			_ = upstreamConn.Close()
			_ = client.Close()
		})
	}
	defer closeAssoc()

	// Close association when server stops.
	stopWatchDone := make(chan struct{})
	go func() {
		select {
		case <-s.stop:
			closeAssoc()
		case <-assocCtx.Done():
		}
		close(stopWatchDone)
	}()
	defer func() { <-stopWatchDone }()

	// Idle timer bounds inactive associations.
	var idleTimer *time.Timer
	if s.cfg.UDPIdleTimeout > 0 {
		idleTimer = time.AfterFunc(s.cfg.UDPIdleTimeout, closeAssoc)
		defer idleTimer.Stop()
	}
	touchIdle := func() {
		if idleTimer != nil {
			idleTimer.Reset(s.cfg.UDPIdleTimeout)
		}
	}

	var (
		assocMu       sync.Mutex
		clientUDPAddr *net.UDPAddr
		allowedPeers  = map[string]string{} // resolved "ip:port" -> logical dst host
		datagramCount int
		byteCount     int64
	)

	// consumeBudget reserves one datagram + payload length against the
	// association's bounds. Returns false if either limit would be exceeded.
	consumeBudget := func(payloadLen int) bool {
		assocMu.Lock()
		defer assocMu.Unlock()
		if datagramCount+1 > s.cfg.UDPMaxDatagrams || byteCount+int64(payloadLen) > s.cfg.UDPMaxBytes {
			return false
		}
		datagramCount++
		byteCount += int64(payloadLen)
		return true
	}

	var wg sync.WaitGroup
	wg.Add(3)

	// Goroutine 1: tie association lifetime strictly to the TCP control connection.
	go func() {
		defer wg.Done()
		var discard [64]byte
		for {
			if _, err := client.Read(discard[:]); err != nil {
				closeAssoc()
				return
			}
		}
	}()

	// Goroutine 2: client -> upstream UDP relay (c2s).
	go func() {
		defer wg.Done()
		buf := make([]byte, DefaultSOCKS5UDPMaxDatagramSize)
		for {
			n, from, err := relayConn.ReadFromUDP(buf)
			if err != nil {
				return
			}
			if !s.acceptClientUDPSource(from, expectedClientIP, expectedClientPort, &assocMu, &clientUDPAddr) {
				continue
			}

			_, dstHost, dstPort, payload, err := parseSOCKS5UDPHeader(buf[:n])
			if err != nil {
				// Malformed header, FRAG != 0, or unsupported ATYP: drop datagram.
				continue
			}

			// Copy payload before forwarding/recording so buf can be reused safely.
			payloadCopy := append([]byte(nil), payload...)
			targetAddr := net.JoinHostPort(dstHost, strconv.Itoa(dstPort))

			// Enforce per-datagram destination policy (target gate + egress governor)
			// BEFORE forwarding. A denied destination drops that datagram cleanly.
			dstUDPAddr, err := s.resolveAndPaceUDP4(assocCtx, targetAddr)
			if err != nil {
				continue
			}

			if !consumeBudget(len(payloadCopy)) {
				closeAssoc()
				return
			}

			assocMu.Lock()
			allowedPeers[dstUDPAddr.String()] = dstHost
			assocMu.Unlock()

			if _, err := upstreamConn.WriteToUDP(payloadCopy, dstUDPAddr); err != nil {
				if assocCtx.Err() != nil {
					return
				}
				continue
			}
			touchIdle()
			s.recordUDPCapture(RawUDPCapture{
				AssociationID: assocID,
				Host:          dstHost,
				Port:          dstPort,
				Direction:     "c2s",
				Timestamp:     time.Now().UTC(),
				Payload:       payloadCopy,
			})
		}
	}()

	// Goroutine 3: upstream -> client UDP relay (s2c).
	go func() {
		defer wg.Done()
		buf := make([]byte, DefaultSOCKS5UDPMaxDatagramSize)
		for {
			n, from, err := upstreamConn.ReadFromUDP(buf)
			if err != nil {
				return
			}
			assocMu.Lock()
			origHost, allowed := allowedPeers[from.String()]
			cli := clientUDPAddr
			assocMu.Unlock()
			if !allowed || cli == nil {
				// Drop unsolicited UDP packets from destinations this association
				// has not sent an allowed datagram to.
				continue
			}

			payloadCopy := append([]byte(nil), buf[:n]...)
			if !consumeBudget(len(payloadCopy)) {
				closeAssoc()
				return
			}

			wrapped, err := buildSOCKS5UDPPacket(from.IP, from.Port, payloadCopy)
			if err != nil {
				continue
			}
			if _, err := relayConn.WriteToUDP(wrapped, cli); err != nil {
				if assocCtx.Err() != nil {
					return
				}
				continue
			}
			touchIdle()
			s.recordUDPCapture(RawUDPCapture{
				AssociationID: assocID,
				Host:          origHost,
				Port:          from.Port,
				Direction:     "s2c",
				Timestamp:     time.Now().UTC(),
				Payload:       payloadCopy,
			})
		}
	}()

	wg.Wait()
}

func (s *socks5Server) acceptClientUDPSource(from *net.UDPAddr, expectedIP net.IP, expectedPort int, mu *sync.Mutex, pinned **net.UDPAddr) bool {
	if from == nil || from.IP == nil {
		return false
	}
	fromIP4 := from.IP.To4()
	if fromIP4 == nil {
		return false
	}
	if expectedIP != nil && !fromIP4.Equal(expectedIP) {
		return false
	}
	if expectedPort > 0 && from.Port != expectedPort {
		return false
	}
	mu.Lock()
	defer mu.Unlock()
	if *pinned == nil {
		*pinned = &net.UDPAddr{IP: append(net.IP(nil), fromIP4...), Port: from.Port}
		return true
	}
	return (*pinned).IP.Equal(fromIP4) && (*pinned).Port == from.Port
}

func (s *socks5Server) resolveAndPaceUDP4(assocCtx context.Context, targetAddr string) (*net.UDPAddr, error) {
	// 1. Target gate + fresh DNS resolution (IPv4).
	resCtx, resCancel := context.WithTimeout(assocCtx, s.cfg.DialTimeout)
	defer resCancel()
	dstAddr, err := s.cfg.ResolveUDP4(resCtx, targetAddr)
	if err != nil {
		return nil, err
	}
	if dstAddr == nil || dstAddr.IP == nil || dstAddr.IP.To4() == nil || dstAddr.Port <= 0 {
		return nil, errSOCKS5UDPBadDestination
	}

	// 2. Egress governor (same egress.Do path as HTTP / SOCKS5 TCP / transparent TCP).
	govCtx, govCancel := context.WithTimeout(assocCtx, s.cfg.PaceTimeout)
	defer govCancel()
	targetURL := &url.URL{Scheme: "udp", Host: targetAddr}
	_, err = egress.Do(egress.Current(), govCtx, targetURL, func() (struct{}, error) {
		return struct{}{}, nil
	})
	if err != nil {
		return nil, err
	}
	return dstAddr, nil
}

func (s *socks5Server) recordUDPCapture(rec RawUDPCapture) {
	if s.cfg.OnRecordUDP != nil {
		s.cfg.OnRecordUDP(rec)
		return
	}
	if s.t != nil && s.t.db != nil {
		if _, err := s.t.RecordRawUDPDatagram(rec, s.cfg.UDPPreviewBytes); err != nil {
			slog.Error("[traffic/socks5-udp] failed to record UDP datagram", "assoc", rec.AssociationID, "dst_host", rec.Host, "dst_port", rec.Port, "err", err)
		}
	}
}
