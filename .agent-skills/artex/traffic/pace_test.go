package traffic

import (
	"crypto/tls"
	"crypto/x509"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/egress"
	mproxy "github.com/lqqyt2423/go-mitmproxy/proxy"
)

// startProxy runs a real recording proxy on a free loopback port and returns it
// with its sink and URL. extra addons run after the recording sink.
func startProxy(t *testing.T, extra ...mproxy.Addon) (*Traffic, *sink, string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	ln.Close()
	tr, err := Open(t.TempDir(), addr)
	if err != nil {
		t.Fatal(err)
	}
	s := tr.proxy.Addons[0].(*sink)
	for _, a := range extra {
		tr.proxy.AddAddon(a)
	}
	go func() { _ = tr.Start() }()
	t.Cleanup(func() {
		_ = tr.proxy.Close()
		_ = tr.Close()
	})
	deadline := time.Now().Add(5 * time.Second)
	for {
		c, err := net.Dial("tcp", addr)
		if err == nil {
			c.Close()
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("proxy did not listen on %s: %v", addr, err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	return tr, s, "http://" + addr
}

// proxyClient is a curl-like client: it sends the proxy URL's userinfo as
// Proxy-Authorization on CONNECT and on plain-HTTP requests, and trusts the CA.
func proxyClient(t *testing.T, tr *Traffic, proxyURL string) *http.Client {
	t.Helper()
	pem, err := os.ReadFile(tr.CACertPath())
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		t.Fatal("no CA in", tr.CACertPath())
	}
	u, _ := url.Parse(proxyURL)
	return &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(u), TLSClientConfig: &tls.Config{RootCAs: pool}}}
}

// probe records the ClientConn of each request the proxy sees, after the sink.
type probe struct {
	mproxy.BaseAddon
	mu   sync.Mutex
	conn map[string]string // "METHOD url" -> ClientConn.Id
}

func (p *probe) Requestheaders(f *mproxy.Flow) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.conn == nil {
		p.conn = map[string]string{}
	}
	p.conn[f.Request.Method+" "+f.Request.URL.String()] = f.ConnContext.ClientConn.Id.String()
}

func get(t *testing.T, c *http.Client, u string) {
	t.Helper()
	resp, err := c.Get(u)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("GET %s: %d", u, resp.StatusCode)
	}
}

func markedCount(s *sink) int {
	n := 0
	s.paced.Range(func(any, any) bool { n++; return true })
	return n
}

func hostRPM(host string) int {
	for _, h := range egress.Current().Snapshot() {
		if h.Host == host {
			return h.RPM
		}
	}
	return 0
}

// A marked client (the Bash proxy URL) is paced and counted, through a CONNECT
// tunnel and on plain HTTP; an unmarked one (WebFetch, custom tools, enrich)
// is not paced here. No Proxy-Authorization reaches a target or the recording,
// every exchange is recorded, and a closed connection loses its mark.
func TestBashPacingThroughProxy(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	// 2 req/s, burst 1, no jitter: from the second request on, each waits 500 ms.
	egress.SetProfile(egress.Profile{Name: "test", RPS: 2, Burst: 1, MaxPerHost: 1, MaxGlobal: 8})

	var mu sync.Mutex
	leaked := map[string]string{}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if v := r.Header.Get("Proxy-Authorization"); v != "" {
			mu.Lock()
			leaked[r.URL.Path] = v
			mu.Unlock()
		}
		_, _ = io.WriteString(w, "ok")
	})
	marked := httptest.NewServer(handler)
	defer marked.Close()
	unmarked := httptest.NewServer(handler)
	defer unmarked.Close()
	tlsSrv := httptest.NewTLSServer(handler)
	defer tlsSrv.Close()
	// The MITM leaf for a bare IP has no IP SAN: address the TLS target by name.
	tlsURL := strings.Replace(tlsSrv.URL, "127.0.0.1", "localhost", 1)

	p := &probe{}
	tr, s, proxyURL := startProxy(t, p)
	bash := proxyClient(t, tr, egress.MarkProxyURL(proxyURL))
	plain := proxyClient(t, tr, proxyURL)

	start := time.Now()
	for range 3 {
		get(t, bash, marked.URL+"/bash")
	}
	if d := time.Since(start); d < 900*time.Millisecond {
		t.Fatalf("3 marked requests to one host took %v, want >= 1s of pacing", d)
	}
	if n := hostRPM(strings.TrimPrefix(marked.URL, "http://")); n != 3 {
		t.Fatalf("egress counter for the marked host = %d, want 3", n)
	}
	for range 3 {
		get(t, plain, unmarked.URL+"/plain")
	}
	if n := hostRPM(strings.TrimPrefix(unmarked.URL, "http://")); n != 0 {
		t.Fatalf("unmarked requests were paced by the proxy: counter %d, want 0", n)
	}
	get(t, bash, tlsURL+"/tls1")
	get(t, bash, tlsURL+"/tls2")
	tlsHost := strings.TrimPrefix(tlsURL, "https://")
	if n := hostRPM(tlsHost); n != 2 {
		t.Fatalf("egress counter for the tunnelled host = %d, want 2", n)
	}

	p.mu.Lock()
	connectID := p.conn["CONNECT //"+tlsHost]
	inner1, inner2 := p.conn["GET "+tlsURL+"/tls1"], p.conn["GET "+tlsURL+"/tls2"]
	p.mu.Unlock()
	if connectID == "" || inner1 != connectID || inner2 != connectID {
		t.Fatalf("tunnel flows do not share the CONNECT's connection: connect=%q inner=%q,%q", connectID, inner1, inner2)
	}
	mu.Lock()
	if len(leaked) != 0 {
		t.Fatalf("Proxy-Authorization reached the target: %v", leaked)
	}
	mu.Unlock()

	rows, err := tr.Search("", 0, 100)
	if err != nil || len(rows) != 8 {
		t.Fatalf("recorded %d exchanges (err %v), want 8", len(rows), err)
	}
	for _, r := range rows {
		req, _, err := tr.Get(r.ID)
		if err != nil || strings.Contains(strings.ToLower(req), "proxy-authorization") {
			t.Fatalf("recorded request %s keeps Proxy-Authorization (err %v):\n%s", r.ID, err, req)
		}
	}

	if markedCount(s) == 0 {
		t.Fatal("no connection marked")
	}
	bash.CloseIdleConnections()
	plain.CloseIdleConnections()
	deadline := time.Now().Add(5 * time.Second)
	for markedCount(s) != 0 {
		if time.Now().After(deadline) {
			t.Fatalf("%d marks left after the clients closed", markedCount(s))
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// Off: a marked request is neither paced nor counted.
func TestBashPacingOff(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()
	tr, _, proxyURL := startProxy(t)
	bash := proxyClient(t, tr, egress.MarkProxyURL(proxyURL))
	for range 3 {
		get(t, bash, srv.URL+"/")
	}
	if snap := egress.Current().Snapshot(); len(snap) != 0 {
		t.Fatalf("off counted marked requests: %v", snap)
	}
}

// The sink drops Proxy-Authorization from every request and marks only on the
// pace marker; a disconnect clears the mark.
func TestSinkStripsAndMarks(t *testing.T) {
	prev := egress.CurrentProfile()
	t.Cleanup(func() { egress.SetProfile(prev) })
	egress.SetProfile(egress.Profile{Name: "off"})
	s := &sink{}
	flow := func(method, auth string, conn *mproxy.ClientConn) *mproxy.Flow {
		u, _ := url.Parse("http://a.example/")
		h := http.Header{}
		if auth != "" {
			h.Set("Proxy-Authorization", auth)
		}
		return &mproxy.Flow{Request: &mproxy.Request{Method: method, URL: u, Header: h}, ConnContext: &mproxy.ConnContext{ClientConn: conn}}
	}
	f := flow(http.MethodGet, "Basic dXNlcjpwYXNz", &mproxy.ClientConn{}) // user:pass, not the marker
	s.Requestheaders(f)
	if f.Request.Header.Get("Proxy-Authorization") != "" || markedCount(s) != 0 {
		t.Fatalf("foreign credentials: header %q, marks %d", f.Request.Header.Get("Proxy-Authorization"), markedCount(s))
	}
	conn := &mproxy.ClientConn{}
	conn.Id[0] = 1
	f = flow(http.MethodConnect, "Basic YXJ0ZXgtcGFjZTphcnRleC1wYWNl", conn) // artex-pace:artex-pace
	s.Requestheaders(f)
	if f.Request.Header.Get("Proxy-Authorization") != "" || markedCount(s) != 1 {
		t.Fatalf("marker on CONNECT: header %q, marks %d", f.Request.Header.Get("Proxy-Authorization"), markedCount(s))
	}
	s.ClientDisconnected(conn)
	if markedCount(s) != 0 {
		t.Fatal("mark kept after disconnect")
	}
}
