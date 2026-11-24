package intercept

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"slices"
	"sync"
	"time"
)

// Resolver turns a host name into its addresses. The gate compares what it
// returns with the addresses a human pinned.
type Resolver interface {
	// Name identifies the resolver in pins and in audit rows.
	Name() string
	// LookupIPs returns the A and AAAA answers for host.
	LookupIPs(ctx context.Context, host string) ([]netip.Addr, error)
}

// SetResolver replaces the resolver of the target gate, which is the system
// resolver unless one is set.
func (i *Interceptor) SetResolver(r Resolver) { i.resolve.use(r) }

// SetBaseDialer replaces the dialer that opens the connections PinnedDialer
// lets through, which is a net.Dialer with the settings of
// http.DefaultTransport unless one is set. Tests use it to map addresses to
// local listeners and to see what was dialled.
func (i *Interceptor) SetBaseDialer(f func(ctx context.Context, network, addr string) (net.Conn, error)) {
	i.mu.Lock()
	i.dial = f
	i.mu.Unlock()
}

// systemResolver is the resolver of the ARTEX process. It reads the same
// resolver configuration as the tools that run in the same container.
type systemResolver struct{}

func (systemResolver) Name() string { return "system" }

func (systemResolver) LookupIPs(ctx context.Context, host string) ([]netip.Addr, error) {
	return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
}

const (
	// resolveTimeout bounds one lookup.
	resolveTimeout = 3 * time.Second
	// resolveCacheTTL is how long a positive answer is reused. It bounds latency
	// and resolver load when several calls name one host, and adds at most this
	// much to the time a changed address goes unnoticed.
	resolveCacheTTL = 10 * time.Second
)

// resolution is one positive answer: canonical addresses, sorted, never empty.
type resolution struct {
	ips []string
	at  time.Time
}

type resolveFlight struct {
	done chan struct{}
	res  resolution
	err  error
}

// resolveCache resolves names through one Resolver. Positive answers are kept
// per host for resolveCacheTTL, concurrent lookups for one host collapse into
// one, and a failure or an empty answer is never kept: the next call tries
// again.
type resolveCache struct {
	now func() time.Time

	mu       sync.Mutex
	resolver Resolver
	entries  map[string]resolution
	flights  map[string]*resolveFlight
}

func newResolveCache(r Resolver) *resolveCache {
	return &resolveCache{resolver: r, now: time.Now, entries: map[string]resolution{}, flights: map[string]*resolveFlight{}}
}

// use replaces the resolver and drops the answers of the previous one.
func (c *resolveCache) use(r Resolver) {
	c.mu.Lock()
	c.resolver, c.entries = r, map[string]resolution{}
	c.mu.Unlock()
}

func (c *resolveCache) name() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.resolver.Name()
}

// lookup resolves host. fresh skips the cached answer: it is what a new
// approval request uses, because a human reads and pins those addresses.
func (c *resolveCache) lookup(ctx context.Context, host string, fresh bool) (resolution, error) {
	c.mu.Lock()
	if e, ok := c.entries[host]; ok && !fresh && c.now().Sub(e.at) < resolveCacheTTL {
		c.mu.Unlock()
		return e, nil
	}
	f := c.flights[host]
	if f == nil {
		f = &resolveFlight{done: make(chan struct{})}
		c.flights[host] = f
		go c.fly(c.resolver, host, f)
	}
	c.mu.Unlock()
	select {
	case <-f.done:
		return f.res, f.err
	case <-ctx.Done():
		return resolution{}, ctx.Err()
	}
}

// fly runs the one lookup the waiters of host share. It is not bound to the
// context of the call that started it: that call leaving must not fail the others.
func (c *resolveCache) fly(r Resolver, host string, f *resolveFlight) {
	ctx, cancel := context.WithTimeout(context.Background(), resolveTimeout)
	defer cancel()
	addrs, err := r.LookupIPs(ctx, host)
	switch {
	case ctx.Err() != nil:
		f.err = fmt.Errorf("lookup timed out after %s", resolveTimeout)
	case err != nil:
		f.err = lookupError(err)
	case len(addrs) == 0:
		f.err = errors.New("the lookup returned no address")
	default:
		f.res = resolution{ips: canonicalIPs(addrs), at: c.now()}
	}
	c.mu.Lock()
	delete(c.flights, host)
	if f.err == nil {
		c.entries[host] = f.res
	}
	c.mu.Unlock()
	close(f.done)
}

// lookupError keeps the part of a resolver error that says what went wrong.
func lookupError(err error) error {
	var dns *net.DNSError
	if errors.As(err, &dns) {
		if dns.IsTimeout {
			return fmt.Errorf("lookup timed out after %s", resolveTimeout)
		}
		if dns.IsNotFound {
			return errors.New("no such host")
		}
		return errors.New(dns.Err)
	}
	return err
}

// canonicalIPs returns the addresses as sorted, unique strings, IPv4-mapped
// addresses unmapped and zones dropped.
func canonicalIPs(addrs []netip.Addr) []string {
	out := make([]string, 0, len(addrs))
	for _, a := range addrs {
		out = append(out, a.Unmap().WithZone("").String())
	}
	slices.Sort(out)
	return slices.Compact(out)
}

// subset reports whether every resolved address is one of the pinned ones. An
// empty answer is never a subset: a lookup that returned nothing matches no pin.
func subset(resolved, pinned []string) bool {
	if len(resolved) == 0 {
		return false
	}
	for _, ip := range resolved {
		if !slices.Contains(pinned, ip) {
			return false
		}
	}
	return true
}
