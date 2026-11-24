package server

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/traffic"
)

// ProxyAddr is the one source of truth for "is there a proxy in the path":
// the recording proxy while capture is on, the global proxy otherwise.
func TestProxyAddrCoversRecordingAndGlobal(t *testing.T) {
	m := &Manager{}
	if got := m.ProxyAddr(); got != "" {
		t.Fatalf("empty manager ProxyAddr = %q", got)
	}
	m.globalProxy = "http://127.0.0.1:9"
	if got := m.ProxyAddr(); got != m.globalProxy {
		t.Fatalf("global ProxyAddr = %q", got)
	}

	tr, err := traffic.Open(t.TempDir(), "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer tr.Close()
	m.traffic = tr
	m.trafficOn = true
	if got := m.ProxyAddr(); got == "" {
		t.Fatal("recording proxy not returned by ProxyAddr")
	}
}

// A custom http tool with its own proxy cannot enforce an approved IP; a
// recording-proxy tool counts only when a proxy address is actually in the path.
func TestToolUsesProxy(t *testing.T) {
	g := newGateServer(t)
	pg := g.m.pg
	suffix := fmt.Sprintf("_%d", time.Now().UnixNano())
	add := func(key, kind string, exec map[string]any) string {
		t.Helper()
		key += suffix
		raw, err := json.Marshal(exec)
		if err != nil {
			t.Fatal(err)
		}
		if err := pg.CreateCustomTool(&db.Tool{Key: key, Kind: kind, Enabled: true, Exec: raw}); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = pg.DeleteCustomTool(key) })
		return key
	}

	proxied := add("t_proxy_http", "http", map[string]any{
		"url": "http://example.com/", "proxy": "http://127.0.0.1:9"})
	direct := add("t_direct_http", "http", map[string]any{"url": "http://example.com/"})
	recording := add("t_rec_http", "http", map[string]any{
		"url": "http://example.com/", "use_recording_proxy": true})
	command := add("t_proxy_cmd", "command", map[string]any{
		"command": "curl http://example.com/", "proxy": "http://127.0.0.1:9"})

	if !g.m.toolUsesProxy(proxied) {
		t.Fatal("per-tool proxy not detected")
	}
	if g.m.toolUsesProxy(direct) {
		t.Fatal("direct http tool reported as proxied")
	}
	if g.m.toolUsesProxy(recording) {
		t.Fatal("recording tool reported as proxied with capture off and no global proxy")
	}
	if g.m.toolUsesProxy(command) {
		t.Fatal("command tool reported as proxied")
	}
	if g.m.toolUsesProxy("t_missing" + suffix) {
		t.Fatal("missing tool reported as proxied")
	}

	// With a proxy address in the path, the recording flag counts.
	g.m.globalProxy = "http://127.0.0.1:9"
	if !g.m.toolUsesProxy(recording) {
		t.Fatal("recording tool not proxied with a global proxy")
	}
}
