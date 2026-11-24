package traffic

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Autumn-27/artex/egress"
)

// Opt-in environment flags for the Linux transparent TCP inbound listener (P4.1b).
// Off by default: when neither is set, no transparent listener is started, no
// firewall rules are touched, and the HTTP proxy is unchanged.
const (
	// TransparentTCPEnabledEnv turns on the Linux transparent TCP listener on
	// DefaultTransparentTCPAddr when set to a truthy value (1/true/yes/on).
	TransparentTCPEnabledEnv = "ARTEX_TRANSPARENT_TCP_ENABLED"
	// TransparentTCPAddrEnv optionally overrides the IPv4 bind address
	// (default 127.0.0.1:1081). Setting a non-empty address also enables the
	// listener unless ARTEX_TRANSPARENT_TCP_ENABLED is explicitly false/0/off/no.
	TransparentTCPAddrEnv = "ARTEX_TRANSPARENT_TCP_ADDR"

	DefaultTransparentTCPAddr = "127.0.0.1:1081"

	// afInet matches POSIX/Linux AF_INET (IPv4) in struct sockaddr_in.sin_family.
	afInet = 2
	// sockaddrInSize is sizeof(struct sockaddr_in) on Linux.
	sockaddrInSize = 16
)

var (
	// ErrTransparentTCPNotLinux is returned when transparent TCP inbound is
	// explicitly enabled on a non-Linux OS.
	ErrTransparentTCPNotLinux = errors.New("transparent TCP inbound (SO_ORIGINAL_DST) is only supported on Linux")
	// ErrTransparentTCPIPv6Unsupported is returned when an IPv6 bind address or
	// IPv6 redirected socket is encountered (P4.1b covers IPv4 only).
	ErrTransparentTCPIPv6Unsupported = errors.New("transparent TCP inbound currently supports IPv4 only; IPv6 is not covered")
)

// TransparentTCPConfig configures the opt-in Linux transparent TCP listener
// fed by iptables/nftables REDIRECT rules.
type TransparentTCPConfig struct {
	// Addr is the IPv4 TCP bind address (default DefaultTransparentTCPAddr).
	Addr string
	// MaxConcurrent bounds simultaneous active transparent streams (default 64).
	MaxConcurrent int
	// MaxBytesPerDir caps captured payload bytes per direction (default 4 MiB).
	MaxBytesPerDir int64
	// PreviewBytes caps inline SQLite preview per direction before blob spill (default 8 KiB).
	PreviewBytes int
	// IdleTimeout bounds per-direction read/write inactivity during relay (default 2m).
	IdleTimeout time.Duration
	// HandshakeTimeout bounds original-destination recovery before dialing (default 10s).
	HandshakeTimeout time.Duration
	// DialTimeout bounds outbound TCP connect attempts (default 30s).
	DialTimeout time.Duration
	// PaceTimeout bounds waiting on the egress governor before refusing (default 30s).
	PaceTimeout time.Duration
	// DialContext dials the recovered original destination. In production the
	// server wires intercept.Interceptor.DialSOCKS5 so asset block rules and
	// target pinning are enforced before any socket is opened.
	DialContext func(ctx context.Context, network, addr string) (net.Conn, error)
	// BaseContext optionally supplies a parent context for outbound dials.
	BaseContext func() context.Context

	// origDst overrides kernel SO_ORIGINAL_DST lookup in unit tests.
	origDst func(conn net.Conn) (net.IP, int, error)
}

// TransparentTCPConfigFromEnv parses ARTEX_TRANSPARENT_TCP_ENABLED and
// ARTEX_TRANSPARENT_TCP_ADDR. Returns (cfg, false) when disabled (default).
func TransparentTCPConfigFromEnv() (TransparentTCPConfig, bool) {
	rawEnabled := strings.ToLower(strings.TrimSpace(os.Getenv(TransparentTCPEnabledEnv)))
	rawAddr := strings.TrimSpace(os.Getenv(TransparentTCPAddrEnv))
	switch rawEnabled {
	case "0", "false", "no", "off":
		return TransparentTCPConfig{}, false
	case "1", "true", "yes", "on":
		addr := rawAddr
		if addr == "" {
			addr = DefaultTransparentTCPAddr
		}
		return TransparentTCPConfig{Addr: addr}, true
	case "":
		if rawAddr == "" {
			return TransparentTCPConfig{}, false
		}
		return TransparentTCPConfig{Addr: rawAddr}, true
	default:
		slog.Warn("[traffic] transparent TCP env var is not a boolean, leaving disabled", "env", TransparentTCPEnabledEnv, "value", rawEnabled)
		return TransparentTCPConfig{}, false
	}
}

func (c TransparentTCPConfig) withDefaults() TransparentTCPConfig {
	if strings.TrimSpace(c.Addr) == "" {
		c.Addr = DefaultTransparentTCPAddr
	}
	if c.MaxConcurrent <= 0 {
		c.MaxConcurrent = DefaultSOCKS5MaxConcurrent
	}
	if c.MaxBytesPerDir <= 0 {
		c.MaxBytesPerDir = DefaultSOCKS5MaxBytesPerDir
	}
	if c.PreviewBytes <= 0 {
		c.PreviewBytes = DefaultSOCKS5PreviewBytes
	}
	if c.IdleTimeout <= 0 {
		c.IdleTimeout = DefaultSOCKS5IdleTimeout
	}
	if c.HandshakeTimeout <= 0 {
		c.HandshakeTimeout = DefaultSOCKS5HandshakeTimeout
	}
	if c.DialTimeout <= 0 {
		c.DialTimeout = DefaultSOCKS5DialTimeout
	}
	if c.PaceTimeout <= 0 {
		c.PaceTimeout = DefaultSOCKS5PaceTimeout
	}
	if c.DialContext == nil {
		var d net.Dialer
		c.DialContext = d.DialContext
	}
	if c.origDst == nil {
		c.origDst = originalDstIPv4
	}
	return c
}

// parseOriginalDstIPv4 parses a Linux struct sockaddr_in returned by
// getsockopt(SOL_IP, SO_ORIGINAL_DST) into an IPv4 address and TCP port.
//
// Layout on Linux (16 bytes):
//   - bytes 0..1: sin_family (host-endian uint16, must be AF_INET = 2)
//   - bytes 2..3: sin_port   (network/big-endian uint16, 1..65535)
//   - bytes 4..7: sin_addr   (4-byte IPv4 address, must not be 0.0.0.0)
//   - bytes 8..15: sin_zero
func parseOriginalDstIPv4(raw []byte) (net.IP, int, error) {
	if len(raw) < sockaddrInSize {
		return nil, 0, fmt.Errorf("short SO_ORIGINAL_DST buffer: got %d bytes, want %d", len(raw), sockaddrInSize)
	}
	family := binary.NativeEndian.Uint16(raw[0:2])
	if family != afInet {
		if family == 10 { // Linux AF_INET6
			return nil, 0, ErrTransparentTCPIPv6Unsupported
		}
		return nil, 0, fmt.Errorf("unsupported SO_ORIGINAL_DST address family %d (want AF_INET=%d)", family, afInet)
	}
	port := int(binary.BigEndian.Uint16(raw[2:4]))
	if port <= 0 || port > 65535 {
		return nil, 0, fmt.Errorf("invalid SO_ORIGINAL_DST port %d", port)
	}
	ip := net.IPv4(raw[4], raw[5], raw[6], raw[7]).To4()
	if ip == nil || ip.IsUnspecified() {
		return nil, 0, fmt.Errorf("invalid SO_ORIGINAL_DST IPv4 address %v", ip)
	}
	return ip, port, nil
}

// isSelfRedirect reports whether (origIP, origPort) points back at the
// transparent listener itself (which happens when a client connects directly
// to the transparent port without an iptables/nftables REDIRECT rule).
func isSelfRedirect(origIP net.IP, origPort int, localAddr net.Addr) bool {
	if origIP == nil || origPort <= 0 || localAddr == nil {
		return false
	}
	localTCP, ok := localAddr.(*net.TCPAddr)
	if !ok || localTCP == nil || localTCP.Port != origPort {
		return false
	}
	if localTCP.IP == nil || localTCP.IP.IsUnspecified() {
		return true
	}
	return origIP.Equal(localTCP.IP)
}

type transparentServer struct {
	t   *Traffic
	cfg TransparentTCPConfig
	ln  net.Listener
	sem chan struct{}

	stopOnce sync.Once
	stop     chan struct{}
	wg       sync.WaitGroup

	mu     sync.Mutex
	active map[net.Conn]struct{}
}

// StartTransparentTCP binds and starts the opt-in Linux transparent TCP
// inbound listener on t. Returns the bound listener address. On non-Linux OSes
// it returns ErrTransparentTCPNotLinux unless a test origDst hook is supplied.
func (t *Traffic) StartTransparentTCP(cfg TransparentTCPConfig) (string, error) {
	if !transparentTCPSupported && cfg.origDst == nil {
		return "", ErrTransparentTCPNotLinux
	}
	cfg = cfg.withDefaults()
	host, _, err := net.SplitHostPort(cfg.Addr)
	if err != nil {
		return "", fmt.Errorf("invalid transparent TCP listen address %q: %w", cfg.Addr, err)
	}
	if ip := net.ParseIP(strings.Trim(host, "[]")); ip != nil && ip.To4() == nil {
		return "", ErrTransparentTCPIPv6Unsupported
	}
	ln, err := net.Listen("tcp4", cfg.Addr)
	if err != nil {
		return "", fmt.Errorf("listen transparent TCP on %s: %w", cfg.Addr, err)
	}
	srv := &transparentServer{
		t:      t,
		cfg:    cfg,
		ln:     ln,
		sem:    make(chan struct{}, cfg.MaxConcurrent),
		stop:   make(chan struct{}),
		active: make(map[net.Conn]struct{}),
	}

	t.transparentMu.Lock()
	if t.transparent != nil {
		t.transparentMu.Unlock()
		_ = ln.Close()
		return "", fmt.Errorf("transparent TCP listener already running on %s", t.transparent.ln.Addr().String())
	}
	t.transparent = srv
	t.transparentMu.Unlock()

	srv.wg.Add(1)
	go srv.serve()
	return ln.Addr().String(), nil
}

// TransparentTCPAddr returns the bound transparent TCP listener address, or ""
// when disabled.
func (t *Traffic) TransparentTCPAddr() string {
	t.transparentMu.Lock()
	defer t.transparentMu.Unlock()
	if t.transparent == nil || t.transparent.ln == nil {
		return ""
	}
	return t.transparent.ln.Addr().String()
}

func (s *transparentServer) Close() error {
	var err error
	s.stopOnce.Do(func() {
		close(s.stop)
		err = s.ln.Close()
		s.mu.Lock()
		for c := range s.active {
			_ = c.Close()
		}
		s.mu.Unlock()
	})
	s.wg.Wait()
	return err
}

func (s *transparentServer) stopping() bool {
	select {
	case <-s.stop:
		return true
	default:
		return false
	}
}

func (s *transparentServer) trackConn(c net.Conn) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stopping() {
		return false
	}
	s.active[c] = struct{}{}
	return true
}

func (s *transparentServer) untrackConn(c net.Conn) {
	s.mu.Lock()
	delete(s.active, c)
	s.mu.Unlock()
}

func (s *transparentServer) serve() {
	defer s.wg.Done()
	for {
		conn, err := s.ln.Accept()
		if err != nil {
			if s.stopping() || errors.Is(err, net.ErrClosed) {
				return
			}
			var ne net.Error
			if errors.As(err, &ne) && ne.Timeout() {
				continue
			}
			slog.Error("[traffic/transparent] transparent proxy accept error", "err", err)
			return
		}
		if !s.trackConn(conn) {
			_ = conn.Close()
			return
		}
		s.wg.Add(1)
		go func(c net.Conn) {
			defer s.wg.Done()
			defer s.untrackConn(c)
			defer c.Close()
			s.handleConn(c)
		}(conn)
	}
}

func (s *transparentServer) handleConn(client net.Conn) {
	// 1. Recover original IPv4 destination under HandshakeTimeout.
	_ = client.SetDeadline(time.Now().Add(s.cfg.HandshakeTimeout))

	origIP, origPort, err := s.recoverOriginalDst(client)
	if err != nil {
		return
	}
	if isSelfRedirect(origIP, origPort, s.ln.Addr()) {
		return
	}

	// 2. Enforce max concurrent streams before touching policy or dialing.
	select {
	case s.sem <- struct{}{}:
		defer func() { <-s.sem }()
	default:
		return
	}

	// 3. Apply the same egress governor and target gate before dialing.
	host := origIP.String()
	targetAddr := net.JoinHostPort(host, strconv.Itoa(origPort))
	upstream, err := s.dialTarget(targetAddr)
	if err != nil {
		return
	}
	if !s.trackConn(upstream) {
		_ = upstream.Close()
		return
	}
	defer s.untrackConn(upstream)
	defer upstream.Close()

	// Clear handshake deadline before starting the relay.
	_ = client.SetDeadline(time.Time{})

	// 4. Bidirectional half-close-aware relay with idle timeout and bounded capture.
	startedAt := time.Now().UTC()
	c2sCap := &limitedCapture{max: s.cfg.MaxBytesPerDir}
	s2cCap := &limitedCapture{max: s.cfg.MaxBytesPerDir}

	var relayWG sync.WaitGroup
	relayWG.Add(2)
	go func() {
		defer relayWG.Done()
		relayHalf(upstream, client, c2sCap, s.cfg.IdleTimeout)
		closeWrite(upstream)
	}()
	go func() {
		defer relayWG.Done()
		relayHalf(client, upstream, s2cCap, s.cfg.IdleTimeout)
		closeWrite(client)
	}()
	relayWG.Wait()
	endedAt := time.Now().UTC()

	// 5. Record one raw_tcp_streams row in SQLite (never an HTTP exchanges row).
	if s.t != nil {
		if _, err := s.t.RecordRawTCPStream(RawTCPCapture{
			Host:      host,
			Port:      origPort,
			StartedAt: startedAt,
			EndedAt:   endedAt,
			C2SBytes:  c2sCap.total,
			S2CBytes:  s2cCap.total,
			Truncated: c2sCap.truncated || s2cCap.truncated,
			C2SData:   c2sCap.buf,
			S2CData:   s2cCap.buf,
		}, s.cfg.PreviewBytes); err != nil {
			slog.Error("[traffic/transparent] failed to record raw TCP stream", "target", targetAddr, "err", err)
		}
	}
}

func (s *transparentServer) recoverOriginalDst(client net.Conn) (net.IP, int, error) {
	type res struct {
		ip   net.IP
		port int
		err  error
	}
	ch := make(chan res, 1)
	go func() {
		ip, port, err := s.cfg.origDst(client)
		ch <- res{ip: ip, port: port, err: err}
	}()
	timer := time.NewTimer(s.cfg.HandshakeTimeout)
	defer timer.Stop()
	select {
	case r := <-ch:
		if r.err != nil {
			return nil, 0, r.err
		}
		if r.ip == nil || r.ip.To4() == nil {
			return nil, 0, ErrTransparentTCPIPv6Unsupported
		}
		if r.port <= 0 || r.port > 65535 {
			return nil, 0, fmt.Errorf("invalid original destination port %d", r.port)
		}
		if r.ip.To4().IsUnspecified() {
			return nil, 0, fmt.Errorf("unspecified original destination IP")
		}
		return r.ip.To4(), r.port, nil
	case <-timer.C:
		return nil, 0, context.DeadlineExceeded
	case <-s.stop:
		return nil, 0, net.ErrClosed
	}
}

func (s *transparentServer) dialTarget(targetAddr string) (net.Conn, error) {
	baseCtx := context.Background()
	if s.cfg.BaseContext != nil {
		if ctx := s.cfg.BaseContext(); ctx != nil {
			baseCtx = ctx
		}
	}
	stopCtx, stopCancel := context.WithCancel(baseCtx)
	defer stopCancel()
	go func() {
		select {
		case <-s.stop:
			stopCancel()
		case <-stopCtx.Done():
		}
	}()

	// Reuse the exact same egress governor (egress.Do) and target gate dialer
	// (intercept.PinnedDialer / Interceptor.DialSOCKS5) used by HTTP and SOCKS5.
	govCtx, govCancel := context.WithTimeout(stopCtx, s.cfg.PaceTimeout)
	defer govCancel()

	targetURL := &url.URL{Scheme: "tcp", Host: targetAddr}
	return egress.Do(egress.Current(), govCtx, targetURL, func() (net.Conn, error) {
		dialCtx, dialCancel := context.WithTimeout(stopCtx, s.cfg.DialTimeout)
		defer dialCancel()
		return s.cfg.DialContext(dialCtx, "tcp", targetAddr)
	})
}
