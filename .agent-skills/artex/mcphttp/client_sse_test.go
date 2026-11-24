package mcphttp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestLegacySSEClientDiscoverAndCall(t *testing.T) {
	var mu sync.Mutex
	var stream http.ResponseWriter
	var flusher http.Flusher
	sessions := make(map[string]bool)
	messages := make(chan []byte, 8)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/sse":
			id := "test-session"
			mu.Lock()
			sessions[id] = true
			stream, flusher = w, w.(http.Flusher)
			mu.Unlock()
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			fmt.Fprintf(w, "event: endpoint\ndata: %s/message?sessionId=%s\n\n", "http://"+r.Host, id)
			flusher.Flush()
			for {
				select {
				case payload := <-messages:
					fmt.Fprintf(w, "event: message\ndata: %s\n\n", payload)
					flusher.Flush()
				case <-r.Context().Done():
					return
				}
			}
		case "/message":
			mu.Lock()
			knownSession := sessions["test-session"]
			mu.Unlock()
			if r.URL.Query().Get("sessionId") != "test-session" || !knownSession {
				http.Error(w, "unknown session", http.StatusBadRequest)
				return
			}
			var req rpcRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusAccepted)
			if req.ID == 0 {
				return
			}
			var result any
			switch req.Method {
			case "initialize":
				result = map[string]any{"protocolVersion": "2024-11-05", "capabilities": map[string]any{"tools": map[string]any{}}, "serverInfo": map[string]any{"name": "test", "version": "1"}}
			case "tools/list":
				result = map[string]any{"tools": []any{map[string]any{"name": "echo", "description": "echo input", "inputSchema": map[string]any{"type": "object"}}}}
			case "tools/call":
				result = map[string]any{"content": []any{map[string]any{"type": "text", "text": "ok"}}}
			default:
				result = map[string]any{}
			}
			resultJSON, err := json.Marshal(result)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			payload, _ := json.Marshal(rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: json.RawMessage(resultJSON)})
			mu.Lock()
			streamReady := stream != nil
			mu.Unlock()
			if streamReady {
				messages <- payload
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, err := NewSSE(ctx, "test", srv.URL+"/sse", map[string]string{"Authorization ": "Bearer test"}, false)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	tools, err := c.Tools(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 1 || !strings.Contains(tools[0].Name(), "echo") {
		t.Fatalf("unexpected tools: %#v", tools)
	}
	got, err := c.Call(ctx, "echo", map[string]any{"value": "x"})
	if err != nil || got != "ok" {
		t.Fatalf("Call() = %q, %v", got, err)
	}
}

func TestReadSSEEndpointSameOrigin(t *testing.T) {
	base, err := url.Parse("https://mcp.example.com:8443/sse")
	if err != nil {
		t.Fatal(err)
	}
	read := func(line string) (string, error) {
		stream := "event: endpoint\ndata: " + line + "\n\n"
		return readSSEEndpoint(bufio.NewReader(strings.NewReader(stream)), base)
	}
	for _, line := range []string{
		"/message?sessionId=1",
		"https://mcp.example.com:8443/message",
		"HTTPS://MCP.EXAMPLE.COM:8443/message",
		"//mcp.example.com:8443/message",
	} {
		got, err := read(line)
		if err != nil {
			t.Errorf("%q: %v", line, err)
			continue
		}
		u, err := url.Parse(got)
		if err != nil || !sameOrigin(base, u) {
			t.Errorf("%q: resolved to %q, not the configured origin", line, got)
		}
	}
	for _, line := range []string{
		"https://evil.example/message",
		"http://mcp.example.com:8443/message",
		"https://mcp.example.com:444/message",
		"//evil.example/message",
		"http://user:pass@mcp.example.com:8443/message",
		"ftp://mcp.example.com/message",
	} {
		if got, err := read(line); err == nil {
			t.Errorf("%q: accepted as %q, want a refusal", line, got)
		}
	}
}

func TestReadSSEEndpointDefaultPort(t *testing.T) {
	base, err := url.Parse("https://mcp.example.com/sse")
	if err != nil {
		t.Fatal(err)
	}
	stream := "data: https://mcp.example.com:443/message\n\n"
	if _, err := readSSEEndpoint(bufio.NewReader(strings.NewReader(stream)), base); err != nil {
		t.Fatalf("explicit default port refused: %v", err)
	}
}

func TestParseMCPURL(t *testing.T) {
	for _, raw := range []string{"ftp://x/y", "not-a-url", "http:///nohost", ""} {
		if _, err := parseMCPURL(raw); err == nil {
			t.Errorf("%q accepted, want a refusal", raw)
		}
	}
	for _, raw := range []string{"http://x/y", "https://x:8443/y"} {
		if _, err := parseMCPURL(raw); err != nil {
			t.Errorf("%q refused: %v", raw, err)
		}
	}
}

func TestLegacySSERefusesCrossOriginEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "event: endpoint\ndata: http://evil.invalid/message\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := NewSSE(ctx, "test", srv.URL+"/sse", nil, false); err == nil {
		t.Fatal("cross-origin SSE endpoint accepted")
	}
}

func TestMCPClientRefusesCrossOriginRedirect(t *testing.T) {
	var hits int
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
	}))
	defer target.Close()
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL+"/steal", http.StatusFound)
	}))
	defer src.Close()

	base, err := url.Parse(src.URL + "/sse")
	if err != nil {
		t.Fatal(err)
	}
	hc := &http.Client{CheckRedirect: redirectPolicy(base)}
	resp, err := hc.Get(src.URL + "/sse")
	if err == nil {
		resp.Body.Close()
		t.Fatal("cross-origin redirect accepted")
	}
	if hits != 0 {
		t.Fatalf("redirect target was reached %d times", hits)
	}
}

func TestMCPClientAllowsSameOriginRedirect(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/sse", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/sse2", http.StatusFound)
	})
	mux.HandleFunc("/sse2", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	base, err := url.Parse(srv.URL + "/sse")
	if err != nil {
		t.Fatal(err)
	}
	hc := &http.Client{CheckRedirect: redirectPolicy(base)}
	resp, err := hc.Get(srv.URL + "/sse")
	if err != nil {
		t.Fatalf("same-origin redirect refused: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
}
