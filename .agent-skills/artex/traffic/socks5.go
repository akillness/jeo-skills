package traffic

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/Autumn-27/artex/egress"
	"github.com/Autumn-27/artex/intercept"
)

// Opt-in environment flags for the SOCKS5 inbound listener (P4.1a).
// Off by default: when neither is set, no SOCKS5 listener is started and the
// HTTP recording proxy is unchanged.
const (
	// SOCKS5EnabledEnv turns on the SOCKS5 CONNECT listener on DefaultSOCKS5Addr
	// (loopback) when set to 1/true/on/yes.
	SOCKS5EnabledEnv = "ARTEX_SOCKS5_ENABLED"
	// SOCKS5AddrEnv optionally overrides the bind address (default 127.0.0.1:1080).
	// Setting a non-empty address also enables the listener unless
	// ARTEX_SOCKS5_ENABLED is explicitly false/0/off/no.
	SOCKS5AddrEnv = "ARTEX_SOCKS5_ADDR"
	// SOCKS5UDPEnabledEnv turns on RFC 1928 UDP ASSOCIATE (IPv4 first) on the
	// SOCKS5 listener when set to 1/true/on/yes. Off by default: when off,
	// UDP ASSOCIATE is refused with reply 0x07 and no UDP relay socket is opened.
	// Setting ARTEX_SOCKS5_UDP_ENABLED=1 also enables the SOCKS5 listener on
	// ARTEX_SOCKS5_ADDR (or DefaultSOCKS5Addr) unless ARTEX_SOCKS5_ENABLED is
	// explicitly false/0/off/no.
	SOCKS5UDPEnabledEnv = "ARTEX_SOCKS5_UDP_ENABLED"

	DefaultSOCKS5Addr               = "127.0.0.1:1080"
	DefaultSOCKS5MaxConcurrent      = 64
	DefaultSOCKS5MaxBytesPerDir     = 4 * 1024 * 1024
	DefaultSOCKS5PreviewBytes       = blobPreview
	DefaultSOCKS5IdleTimeout        = 2 * time.Minute
	DefaultSOCKS5HandshakeTimeout   = 10 * time.Second
	DefaultSOCKS5DialTimeout        = 30 * time.Second
	DefaultSOCKS5PaceTimeout        = paceWaitMax
	DefaultSOCKS5UDPMaxDatagrams    = 1000
	DefaultSOCKS5UDPMaxBytes        = 4 * 1024 * 1024
	DefaultSOCKS5UDPIdleTimeout     = 2 * time.Minute
	DefaultSOCKS5UDPMaxDatagramSize = 65535
)

// RFC 1928 / RFC 1929 protocol constants.
const (
	socks5Version      = 0x05
	socks5AuthNone     = 0x00
	socks5AuthUserPass = 0x02
	socks5AuthNoAccept = 0xFF
	socks5UserPassVer  = 0x01

	socks5CmdConnect      = 0x01
	socks5CmdBind         = 0x02
	socks5CmdUDPAssociate = 0x03

	socks5AtypIPv4   = 0x01
	socks5AtypDomain = 0x03
	socks5AtypIPv6   = 0x04

	socks5RepSuccess            = 0x00
	socks5RepGeneralFailure     = 0x01
	socks5RepNotAllowed         = 0x02
	socks5RepNetworkUnreachable = 0x03
	socks5RepHostUnreachable    = 0x04
	socks5RepConnectionRefused  = 0x05
	socks5RepTTLExpired         = 0x06
	socks5RepCmdNotSupported    = 0x07
	socks5RepAtypNotSupported   = 0x08
)

// SOCKS5Config configures the opt-in RFC 1928 SOCKS5 CONNECT listener.
type SOCKS5Config struct {
	// Addr is the TCP bind address (default DefaultSOCKS5Addr, loopback-bound).
	Addr string
	// MaxConcurrent bounds simultaneous active SOCKS5 streams (default 64).
	MaxConcurrent int
	// MaxBytesPerDir caps bytes captured for storage per direction (default 4 MiB).
	// Relay continues counting total bytes; exceeding the cap sets Truncated=true.
	MaxBytesPerDir int64
	// PreviewBytes caps the inline preview per direction (default 8 KiB).
	PreviewBytes int
	// IdleTimeout closes a relayed stream after no bytes move in either direction.
	IdleTimeout time.Duration
	// HandshakeTimeout bounds the RFC 1928 greeting, auth, and CONNECT request.
	HandshakeTimeout time.Duration
	// DialTimeout bounds the outbound TCP dial.
	DialTimeout time.Duration
	// PaceTimeout bounds waiting on the egress governor before refusing the dial.
	PaceTimeout time.Duration
	// DialContext opens the outbound TCP connection after policy checks.
	// Defaults to intercept.PinnedDialer("socks5", false).
	DialContext func(ctx context.Context, network, addr string) (net.Conn, error)
	// BaseContext, when non-nil, derives the context passed to the egress
	// governor and DialContext (e.g. carrying an intercept.TargetScope).
	BaseContext func() context.Context
	// OnRecord, when non-nil, receives each completed raw TCP capture.
	// When nil and attached to a Traffic store, the store's raw-TCP recorder runs.
	OnRecord func(RawTCPCapture)

	// EnableUDP opts into RFC 1928 UDP ASSOCIATE (IPv4 first, P4.1c).
	// Off by default: when false, UDP ASSOCIATE returns 0x07.
	EnableUDP bool
	// UDPMaxDatagrams caps total forwarded datagrams (c2s + s2c) per UDP association (default 1000).
	UDPMaxDatagrams int
	// UDPMaxBytes caps total forwarded payload bytes (c2s + s2c) per UDP association (default 4 MiB).
	UDPMaxBytes int64
	// UDPIdleTimeout closes a UDP association after no forwarded datagrams move (default 2m).
	UDPIdleTimeout time.Duration
	// UDPPreviewBytes caps inline preview per stored UDP datagram before blob spill (default PreviewBytes / 8 KiB).
	UDPPreviewBytes int
	// ResolveUDP4 enforces the target gate and resolves each UDP datagram destination
	// to a verified IPv4 *net.UDPAddr before forwarding. Defaults to intercept.PinnedUDP4Resolver("socks5-udp", false).
	ResolveUDP4 func(ctx context.Context, addr string) (*net.UDPAddr, error)
	// OnRecordUDP, when non-nil, receives each forwarded UDP datagram capture.
	// When nil and attached to a Traffic store, the store's raw-UDP recorder runs.
	OnRecordUDP func(RawUDPCapture)
}

// RawTCPCapture is the completed metadata and bounded directional payloads of
// one relayed SOCKS5 TCP connection.
type RawTCPCapture struct {
	Host      string
	Port      int
	StartedAt time.Time
	EndedAt   time.Time
	C2SBytes  int64
	S2CBytes  int64
	C2SData   []byte
	S2CData   []byte
	Truncated bool
	Paced     bool
}

// SOCKS5ConfigFromEnv parses ARTEX_SOCKS5_ENABLED, ARTEX_SOCKS5_ADDR, and
// ARTEX_SOCKS5_UDP_ENABLED. Returns (cfg, false) when disabled (the default).
func SOCKS5ConfigFromEnv() (SOCKS5Config, bool) {
	rawEnabled := strings.ToLower(strings.TrimSpace(os.Getenv(SOCKS5EnabledEnv)))
	rawAddr := strings.TrimSpace(os.Getenv(SOCKS5AddrEnv))
	rawUDP := strings.ToLower(strings.TrimSpace(os.Getenv(SOCKS5UDPEnabledEnv)))

	enableUDP := false
	switch rawUDP {
	case "", "0", "false", "off", "no":
		enableUDP = false
	case "1", "true", "on", "yes":
		enableUDP = true
	default:
		slog.Warn("[traffic] non-boolean SOCKS5 UDP env value, leaving disabled", "env", SOCKS5UDPEnabledEnv, "value", rawUDP)
	}

	switch rawEnabled {
	case "0", "false", "off", "no":
		return SOCKS5Config{}, false
	case "1", "true", "on", "yes":
		addr := rawAddr
		if addr == "" {
			addr = DefaultSOCKS5Addr
		}
		return SOCKS5Config{Addr: addr, EnableUDP: enableUDP}, true
	case "":
		if rawAddr == "" && !enableUDP {
			return SOCKS5Config{}, false
		}
		addr := rawAddr
		if addr == "" {
			addr = DefaultSOCKS5Addr
		}
		return SOCKS5Config{Addr: addr, EnableUDP: enableUDP}, true
	default:
		slog.Warn("[traffic] non-boolean SOCKS5 env value, leaving disabled", "env", SOCKS5EnabledEnv, "value", rawEnabled)
		return SOCKS5Config{}, false
	}
}

func (c SOCKS5Config) withDefaults() SOCKS5Config {
	if strings.TrimSpace(c.Addr) == "" {
		c.Addr = DefaultSOCKS5Addr
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
		c.DialContext = intercept.PinnedDialer("socks5", false)
	}
	if c.UDPMaxDatagrams <= 0 {
		c.UDPMaxDatagrams = DefaultSOCKS5UDPMaxDatagrams
	}
	if c.UDPMaxBytes <= 0 {
		c.UDPMaxBytes = DefaultSOCKS5UDPMaxBytes
	}
	if c.UDPIdleTimeout <= 0 {
		c.UDPIdleTimeout = DefaultSOCKS5UDPIdleTimeout
	}
	if c.UDPPreviewBytes <= 0 {
		c.UDPPreviewBytes = c.PreviewBytes
	}
	if c.ResolveUDP4 == nil {
		c.ResolveUDP4 = intercept.PinnedUDP4Resolver("socks5-udp", false)
	}
	return c
}

type socks5Server struct {
	t    *Traffic
	cfg  SOCKS5Config
	ln   net.Listener
	sem  chan struct{}
	stop chan struct{}
	once sync.Once
	wg   sync.WaitGroup

	mu     sync.Mutex
	active map[io.Closer]struct{}
}

// StartSOCKS5 binds and starts the opt-in RFC 1928 SOCKS5 listener on t.
// Returns the actual bound address (useful when cfg.Addr uses port 0).
func (t *Traffic) StartSOCKS5(cfg SOCKS5Config) (string, error) {
	cfg = cfg.withDefaults()
	ln, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return "", fmt.Errorf("socks5 listen %s: %w", cfg.Addr, err)
	}
	srv := &socks5Server{
		t:      t,
		cfg:    cfg,
		ln:     ln,
		sem:    make(chan struct{}, cfg.MaxConcurrent),
		stop:   make(chan struct{}),
		active: map[io.Closer]struct{}{},
	}
	t.socksMu.Lock()
	if t.socks != nil {
		t.socksMu.Unlock()
		_ = ln.Close()
		return "", errors.New("socks5 listener already running")
	}
	t.socks = srv
	t.socksMu.Unlock()

	srv.wg.Add(1)
	go srv.serve()
	return ln.Addr().String(), nil
}

// SOCKS5Addr returns the bound SOCKS5 listener address, or "" when disabled.
func (t *Traffic) SOCKS5Addr() string {
	t.socksMu.Lock()
	defer t.socksMu.Unlock()
	if t.socks == nil || t.socks.ln == nil {
		return ""
	}
	return t.socks.ln.Addr().String()
}

// SOCKS5UDPEnabled reports whether the running SOCKS5 listener accepts RFC 1928
// UDP ASSOCIATE requests.
func (t *Traffic) SOCKS5UDPEnabled() bool {
	t.socksMu.Lock()
	defer t.socksMu.Unlock()
	return t.socks != nil && t.socks.cfg.EnableUDP
}

func (s *socks5Server) Close() error {
	var closeErr error
	s.once.Do(func() {
		close(s.stop)
		closeErr = s.ln.Close()
		s.mu.Lock()
		for c := range s.active {
			_ = c.Close()
		}
		s.mu.Unlock()
	})
	s.wg.Wait()
	return closeErr
}

func (s *socks5Server) stopping() bool {
	select {
	case <-s.stop:
		return true
	default:
		return false
	}
}

func (s *socks5Server) trackConn(c io.Closer) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stopping() {
		return false
	}
	s.active[c] = struct{}{}
	return true
}

func (s *socks5Server) untrackConn(c io.Closer) {
	s.mu.Lock()
	delete(s.active, c)
	s.mu.Unlock()
}

func (s *socks5Server) serve() {
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
			slog.Error("[traffic/socks5] socks5 accept error", "err", err)
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

func (s *socks5Server) handleConn(client net.Conn) {
	// 1. Handshake (greeting + optional RFC 1929 auth + CONNECT request) under HandshakeTimeout.
	_ = client.SetDeadline(time.Now().Add(s.cfg.HandshakeTimeout))

	paced, ok := s.negotiateAuth(client)
	if !ok {
		return
	}

	cmd, atyp, host, port, rep := readSOCKS5Request(client, s.cfg.EnableUDP)
	if rep != socks5RepSuccess {
		_ = writeSOCKS5Reply(client, rep, nil)
		return
	}
	if cmd == socks5CmdUDPAssociate {
		s.handleUDPAssociate(client, atyp, host, port)
		return
	}

	// 2. Enforce max concurrent streams before touching policy or dialing.
	select {
	case s.sem <- struct{}{}:
		defer func() { <-s.sem }()
	default:
		_ = writeSOCKS5Reply(client, socks5RepGeneralFailure, nil)
		return
	}

	// 3. Apply the egress governor and target gate before dialing.
	targetAddr := net.JoinHostPort(host, strconv.Itoa(port))
	upstream, rep := s.dialTarget(host, port, targetAddr)
	if rep != socks5RepSuccess {
		_ = writeSOCKS5Reply(client, rep, nil)
		return
	}
	if !s.trackConn(upstream) {
		_ = upstream.Close()
		_ = writeSOCKS5Reply(client, socks5RepGeneralFailure, nil)
		return
	}
	defer s.untrackConn(upstream)
	defer upstream.Close()

	// Clear handshake deadline before replying and starting the relay.
	_ = client.SetDeadline(time.Time{})
	if err := writeSOCKS5Reply(client, socks5RepSuccess, upstream.LocalAddr()); err != nil {
		return
	}

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

	rec := RawTCPCapture{
		Host:      host,
		Port:      port,
		StartedAt: startedAt,
		EndedAt:   endedAt,
		C2SBytes:  c2sCap.total,
		S2CBytes:  s2cCap.total,
		C2SData:   c2sCap.buf,
		S2CData:   s2cCap.buf,
		Truncated: c2sCap.truncated || s2cCap.truncated,
		Paced:     paced,
	}
	s.recordCapture(rec)
}

func (s *socks5Server) recordCapture(rec RawTCPCapture) {
	if s.t != nil && s.t.db != nil {
		if _, err := s.t.RecordRawTCPStream(rec, s.cfg.PreviewBytes); err != nil {
			slog.Error("[traffic/socks5] failed to record raw tcp stream", "host", rec.Host, "port", rec.Port, "err", err)
		}
	}
	if s.cfg.OnRecord != nil {
		s.cfg.OnRecord(rec)
	}
}

func (s *socks5Server) negotiateAuth(conn net.Conn) (paced bool, ok bool) {
	var hdr [2]byte
	if _, err := io.ReadFull(conn, hdr[:]); err != nil {
		return false, false
	}
	if hdr[0] != socks5Version || hdr[1] == 0 {
		return false, false
	}
	methods := make([]byte, int(hdr[1]))
	if _, err := io.ReadFull(conn, methods); err != nil {
		return false, false
	}

	var hasNone, hasUserPass bool
	for _, m := range methods {
		switch m {
		case socks5AuthNone:
			hasNone = true
		case socks5AuthUserPass:
			hasUserPass = true
		}
	}

	// Prefer username/password when offered so clients carrying the pace marker
	// (egress.PaceUser) can pass it through without requiring real credentials.
	// Accept no-auth for loopback clients.
	if hasUserPass {
		if _, err := conn.Write([]byte{socks5Version, socks5AuthUserPass}); err != nil {
			return false, false
		}
		return readSOCKS5UserPass(conn)
	}
	if hasNone && isLoopbackRemote(conn.RemoteAddr()) {
		if _, err := conn.Write([]byte{socks5Version, socks5AuthNone}); err != nil {
			return false, false
		}
		return false, true
	}
	_, _ = conn.Write([]byte{socks5Version, socks5AuthNoAccept})
	return false, false
}

// readSOCKS5UserPass parses an RFC 1929 username/password subnegotiation.
// Credentials are never required (any username/password succeeds); a username
// equal to egress.PaceUser marks the connection as paced.
func readSOCKS5UserPass(conn net.Conn) (paced bool, ok bool) {
	var head [2]byte
	if _, err := io.ReadFull(conn, head[:]); err != nil {
		return false, false
	}
	if head[0] != socks5UserPassVer {
		_, _ = conn.Write([]byte{socks5UserPassVer, 0x01})
		return false, false
	}
	uname := make([]byte, int(head[1]))
	if _, err := io.ReadFull(conn, uname); err != nil {
		return false, false
	}
	var plen [1]byte
	if _, err := io.ReadFull(conn, plen[:]); err != nil {
		return false, false
	}
	if plen[0] > 0 {
		pass := make([]byte, int(plen[0]))
		if _, err := io.ReadFull(conn, pass); err != nil {
			return false, false
		}
	}
	if _, err := conn.Write([]byte{socks5UserPassVer, 0x00}); err != nil {
		return false, false
	}
	return string(uname) == egress.PaceUser, true
}

func readSOCKS5Request(conn net.Conn, enableUDP bool) (cmd byte, atyp byte, host string, port int, rep byte) {
	var hdr [4]byte
	if _, err := io.ReadFull(conn, hdr[:]); err != nil {
		return 0, 0, "", 0, socks5RepGeneralFailure
	}
	if hdr[0] != socks5Version || hdr[2] != 0x00 {
		return 0, 0, "", 0, socks5RepGeneralFailure
	}
	cmd = hdr[1]
	atyp = hdr[3]

	// Read the address + port before rejecting unsupported commands so the stream
	// stays cleanly framed if the peer reads our reply.
	switch atyp {
	case socks5AtypIPv4:
		var ip [4]byte
		if _, err := io.ReadFull(conn, ip[:]); err != nil {
			return cmd, atyp, "", 0, socks5RepGeneralFailure
		}
		host = net.IP(ip[:]).String()
	case socks5AtypDomain:
		var l [1]byte
		if _, err := io.ReadFull(conn, l[:]); err != nil {
			return cmd, atyp, "", 0, socks5RepGeneralFailure
		}
		if l[0] == 0 {
			return cmd, atyp, "", 0, socks5RepGeneralFailure
		}
		dom := make([]byte, int(l[0]))
		if _, err := io.ReadFull(conn, dom); err != nil {
			return cmd, atyp, "", 0, socks5RepGeneralFailure
		}
		host = strings.TrimSpace(string(dom))
		if host == "" {
			return cmd, atyp, "", 0, socks5RepGeneralFailure
		}
	case socks5AtypIPv6:
		var ip [16]byte
		if _, err := io.ReadFull(conn, ip[:]); err != nil {
			return cmd, atyp, "", 0, socks5RepGeneralFailure
		}
		host = net.IP(ip[:]).String()
	default:
		return cmd, atyp, "", 0, socks5RepAtypNotSupported
	}

	var pbuf [2]byte
	if _, err := io.ReadFull(conn, pbuf[:]); err != nil {
		return cmd, atyp, "", 0, socks5RepGeneralFailure
	}
	port = int(binary.BigEndian.Uint16(pbuf[:]))

	switch cmd {
	case socks5CmdConnect:
		if port <= 0 || port > 65535 {
			return cmd, atyp, "", 0, socks5RepGeneralFailure
		}
		return cmd, atyp, host, port, socks5RepSuccess
	case socks5CmdUDPAssociate:
		if !enableUDP {
			return cmd, atyp, "", 0, socks5RepCmdNotSupported
		}
		// P4.1c covers IPv4 first; IPv6 UDP ASSOCIATE is rejected explicitly.
		if atyp == socks5AtypIPv6 {
			return cmd, atyp, "", 0, socks5RepAtypNotSupported
		}
		return cmd, atyp, host, port, socks5RepSuccess
	default:
		return cmd, atyp, "", 0, socks5RepCmdNotSupported
	}
}

func writeSOCKS5Reply(conn net.Conn, rep byte, bindAddr net.Addr) error {
	var bndIP net.IP
	var bndPort int
	switch a := bindAddr.(type) {
	case *net.TCPAddr:
		if a != nil {
			bndIP = a.IP
			bndPort = a.Port
		}
	case *net.UDPAddr:
		if a != nil {
			bndIP = a.IP
			bndPort = a.Port
		}
	}
	var out []byte
	if ip4 := bndIP.To4(); ip4 != nil {
		out = make([]byte, 0, 10)
		out = append(out, socks5Version, rep, 0x00, socks5AtypIPv4)
		out = append(out, ip4...)
	} else if ip16 := bndIP.To16(); ip16 != nil {
		out = make([]byte, 0, 22)
		out = append(out, socks5Version, rep, 0x00, socks5AtypIPv6)
		out = append(out, ip16...)
	} else {
		out = make([]byte, 0, 10)
		out = append(out, socks5Version, rep, 0x00, socks5AtypIPv4, 0, 0, 0, 0)
	}
	var p [2]byte
	binary.BigEndian.PutUint16(p[:], uint16(bndPort))
	out = append(out, p[:]...)
	_, err := conn.Write(out)
	return err
}

func (s *socks5Server) dialTarget(host string, port int, targetAddr string) (net.Conn, byte) {
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

	// Run through the same egress governor (egress.Do) and target gate dialer
	// (intercept.PinnedDialer / Interceptor.DialSOCKS5) the HTTP path uses.
	govCtx, govCancel := context.WithTimeout(stopCtx, s.cfg.PaceTimeout)
	defer govCancel()

	targetURL := &url.URL{Scheme: "tcp", Host: targetAddr}
	dialCalled := false
	conn, err := egress.Do(egress.Current(), govCtx, targetURL, func() (net.Conn, error) {
		dialCalled = true
		dialCtx, dialCancel := context.WithTimeout(stopCtx, s.cfg.DialTimeout)
		defer dialCancel()
		return s.cfg.DialContext(dialCtx, "tcp", targetAddr)
	})
	if err != nil {
		if !dialCalled {
			// Refused by the egress governor before dialing.
			return nil, socks5RepNotAllowed
		}
		return nil, mapDialErrorToSOCKS5Reply(err)
	}
	return conn, socks5RepSuccess
}

func mapDialErrorToSOCKS5Reply(err error) byte {
	if _, blocked := intercept.IsTargetBlocked(err); blocked {
		return socks5RepNotAllowed
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return socks5RepHostUnreachable
	}
	if errors.Is(err, syscall.ECONNREFUSED) {
		return socks5RepConnectionRefused
	}
	if errors.Is(err, syscall.ENETUNREACH) {
		return socks5RepNetworkUnreachable
	}
	if errors.Is(err, syscall.EHOSTUNREACH) {
		return socks5RepHostUnreachable
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return socks5RepTTLExpired
	}
	low := strings.ToLower(err.Error())
	switch {
	case strings.Contains(low, "connection refused"):
		return socks5RepConnectionRefused
	case strings.Contains(low, "network is unreachable"):
		return socks5RepNetworkUnreachable
	case strings.Contains(low, "no route to host"), strings.Contains(low, "no such host"), strings.Contains(low, "host is unreachable"):
		return socks5RepHostUnreachable
	}
	return socks5RepGeneralFailure
}

func isLoopbackRemote(addr net.Addr) bool {
	if addr == nil {
		return false
	}
	switch a := addr.(type) {
	case *net.TCPAddr:
		return a.IP != nil && a.IP.IsLoopback()
	default:
		h, _, err := net.SplitHostPort(addr.String())
		if err != nil {
			h = addr.String()
		}
		ip := net.ParseIP(strings.Trim(h, "[]"))
		return ip != nil && ip.IsLoopback()
	}
}

type limitedCapture struct {
	max       int64
	total     int64
	buf       []byte
	truncated bool
}

func (c *limitedCapture) record(p []byte) {
	if len(p) == 0 {
		return
	}
	c.total += int64(len(p))
	rem := c.max - int64(len(c.buf))
	if rem <= 0 {
		c.truncated = true
		return
	}
	if int64(len(p)) > rem {
		c.buf = append(c.buf, p[:rem]...)
		c.truncated = true
		return
	}
	c.buf = append(c.buf, p...)
}

func relayHalf(dst, src net.Conn, cap *limitedCapture, idle time.Duration) {
	buf := make([]byte, 32*1024)
	for {
		if idle > 0 {
			_ = src.SetReadDeadline(time.Now().Add(idle))
		}
		n, rerr := src.Read(buf)
		if n > 0 {
			chunk := buf[:n]
			cap.record(chunk)
			if idle > 0 {
				_ = dst.SetWriteDeadline(time.Now().Add(idle))
			}
			if _, werr := dst.Write(chunk); werr != nil {
				return
			}
		}
		if rerr != nil {
			return
		}
	}
}

func closeWrite(c net.Conn) {
	type halfCloser interface {
		CloseWrite() error
	}
	if hc, ok := c.(halfCloser); ok {
		_ = hc.CloseWrite()
	}
}
