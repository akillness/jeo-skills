package intercept

import (
	"context"
	"testing"
)

// DialGate exposes the pinned-dial fixture of target_dial_test.go to the tests
// of package intercept_test, which may import the packages that import
// intercept (enrich).
type DialGate struct {
	g   *gateFixture
	rec *dialRecorder
}

func NewDialGate(t *testing.T) *DialGate {
	g, rec := dialGate(t)
	return &DialGate{g: g, rec: rec}
}

// Ctx returns a context carrying the fixture's target scope, gate on.
func (d *DialGate) Ctx() context.Context { return d.g.ctx() }

func (d *DialGate) Pin(host string, port int, ips ...string) { d.g.pin(host, port, ips...) }

func (d *DialGate) Resolve(host string, ips ...string) { d.g.res.set(host, ips...) }

func (d *DialGate) Exempt(urls ...string) {
	d.g.ic.SetDerivedExemptions(func() []string { return urls })
}

// Calls returns every address the base dialer was asked to connect to.
func (d *DialGate) Calls() []string { return d.rec.calls() }
