package intercept

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/netip"
	"strings"

	"github.com/Autumn-27/artex/db"
)

// metadataAddrs are instance-metadata addresses that lie outside the link-local
// ranges and would otherwise pass as private or public unicast.
var metadataAddrs = []netip.Addr{
	netip.MustParseAddr("fd00:ec2::254"),   // AWS IMDS over IPv6
	netip.MustParseAddr("100.100.100.200"), // Alibaba Cloud
}

// ValidateExemptionHost checks the host of an entry an operator adds to the
// target-gate exemption list. host is expected in normalised form.
//
// An exemption on a name is resolved at check time and is void when the name
// resolves to a private, loopback, link-local or unspecified address. An IP
// literal is never resolved, so that rule cannot protect it and the literal is
// checked here instead. A private unicast address is allowed: an internal
// service the operator names on purpose (10.0.0.5:8080). Loopback, link-local
// (169.254.0.0/16 holds the cloud metadata address 169.254.169.254; fe80::/10),
// unspecified and multicast addresses are never accepted, nor are the metadata
// addresses outside the link-local ranges. A host that is not an IP literal
// passes: names are the void rule's business.
func ValidateExemptionHost(host string) error {
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return nil
	}
	addr = addr.Unmap().WithZone("")
	kind := ""
	switch {
	case addr.IsLoopback():
		kind = "a loopback"
	case addr.IsUnspecified():
		kind = "the unspecified"
	case addr.IsLinkLocalUnicast():
		kind = "a link-local (metadata range)"
	case addr.IsMulticast():
		kind = "a multicast"
	}
	for _, m := range metadataAddrs {
		if addr == m {
			kind = "an instance-metadata"
		}
	}
	if kind != "" {
		return fmt.Errorf("%s is %s address and can never be exempt from target approval", host, kind)
	}
	return nil
}

// ErrInvalidExemption is wrapped by the reason an exemption entry is refused.
var ErrInvalidExemption = errors.New("invalid exemption")

// SetDerivedExemptions installs the function that lists the endpoints of the
// platform's own services, as URLs or host:port: the LLM gateways, the search
// backend in use and the platform proxies. They are exempt because the
// configuration names them. They are computed at check time and never stored,
// so they follow the configuration and cannot be set through the exemption
// list. A derived exemption is never resolved and never voided: an internal
// relay for a platform service is a normal deployment.
func (i *Interceptor) SetDerivedExemptions(f func() []string) {
	i.mu.Lock()
	i.derivedExempt = f
	i.mu.Unlock()
}

// proxyPorts are the ports net/http dials for a proxy URL without one, for the
// schemes schemePorts has no default for.
var proxyPorts = map[string]int{"socks5": 1080, "socks5h": 1080}

// DerivedExemptions returns the exemptions derived from the configuration, as
// exact host and port. An endpoint without a port gets the one net/http dials
// (the scheme's default, 1080 for socks5); one with neither is not listed.
func (i *Interceptor) DerivedExemptions() []db.TargetExemption {
	i.mu.RLock()
	f := i.derivedExempt
	i.mu.RUnlock()
	out := []db.TargetExemption{}
	if f == nil {
		return out
	}
	seen := map[string]bool{}
	for _, raw := range f() {
		t, ok := NormalizeTarget(raw)
		if scheme, _, found := strings.Cut(strings.TrimSpace(raw), "://"); ok && found && t.Port == 0 {
			t.Port = proxyPorts[strings.ToLower(scheme)]
		}
		if !ok || t.Port == 0 || t.Kind == TargetCIDR || seen[db.TargetKey(t.Host, t.Port)] {
			continue
		}
		seen[db.TargetKey(t.Host, t.Port)] = true
		out = append(out, db.TargetExemption{Host: t.Host, Port: t.Port})
	}
	return out
}

// Exemptions returns the stored exemption list and its digest.
func (i *Interceptor) Exemptions() ([]db.TargetExemption, string, error) {
	return i.targets.Exemptions()
}

// SetExemptions validates list and stores it as the exemption list; the change
// is appended to the exemption log with changedBy. An entry is an exact host
// and port: a name or an IP literal, no wildcard, no suffix, no CIDR, and a
// port between 1 and 65535. It returns the list as stored (hosts normalised,
// duplicates dropped) and its digest.
func (i *Interceptor) SetExemptions(list []db.TargetExemption, changedBy string) ([]db.TargetExemption, string, error) {
	out := []db.TargetExemption{}
	seen := map[string]bool{}
	for _, e := range list {
		kind, host, ok := normalizeHost(e.Host, true)
		switch {
		case !ok || kind == TargetCIDR || kind == TargetDomain && !validHostname(host):
			return nil, "", fmt.Errorf("%w: %q is not an exact host name or IP address", ErrInvalidExemption, e.Host)
		case e.Port < 1 || e.Port > 65535:
			return nil, "", fmt.Errorf("%w: %s needs a port between 1 and 65535, got %d", ErrInvalidExemption, host, e.Port)
		}
		if err := ValidateExemptionHost(host); err != nil {
			return nil, "", fmt.Errorf("%w: %v", ErrInvalidExemption, err)
		}
		if key := db.TargetKey(host, e.Port); !seen[key] {
			seen[key] = true
			out = append(out, db.TargetExemption{Host: host, Port: e.Port, Note: strings.TrimSpace(e.Note)})
		}
	}
	raw, err := json.Marshal(out)
	if err != nil {
		return nil, "", err
	}
	digest := digestInput(raw)
	if err := i.db.ReplaceTargetExemptions(out, changedBy, digest); err != nil {
		return nil, "", err
	}
	return out, digest, nil
}

// exemptions is the exemption list as one gated call sees it.
type exemptions struct {
	derived map[string]bool // db.TargetKey(host, port)
	stored  map[string]bool
	digest  string // of the stored list
}

func (i *Interceptor) loadExemptions() (exemptions, error) {
	stored, digest, err := i.targets.Exemptions()
	if err != nil {
		return exemptions{}, err
	}
	ex := exemptions{derived: map[string]bool{}, stored: map[string]bool{}, digest: digest}
	for _, e := range i.DerivedExemptions() {
		ex.derived[db.TargetKey(e.Host, e.Port)] = true
	}
	for _, e := range stored {
		ex.stored[db.TargetKey(e.Host, e.Port)] = true
	}
	return ex, nil
}

// IsNonPublicAddr reports whether addr is private (RFC1918, fc00::/7 unique
// local), loopback, link-local (including 169.254.169.254 and fe80::/10),
// unspecified, multicast, or a known instance-metadata address.
// Invalid addresses are treated as non-public (fail closed).
func IsNonPublicAddr(addr netip.Addr) bool {
	if !addr.IsValid() {
		return true
	}
	addr = addr.Unmap().WithZone("")
	return addr.IsPrivate() || ValidateExemptionHost(addr.String()) != nil
}

// voidsExemption reports whether one resolved address voids a stored
// exemption on a name: a private address (10/8, 172.16/12, 192.168/16, the
// unique local range fc00::/7), or one that is never exempt as a literal
// either (loopback, link-local 169.254.0.0/16 and fe80::/10, unspecified,
// multicast, instance metadata). One such address is enough.
func voidsExemption(ip string) bool {
	a, err := netip.ParseAddr(ip)
	if err != nil {
		return true
	}
	return IsNonPublicAddr(a)
}
