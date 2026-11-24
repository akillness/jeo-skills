package intercept

import (
	"net/netip"
	"net/url"
	"strconv"
	"strings"

	"golang.org/x/net/idna"
)

// Kinds of target.
const (
	TargetDomain = "domain"
	TargetIP     = "ip"
	TargetCIDR   = "cidr"
)

// Target is one network target a tool call declares, in normalised form. With
// its scope, Host and Port are the key of a pin and of an approval request;
// path, query and scheme are never part of it.
type Target struct {
	Kind string // domain | ip | cidr
	Host string // lower-case punycode name, canonical IP literal, or masked CIDR
	Port int    // 0 = port not declared
}

// schemePorts are the default ports of the schemes a target is usually written
// with. A URL of another scheme without an explicit port has port 0.
var schemePorts = map[string]int{"http": 80, "https": 443, "ws": 80, "wss": 443, "ftp": 21}

// hostProfile maps a name the way a lookup does (case, width, punycode) without
// the strict rules that would refuse an underscore label.
var hostProfile = idna.New(idna.MapForLookup(), idna.BidiRule())

// NormalizeTarget parses one target written as a URL with a scheme, or as a
// host, host:port, [IPv6]:port, IP literal or CIDR. The name is lower-cased, its
// trailing dot, userinfo and IPv6 brackets are removed, the host of a URL is
// percent-decoded, an IPv4-mapped IPv6 address is unmapped, the decimal, hex, octal and short forms of an IPv4
// address become dotted, and a Unicode name becomes punycode. The port is the
// explicit one, else the default of the scheme, else 0.
func NormalizeTarget(raw string) (Target, bool) {
	raw = strings.TrimSpace(raw)
	def, isURL := 0, false
	if i := strings.Index(raw, "://"); i > 0 {
		isURL = true
		def = schemePorts[strings.ToLower(raw[:i])]
		raw = raw[i+3:]
		if end := strings.IndexAny(raw, "/?#"); end >= 0 {
			raw = raw[:end]
		}
		raw = raw[strings.LastIndexByte(raw, '@')+1:]
	}
	host, port := raw, ""
	switch {
	case strings.HasPrefix(raw, "["):
		end := strings.IndexByte(raw, ']')
		if end < 0 {
			return Target{}, false
		}
		host = raw[1:end]
		if rest := raw[end+1:]; rest != "" {
			if rest[0] != ':' {
				return Target{}, false
			}
			port = rest[1:]
		}
	case strings.Count(raw, ":") == 1:
		host, port, _ = strings.Cut(raw, ":")
	}
	if isURL && !strings.HasPrefix(raw, "[") {
		// A client decodes a percent-encoded host before it resolves it.
		if decoded, err := url.PathUnescape(host); err == nil {
			host = decoded
		}
	}
	t := Target{Port: def}
	if port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return Target{}, false
		}
		t.Port = n
	}
	var ok bool
	t.Kind, t.Host, ok = normalizeHost(host, true)
	return t, ok
}

// normalizeHost returns the kind and the canonical form of a host. numeric
// accepts the forms of an IPv4 address that are not dotted decimal
// (2130706433, 0x7f000001, 0177.0.0.1, 127.1), which a URL host may use; in
// free text they would turn every number into an address.
func normalizeHost(raw string, numeric bool) (kind, host string, ok bool) {
	h := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(raw)), ".")
	if h == "" {
		return "", "", false
	}
	if strings.Contains(h, "/") {
		p, err := netip.ParsePrefix(h)
		if err != nil {
			return "", "", false
		}
		return TargetCIDR, p.Masked().String(), true
	}
	if a, err := netip.ParseAddr(h); err == nil {
		return TargetIP, a.Unmap().WithZone("").String(), true
	}
	if numeric {
		if a, ok := parseIPv4Forms(h); ok {
			return TargetIP, a.String(), true
		}
	}
	// A name the profile refuses is kept as written: it then fails to resolve and
	// the call is blocked, instead of passing as a call without a target.
	if name, err := hostProfile.ToASCII(h); err == nil && name != "" {
		h = name
	}
	return TargetDomain, h, true
}

// parseIPv4Forms reads an IPv4 address the way inet_aton does: one to four
// parts, each decimal, hex (0x) or octal (leading 0), the last one filling the
// remaining bytes.
func parseIPv4Forms(s string) (netip.Addr, bool) {
	parts := strings.Split(s, ".")
	if len(parts) > 4 {
		return netip.Addr{}, false
	}
	var v uint64
	for n, p := range parts {
		base := 10
		switch {
		case strings.HasPrefix(p, "0x"):
			p, base = p[2:], 16
		case len(p) > 1 && p[0] == '0':
			p, base = p[1:], 8
		}
		x, err := strconv.ParseUint(p, base, 32)
		if err != nil {
			return netip.Addr{}, false
		}
		if n < len(parts)-1 {
			if x > 255 {
				return netip.Addr{}, false
			}
			v = v<<8 | x
			continue
		}
		rest := uint(8 * (4 - n))
		if x >= 1<<rest {
			return netip.Addr{}, false
		}
		v = v<<rest | x
	}
	return netip.AddrFrom4([4]byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)}), true
}

// validHostname reports whether h is a plain DNS name: labels of letters,
// digits, hyphen and underscore. A wildcard or a pattern is not one.
func validHostname(h string) bool {
	if len(h) > 253 {
		return false
	}
	for _, label := range strings.Split(h, ".") {
		if label == "" || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, c := range []byte(label) {
			if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
				return false
			}
		}
	}
	return true
}
