package server

import (
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"
)

// Login attempts are limited per client IP, never per account: a per-account
// lockout would let anyone lock the admin out by failing on purpose.
const (
	loginMaxAttempts = 10               // attempts allowed per IP per window
	loginWindow      = time.Minute      // the counting window
	loginBaseBlock   = time.Minute      // length of the first block
	loginMaxBlock    = 15 * time.Minute // cap on the block; an entry idle this long is dropped
	loginSweepEvery  = time.Minute      // how often stale entries are swept
	loginMaxEntries  = 10000            // hard cap on tracked IPs
)

type loginEntry struct {
	attempts     int
	windowStart  time.Time
	blockedUntil time.Time
	block        time.Duration // current block length; doubles on every new block or blocked attempt
	lastSeen     time.Time
}

// loginLimiter counts login attempts per IP. Past loginMaxAttempts in one
// loginWindow the IP is blocked for loginBaseBlock; every attempt while blocked,
// and every later block, doubles the block up to loginMaxBlock. State is in
// memory only and swept of idle entries, so a restart clears it.
type loginLimiter struct {
	mu        sync.Mutex
	now       func() time.Time
	entries   map[string]*loginEntry
	lastSweep time.Time
}

func newLoginLimiter(now func() time.Time) *loginLimiter {
	return &loginLimiter{now: now, entries: map[string]*loginEntry{}}
}

// allow records one attempt from ip. It returns 0 when the attempt may go on,
// otherwise how long ip must wait.
func (l *loginLimiter) allow(ip string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.sweep(now)
	e := l.entries[ip]
	if e == nil {
		if len(l.entries) >= loginMaxEntries {
			l.evictOldest()
		}
		e = &loginEntry{windowStart: now}
		l.entries[ip] = e
	}
	e.lastSeen = now
	if now.Before(e.blockedUntil) {
		e.block = min(2*e.block, loginMaxBlock)
		e.blockedUntil = now.Add(e.block)
		return e.block
	}
	if now.Sub(e.windowStart) >= loginWindow {
		e.attempts, e.windowStart = 0, now
	}
	if e.attempts >= loginMaxAttempts {
		if e.block == 0 {
			e.block = loginBaseBlock
		} else {
			e.block = min(2*e.block, loginMaxBlock)
		}
		e.blockedUntil = now.Add(e.block)
		e.attempts, e.windowStart = 0, now
		return e.block
	}
	e.attempts++
	return 0
}

// reset forgets ip, after a successful login. A blocked IP never reaches the
// password check, so this only runs outside a block.
func (l *loginLimiter) reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, ip)
}

// sweep drops entries idle for loginMaxBlock, at most once per loginSweepEvery.
// Such an entry is never blocked: a block ends at most loginMaxBlock after the
// attempt that set it.
func (l *loginLimiter) sweep(now time.Time) {
	if now.Sub(l.lastSweep) < loginSweepEvery {
		return
	}
	l.lastSweep = now
	for ip, e := range l.entries {
		if now.Sub(e.lastSeen) >= loginMaxBlock {
			delete(l.entries, ip)
		}
	}
}

// evictOldest drops the least recently seen entry that is not inside a block.
// A block that is still running stays, so filling the map cannot clear an
// active lockout. When every entry is blocked, the one whose block ends soonest
// is the one that goes.
func (l *loginLimiter) evictOldest() {
	now := l.now()
	var oldest string
	var at time.Time
	found := false
	for ip, e := range l.entries {
		if now.Before(e.blockedUntil) {
			continue
		}
		if !found || e.lastSeen.Before(at) {
			oldest, at, found = ip, e.lastSeen, true
		}
	}
	if !found {
		var until time.Time
		for ip, e := range l.entries {
			if oldest == "" || e.blockedUntil.Before(until) {
				oldest, until = ip, e.blockedUntil
			}
		}
	}
	if oldest != "" {
		delete(l.entries, oldest)
	}
}

// peerIP is the host part of the TCP peer address.
func peerIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// clientIP is the address login attempts are counted against. It is the TCP
// peer unless the peer is in trusted: then X-Forwarded-For is read from the
// right, past trusted hops, and the first untrusted hop is the client. Entries
// left of that hop come from the client itself and are never used, so a client
// cannot pick its own bucket. With trusted empty the header is ignored.
func clientIP(r *http.Request, trusted []netip.Prefix) string {
	peer := peerIP(r)
	addr, err := netip.ParseAddr(peer)
	if err != nil || !isTrusted(addr, trusted) {
		return peer
	}
	hops := strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		hop, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil {
			break // keep the last address a trusted proxy reported
		}
		addr = hop
		if !isTrusted(addr, trusted) {
			break
		}
	}
	return addr.Unmap().WithZone("").String()
}

func isTrusted(a netip.Addr, trusted []netip.Prefix) bool {
	a = a.Unmap().WithZone("")
	for _, p := range trusted {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

// ParseTrustedProxies parses ARTEX_TRUSTED_PROXIES: comma-separated CIDRs (a
// bare address means that one host). Empty means no trusted proxy.
func ParseTrustedProxies(s string) ([]netip.Prefix, error) {
	var out []netip.Prefix
	for _, f := range strings.Split(s, ",") {
		f = strings.TrimSpace(f)
		if f == "" {
			continue
		}
		if p, err := netip.ParsePrefix(f); err == nil {
			out = append(out, p.Masked())
			continue
		}
		a, err := netip.ParseAddr(f)
		if err != nil || a.Zone() != "" {
			return nil, fmt.Errorf("%q is not a CIDR or an IP address", f)
		}
		a = a.Unmap()
		out = append(out, netip.PrefixFrom(a, a.BitLen()))
	}
	return out, nil
}

// WithTrustedProxies sets the proxies whose X-Forwarded-For the login rate
// limit reads (see clientIP).
func WithTrustedProxies(p []netip.Prefix) Option {
	return func(s *Server) { s.trustedProxies = p }
}
