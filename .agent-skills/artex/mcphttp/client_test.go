package mcphttp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// A Streamable HTTP server whose slow_call tool takes 3s, so the client's
// per-request timeout can be observed: 1s cuts the call off, 10s lets it finish.
func TestStreamableClientRequestTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req rpcRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "initialize":
			fmt.Fprintf(w, `{"jsonrpc":"2.0","id":%d,"result":{"protocolVersion":"2025-06-18","capabilities":{},"serverInfo":{"name":"t","version":"0"}}}`, req.ID)
		case "notifications/initialized":
			w.WriteHeader(http.StatusAccepted)
		case "tools/list":
			fmt.Fprintf(w, `{"jsonrpc":"2.0","id":%d,"result":{"tools":[{"name":"slow_call","description":"slow","inputSchema":{"type":"object"}}]}}`, req.ID)
		case "tools/call":
			time.Sleep(3 * time.Second)
			fmt.Fprintf(w, `{"jsonrpc":"2.0","id":%d,"result":{"content":[{"type":"text","text":"done"}]}}`, req.ID)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// timeout_seconds=1: the slow call is cut off well before the server answers.
	c, err := New(ctx, "t", srv.URL, nil, false, 1)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if _, err := c.Tools(ctx); err != nil {
		t.Fatalf("tools/list: %v", err)
	}
	start := time.Now()
	if _, err := c.Call(ctx, "slow_call", nil); err == nil {
		t.Fatal("expected the 1s-timeout call to fail")
	} else if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("call not cut off by the timeout: %v", elapsed)
	}
	_ = c.Close()

	// timeout_seconds=10: the same slow call completes.
	c2, err := New(ctx, "t", srv.URL, nil, false, 10)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	got, err := c2.Call(ctx, "slow_call", nil)
	if err != nil || got != "done" {
		t.Fatalf("Call() = %q, %v", got, err)
	}
	_ = c2.Close()

	// timeout_seconds=0: falls back to the 120s default (call completes).
	c3, err := New(ctx, "t", srv.URL, nil, false, 0)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if got, err := c3.Call(ctx, "slow_call", nil); err != nil || got != "done" {
		t.Fatalf("default-timeout Call() = %q, %v", got, err)
	}
	_ = c3.Close()
}

// initRequest captures what the client sent for one MCP request.
type initRequest struct {
	method, header, bodyVersion string
}

func recordRequest(r *http.Request) (rpcRequest, initRequest) {
	var req rpcRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	rec := initRequest{method: req.Method, header: r.Header.Get("MCP-Protocol-Version")}
	if p, ok := req.Params.(map[string]any); ok {
		rec.bodyVersion, _ = p["protocolVersion"].(string)
	}
	return req, rec
}

// TestStreamableClientProtocolVersions uses spec-shaped servers that each support
// one version: they answer initialize with their own version, accept a request
// without MCP-Protocol-Version, and reject any other header value. The client
// must send no version header on initialize and the negotiated one afterwards.
func TestStreamableClientProtocolVersions(t *testing.T) {
	for _, supported := range []string{"2025-11-25", "2025-06-18", "2025-03-26"} {
		t.Run(supported, func(t *testing.T) {
			var seen []initRequest
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				req, rec := recordRequest(r)
				seen = append(seen, rec)
				if rec.header != "" && rec.header != supported {
					w.WriteHeader(http.StatusBadRequest)
					fmt.Fprint(w, `{"code":"UNSUPPORTED_PROTOCOL_VERSION"}`)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				switch req.Method {
				case "initialize":
					fmt.Fprintf(w, `{"jsonrpc":"2.0","id":%d,"result":{"protocolVersion":%q,"capabilities":{},"serverInfo":{"name":"t","version":"0"}}}`, req.ID, supported)
				case "notifications/initialized":
					w.WriteHeader(http.StatusAccepted)
				case "tools/list":
					fmt.Fprintf(w, `{"jsonrpc":"2.0","id":%d,"result":{"tools":[]}}`, req.ID)
				default:
					http.NotFound(w, r)
				}
			}))
			defer srv.Close()

			c, err := New(context.Background(), "t", srv.URL, nil, false, 0)
			if err != nil {
				t.Fatalf("connect: %v", err)
			}
			defer c.Close()
			if _, err := c.Tools(context.Background()); err != nil {
				t.Fatalf("tools/list: %v", err)
			}
			if c.protocol != supported {
				t.Fatalf("negotiated protocol = %q", c.protocol)
			}
			var inits int
			for _, rec := range seen {
				if rec.method == "initialize" {
					inits++
					if rec.header != "" {
						t.Fatalf("initialize carried MCP-Protocol-Version %q", rec.header)
					}
					if rec.bodyVersion != protocolVersion {
						t.Fatalf("initialize offered %q, want %q", rec.bodyVersion, protocolVersion)
					}
					continue
				}
				if rec.header != supported {
					t.Fatalf("%s carried MCP-Protocol-Version %q, want %q", rec.method, rec.header, supported)
				}
			}
			if inits != 1 {
				t.Fatalf("initialize attempts = %d, want 1", inits)
			}
		})
	}
}

// TestStreamableClientVersionRejectionForms keeps the fallback loop honest for
// servers that reject the initialize body version instead of negotiating: an
// HTTP 400 "Unsupported protocol version", the JSON-RPC -32602 error from the
// spec's example, and an unrelated failure that must not trigger a retry.
func TestStreamableClientVersionRejectionForms(t *testing.T) {
	cases := []struct {
		name     string
		reject   func(w http.ResponseWriter, id int)
		fallback bool
	}{
		{"http 400", func(w http.ResponseWriter, _ int) {
			http.Error(w, "Bad Request: Unsupported protocol version", http.StatusBadRequest)
		}, true},
		{"json-rpc -32602", func(w http.ResponseWriter, id int) {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"jsonrpc":"2.0","id":%d,"error":{"code":-32602,"message":"Unsupported protocol version","data":{"supported":["2025-06-18"],"requested":"2025-11-25"}}}`, id)
		}, true},
		{"unrelated 401", func(w http.ResponseWriter, _ int) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
		}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var inits []initRequest
			var after []initRequest
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				req, rec := recordRequest(r)
				if req.Method == "initialize" {
					inits = append(inits, rec)
					if rec.bodyVersion != "2025-06-18" {
						tc.reject(w, req.ID)
						return
					}
				} else {
					after = append(after, rec)
				}
				w.Header().Set("Content-Type", "application/json")
				switch req.Method {
				case "initialize":
					fmt.Fprintf(w, `{"jsonrpc":"2.0","id":%d,"result":{"protocolVersion":"2025-06-18","capabilities":{},"serverInfo":{"name":"t","version":"0"}}}`, req.ID)
				case "notifications/initialized":
					w.WriteHeader(http.StatusAccepted)
				default:
					http.NotFound(w, r)
				}
			}))
			defer srv.Close()

			c, err := New(context.Background(), "t", srv.URL, nil, false, 0)
			for _, rec := range inits {
				if rec.header != "" {
					t.Fatalf("initialize carried MCP-Protocol-Version %q", rec.header)
				}
			}
			if !tc.fallback {
				if err == nil {
					_ = c.Close()
					t.Fatal("expected connect error")
				}
				if len(inits) != 1 {
					t.Fatalf("unrelated error retried: %d initialize attempts", len(inits))
				}
				return
			}
			if err != nil {
				t.Fatalf("connect: %v", err)
			}
			defer c.Close()
			if len(inits) != 2 || inits[0].bodyVersion != protocolVersion || inits[1].bodyVersion != "2025-06-18" {
				t.Fatalf("fallback attempts = %+v", inits)
			}
			if c.protocol != "2025-06-18" {
				t.Fatalf("negotiated protocol = %q", c.protocol)
			}
			if len(after) == 0 || after[0].method != "notifications/initialized" || after[0].header != "2025-06-18" {
				t.Fatalf("requests after initialize = %+v", after)
			}
		})
	}
}

func TestDecodeRPCCapsBody(t *testing.T) {
	ok := `{"jsonrpc":"2.0","id":1,"result":{}}`
	got, err := decodeRPC(strings.NewReader(ok))
	if err != nil || got == nil || got.ID != 1 {
		t.Fatalf("small body: got=%+v err=%v", got, err)
	}
	if _, err := decodeRPC(strings.NewReader(strings.Repeat("x", mcpMaxRPCBytes+1))); err == nil {
		t.Fatal("oversize body must fail")
	}
}

func TestParseSSECapsPayload(t *testing.T) {
	chunk := strings.Repeat("a", 64*1024)
	var b strings.Builder
	for b.Len() <= mcpMaxRPCBytes {
		b.WriteString("data: ")
		b.WriteString(chunk)
		b.WriteByte('\n')
	}
	b.WriteByte('\n')
	if _, err := parseSSE(strings.NewReader(b.String()), 1); err == nil {
		t.Fatal("oversize SSE payload must fail")
	}
}
