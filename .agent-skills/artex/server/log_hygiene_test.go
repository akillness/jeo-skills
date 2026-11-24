package server

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
)

// lockedBuffer is a bytes.Buffer that goroutines still logging in the
// background can write to while the test reads it.
type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *lockedBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

// captureLogSink routes the standard logger through a fresh log sink for the
// test, as StartLogCapture does in the binary, and makes it the sink the
// /api/logs endpoints read. passthrough receives what the sink forwards to
// stderr.
func captureLogSink(t *testing.T) (sink *logSinkT, passthrough *lockedBuffer) {
	t.Helper()
	passthrough = &lockedBuffer{}
	sink = &logSinkT{cap: 3000, subs: map[chan LogLine]struct{}{}, out: passthrough}
	prevSink, prevOut := logSink, log.Writer()
	logSink = sink
	log.SetOutput(sink)
	t.Cleanup(func() {
		log.SetOutput(prevOut)
		logSink = prevSink
	})
	return sink, passthrough
}

// sinkText is every line the sink holds, joined.
func sinkText(s *logSinkT) string {
	lines, _ := s.recent(0, 0)
	var b strings.Builder
	for _, l := range lines {
		b.WriteString(l.Text)
		b.WriteByte('\n')
	}
	return b.String()
}

// The setup token claims the instance, and /api/logs serves the log sink to
// any session; the sink (ring, persisted rows, stream) must never hold it.
func TestSetupTokenStaysOutOfLogSink(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	sink, passthrough := captureLogSink(t)
	console := &lockedBuffer{}
	prevConsole := setupTokenOut
	setupTokenOut = console
	t.Cleanup(func() { setupTokenOut = prevConsole })

	s := &Server{m: m, jwtKey: []byte("0123456789abcdef0123456789abcdef"),
		authHashKey: fmt.Sprintf("test.password_hash.%d", time.Now().UnixNano())}
	s.initSetupToken()
	if s.setupToken == "" {
		t.Fatal("no setup token generated while no password is set")
	}
	// The console line is the one the documented `grep "Setup token"` finds.
	if got := console.String(); !strings.Contains(got, "Setup token for the /setup page: "+s.setupToken+"\n") {
		t.Errorf("the server console does not show the setup token: %q", strings.ReplaceAll(got, s.setupToken, "<token>"))
	}
	if got := sinkText(sink); strings.Contains(got, s.setupToken) {
		t.Errorf("the log sink holds the setup token:\n%s", got)
	}
	if got := passthrough.String(); strings.Contains(got, s.setupToken) {
		t.Errorf("the sink forwarded the setup token:\n%s", got)
	}
	// The operator is still told where to find it.
	if got := sinkText(sink); !strings.Contains(got, "[auth] no admin password is set") || !strings.Contains(got, "server console") {
		t.Errorf("the log sink does not say where the setup token was printed:\n%s", got)
	}
}

// A global proxy with user:password is a secret (GET /api/settings masks it).
// Setting it must not put the password into the log sink, the /api/logs and
// /api/logs/history output, the browser MCP row, or the MCP listing.
func TestGlobalProxyCredentialsStayOutOfLogsAndMCPRow(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	if m.pg == nil {
		db.SkipNoPG(t)
	}
	defer m.Close()
	sink, passthrough := captureLogSink(t)
	td := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	s := New(ctx, m, td, td, td) // wires the fresh sink to this database
	defer stopTestServer(t, s, cancel)
	h := s.Handler()
	tok, err := signJWT(s.jwtKey)
	if err != nil {
		t.Fatal(err)
	}
	do := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		return rec
	}

	// Unique per run, so rows an earlier run left in server_logs cannot match.
	stamp := time.Now().UnixNano()
	user, password := fmt.Sprintf("proxyuser%d", stamp), fmt.Sprintf("s3cr3t%d", stamp)
	host := fmt.Sprintf("proxy-%d.test:3128", stamp)
	defer func() { // deferred, not t.Cleanup: it must run before m.Close
		if err := m.SetGlobalProxy(""); err != nil {
			t.Errorf("clear the global proxy: %v", err)
		}
	}()
	if rec := do("PUT", "/api/settings", fmt.Sprintf(`{"global_proxy":"http://%s:%s@%s"}`, user, password, host)); rec.Code != 200 {
		t.Fatalf("PUT /api/settings: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if got := m.GlobalProxy(); !strings.Contains(got, password) {
		t.Fatalf("the global proxy was not stored with its credentials: %q", got)
	}

	// The browser MCP row carries the proxy, without the credentials.
	browser := listMCPByName(t, m.pg, browserMCPName)
	if args := decodeStrSlice(browser.Args); len(args) < 2 || args[len(args)-2] != "--proxy-server" || args[len(args)-1] != "http://"+host {
		t.Errorf("browser MCP args = %s, want them to end with --proxy-server http://%s", browser.Args, host)
	}
	// The sync line is in the sink, and persisted, before the surfaces are read.
	deadline := time.Now().Add(10 * time.Second)
	for persisted := false; !persisted; {
		rows, err := m.pg.RecentLogs(200)
		if err != nil {
			t.Fatal(err)
		}
		for _, row := range rows {
			persisted = persisted || strings.Contains(row.Text, host)
		}
		if !persisted && time.Now().After(deadline) {
			t.Fatalf("no log line that names %s was persisted", host)
		}
		time.Sleep(20 * time.Millisecond)
	}

	surfaces := map[string]string{
		"log sink":              sinkText(sink),
		"stderr passthrough":    passthrough.String(),
		"GET /api/logs":         do("GET", "/api/logs?limit=3000", "").Body.String(),
		"GET /api/logs/history": do("GET", "/api/logs/history?limit=500", "").Body.String(),
		"browser MCP row args":  string(browser.Args),
		"GET /api/mcp":          do("GET", "/api/mcp", "").Body.String(),
	}
	for name, got := range surfaces {
		if strings.Contains(got, password) {
			t.Errorf("%s holds the proxy password", name)
		}
		if !strings.Contains(got, host) {
			t.Errorf("%s does not name the proxy host %s, so this check proves nothing", name, host)
		}
	}
	if args := string(browser.Args); strings.Contains(args, user) {
		t.Errorf("browser MCP args hold the proxy user: %s", args)
	}
}

// A stored global proxy that fails validation is reported at startup; the line
// must not quote the address with its credentials either.
func TestInvalidStoredGlobalProxyIsLoggedWithoutCredentials(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	stamp := time.Now().UnixNano()
	password := fmt.Sprintf("s3cr3t%d", stamp)
	prev, had, err := m.pg.GetSetting(settingGlobalProxy)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { // deferred, not t.Cleanup: it must run before m.Close
		var err error
		if had {
			err = m.pg.SetSetting(settingGlobalProxy, prev)
		} else {
			_, err = m.pg.Exec(`DELETE FROM settings WHERE key=$1`, settingGlobalProxy)
		}
		if err != nil {
			t.Errorf("restore the global proxy setting: %v", err)
		}
		m.syncBrowserMCPProxy()
	}()
	for _, stored := range []string{
		"ftp://proxyuser:" + password + "@badproxy.test:21", // unsupported scheme
		"proxyuser:" + password + "@badproxy.test:3128",     // no scheme: does not parse
	} {
		if err := m.pg.SetSetting(settingGlobalProxy, stored); err != nil {
			t.Fatal(err)
		}
		sink, passthrough := captureLogSink(t)
		// The recording proxy is on, so the stored value is validated at startup.
		m2, err := NewManager(t.TempDir(), "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		got := sinkText(sink)
		browser := listMCPByName(t, m.pg, browserMCPName)
		m2.Close()
		if !strings.Contains(got, "[proxy] global proxy") {
			t.Errorf("stored %q: the invalid proxy was not reported:\n%s", strings.ReplaceAll(stored, password, "***"), got)
		}
		for name, text := range map[string]string{"log sink": got, "stderr passthrough": passthrough.String(), "browser MCP row args": string(browser.Args)} {
			if strings.Contains(text, password) {
				t.Errorf("stored %q: %s holds the proxy password", strings.ReplaceAll(stored, password, "***"), name)
			}
		}
	}
}

func TestProxyWithoutCredentials(t *testing.T) {
	for raw, want := range map[string]string{
		"":                                     "",
		"http://127.0.0.1:8788":                "http://127.0.0.1:8788",
		"http://user:pass@proxy.test:3128":     "http://proxy.test:3128",
		"socks5://user@proxy.test:1080":        "socks5://proxy.test:1080",
		" https://u:p%40ss@proxy.test:8443/ ":  "https://proxy.test:8443/",
		"http://user:pa:ss@[2001:db8::1]:3128": "http://[2001:db8::1]:3128",
		"user:pass@proxy.test:3128":            "", // no scheme: does not parse
		"http://user:pass@proxy.test:notaport": "",
		"http://user:pa ss@proxy.test:3128":    "",
		"//user:pass@proxy.test:3128":          "//proxy.test:3128",
	} {
		if got := proxyWithoutCredentials(raw); got != want {
			t.Errorf("proxyWithoutCredentials(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestMaskURLCredentials(t *testing.T) {
	for in, want := range map[string]string{
		"plain line, no URL":                                  "plain line, no URL",
		"proxy http://user:pass@proxy.test:3128 attached":     "proxy http://user:xxxxx@proxy.test:3128 attached",
		`global proxy "socks5://u:p@h:1080" invalid`:          `global proxy "socks5://u:xxxxx@h:1080" invalid`,
		"dsn postgres://artex:pw@/db?host=/tmp/sock":          "dsn postgres://artex:xxxxx@/db?host=/tmp/sock",
		"a password with @ and : http://user:p@ss:w0rd@h:1/x": "a password with @ and : http://user:xxxxx@h:1/x",
		"two http://a:b@h1 and https://c:d@h2/p":              "two http://a:xxxxx@h1 and https://c:xxxxx@h2/p",
		"an empty user http://:secret@h:1":                    "an empty user http://:xxxxx@h:1",
		// No password: nothing to mask, and nothing mistaken for one.
		"user only ssh://git@github.com/org/repo":               "user only ssh://git@github.com/org/repo",
		"host and port http://127.0.0.1:8787/api?mail=a@b.test": "host and port http://127.0.0.1:8787/api?mail=a@b.test",
		"query without a path http://h:8787?mail=a@b.test":      "query without a path http://h:8787?mail=a@b.test",
		"IPv6 http://[::1]:8787/x@y":                            "IPv6 http://[::1]:8787/x@y",
		"see https://docs.test:8443 or mail ops@corp.test":      "see https://docs.test:8443 or mail ops@corp.test",
	} {
		if got := maskURLCredentials(in); got != want {
			t.Errorf("maskURLCredentials(%q) = %q, want %q", in, got, want)
		}
	}
}

// The sink masks what it keeps and what it forwards to stderr.
func TestLogSinkMasksURLCredentials(t *testing.T) {
	sink, passthrough := captureLogSink(t)
	log.Printf("[proxy] upstream %s refused", "http://user:hunter2@proxy.test:3128")
	for name, got := range map[string]string{"ring": sinkText(sink), "stderr passthrough": passthrough.String()} {
		if strings.Contains(got, "hunter2") || !strings.Contains(got, "[proxy] upstream http://user:xxxxx@proxy.test:3128 refused") {
			t.Errorf("%s = %q, want the password masked", name, got)
		}
	}
}

// Rows persisted before the sink masked credentials are masked when they are
// read back: by GET /api/logs/history and by the restore into the ring.
func TestLogsHistoryMasksCredentialsInOldRows(t *testing.T) {
	m, err := NewManager(t.TempDir(), "")
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer m.Close()
	password := fmt.Sprintf("oldpw%d", time.Now().UnixNano())
	id, err := m.pg.InsertLog("info", "mcp", "[mcp] browser MCP now has the capture proxy http://olduser:"+password+"@old.test:3128 attached (CA )")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = m.pg.Exec(`DELETE FROM server_logs WHERE id=$1`, id) }() // before m.Close

	s := &Server{m: m}
	rec := httptest.NewRecorder()
	s.getLogsHistory(rec, httptest.NewRequest("GET", "/api/logs/history?limit=500", nil))
	if body := rec.Body.String(); rec.Code != 200 || strings.Contains(body, password) || !strings.Contains(body, "http://olduser:xxxxx@old.test:3128") {
		t.Errorf("GET /api/logs/history: status=%d, want the old row with its password masked; password present=%v", rec.Code, strings.Contains(body, password))
	}

	sink := &logSinkT{cap: 3000, subs: map[chan LogLine]struct{}{}, out: &lockedBuffer{}}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	sink.SetDB(ctx, m.pg)
	if got := sinkText(sink); strings.Contains(got, password) || !strings.Contains(got, "http://olduser:xxxxx@old.test:3128") {
		t.Errorf("restored ring: want the old row with its password masked; password present=%v", strings.Contains(got, password))
	}
}
