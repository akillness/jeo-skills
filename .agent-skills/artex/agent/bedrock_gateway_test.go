package agent

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/Autumn-27/norma/llm"
	"github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream"
)

func TestBedrockGatewayCompleteAndStream(t *testing.T) {
	const token = "synthetic-test-token"
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != http.MethodPost || !strings.HasPrefix(r.URL.Path, "/bedrock/model/test.model/invoke") {
			t.Errorf("path = %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer "+token {
			t.Errorf("auth = %q", got)
		}
		if got := r.Header.Get("X-Example-Route"); got != "demo" {
			t.Errorf("custom header = %q", got)
		}
		if got := r.Header.Get("X-Api-Key"); got != "" {
			t.Errorf("unexpected x-api-key")
		}
		var body map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if _, ok := body["model"]; ok {
			t.Error("model remained in body")
		}
		if _, ok := body["stream"]; ok {
			t.Error("stream remained in body")
		}
		if string(body["anthropic_version"]) != `"bedrock-2023-05-31"` {
			t.Errorf("version = %s", body["anthropic_version"])
		}
		if !strings.Contains(r.URL.Path, "response-stream") {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"type":"message","content":[{"type":"text","text":"done"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}`))
			return
		}
		w.Header().Set("Content-Type", "application/vnd.amazon.eventstream")
		enc := eventstream.NewEncoder()
		for i, payload := range []string{
			`{"type":"message_start","message":{"usage":{"input_tokens":1,"output_tokens":0}}}`,
			`{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
			`{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"streamed"}}`,
			`{"type":"content_block_stop","index":0}`,
			`{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool-1","name":"lookup","input":{}}}`,
			`{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"q\":\"x\"}"}}`,
			`{"type":"content_block_stop","index":1}`,
			`{"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":1}}`,
			`{"type":"message_stop"}`,
		} {
			if i == 0 {
				payload = `{"bytes":"` + base64.StdEncoding.EncodeToString([]byte(payload)) + `"}`
			}
			err := enc.Encode(w, eventstream.Message{Headers: eventstream.Headers{{Name: ":message-type", Value: eventstream.StringValue("event")}, {Name: ":event-type", Value: eventstream.StringValue("chunk")}}, Payload: []byte(payload)})
			if err != nil {
				t.Error(err)
			}
		}
	}))
	defer server.Close()
	cfg := ConfigFrom("bedrock-gateway", "test.model", server.URL+"/bedrock", token, "")
	cfg.CustomHeaders = "X-Example-Route: demo"
	p, err := cfg.NewProvider()
	if err != nil {
		t.Fatal(err)
	}
	req := llm.CompletionRequest{Messages: []llm.Message{llm.UserText("hello")}}
	msg, _, _, err := p.Complete(context.Background(), req)
	if err != nil || msg.Text() != "done" {
		t.Fatalf("complete: %q, %v", msg.Text(), err)
	}
	var streamed, toolName, toolInput string
	for ev, err := range p.Stream(context.Background(), req) {
		if err != nil {
			t.Fatal(err)
		}
		switch ev.Type {
		case llm.SETextDelta:
			streamed += ev.Text
		case llm.SEToolUseStart:
			toolName = ev.ToolName
		case llm.SEToolInputJSON:
			toolInput += ev.Text
		}
	}
	if streamed != "streamed" || toolName != "lookup" || toolInput != `{"q":"x"}` || calls.Load() != 2 {
		t.Fatalf("stream = %q, tool = %q %q, calls = %d", streamed, toolName, toolInput, calls.Load())
	}
}

func TestBedrockGatewayStreamExceptionIsAnError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/vnd.amazon.eventstream")
		_ = eventstream.NewEncoder().Encode(w, eventstream.Message{Headers: eventstream.Headers{{Name: ":message-type", Value: eventstream.StringValue("exception")}, {Name: ":event-type", Value: eventstream.StringValue("validationException")}}, Payload: []byte(`{"message":"synthetic-secret"}`)})
	}))
	defer server.Close()
	cfg := ConfigFrom("bedrock-gateway", "test.model", server.URL, "synthetic-token", "")
	p, err := cfg.NewProvider()
	if err != nil {
		t.Fatal(err)
	}
	var sawError bool
	for _, err := range p.Stream(context.Background(), llm.CompletionRequest{Messages: []llm.Message{llm.UserText("hello")}}) {
		if err != nil {
			sawError = true
			if strings.Contains(err.Error(), "synthetic-secret") {
				t.Fatal("stream exception exposed gateway response body")
			}
		}
	}
	if !sawError {
		t.Fatal("stream exception was treated as success")
	}
}

func TestBedrockGatewayErrorBodyIsRedacted(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"echoed synthetic-token and private-route"}`))
	}))
	defer server.Close()
	cfg := ConfigFrom("bedrock-gateway", "test.model", server.URL+"/private-route", "synthetic-token", "")
	cfg.Stream = false
	_, _, err := TestConnection(context.Background(), cfg)
	if err == nil || !strings.Contains(err.Error(), "HTTP 401") || strings.Contains(err.Error(), "synthetic-token") || strings.Contains(err.Error(), "private-route") {
		t.Fatalf("unsafe connection error: %v", err)
	}
}

func TestBedrockGatewayQuotaClassificationAfterRedaction(t *testing.T) {
	for _, tc := range []struct {
		name, upstreamBody string
		wantStatus         int
	}{
		{"exhausted", `{"message":"quota_exceeded synthetic-secret"}`, http.StatusPaymentRequired},
		{"transient", `{"message":"rate limit reached synthetic-secret"}`, http.StatusTooManyRequests},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte(tc.upstreamBody))
			}))
			defer server.Close()
			transport := quotaAwareTransport{base: &bedrockGatewayTransport{
				base: http.DefaultTransport, baseURL: server.URL, token: "synthetic-token", model: "test.model",
			}}
			req, err := http.NewRequest(http.MethodPost, server.URL+"/v1/messages", strings.NewReader(`{"stream":false}`))
			if err != nil {
				t.Fatal(err)
			}
			resp, err := transport.RoundTrip(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			if err != nil || resp.StatusCode != tc.wantStatus || strings.Contains(string(body), "synthetic-secret") {
				t.Fatalf("status=%d body=%q err=%v", resp.StatusCode, body, err)
			}
		})
	}
}

func TestBedrockGatewayDoesNotFollowRedirectWithToken(t *testing.T) {
	var redirected atomic.Bool
	other := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { redirected.Store(true) }))
	defer other.Close()
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL, http.StatusTemporaryRedirect)
	}))
	defer first.Close()
	cfg := ConfigFrom("bedrock-gateway", "test.model", first.URL, "synthetic-token", "")
	p, err := cfg.NewProvider()
	if err != nil {
		t.Fatal(err)
	}
	_, _, _, err = p.Complete(context.Background(), llm.CompletionRequest{Messages: []llm.Message{llm.UserText("hello")}})
	if err == nil || redirected.Load() {
		t.Fatal("redirect followed or treated as success")
	}
}

func TestBedrockGatewayEscapesModelARN(t *testing.T) {
	const model = "arn:aws:bedrock:region:123456789012:foundation-model/test.model"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.EscapedPath(), "foundation-model%2Ftest.model") {
			t.Errorf("model path not escaped: %s", r.URL.EscapedPath())
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"type":"message","content":[{"type":"text","text":"OK"}],"stop_reason":"end_turn"}`))
	}))
	defer server.Close()
	cfg := ConfigFrom("bedrock-gateway", model, server.URL, "synthetic-token", "")
	p, err := cfg.NewProvider()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := p.Complete(context.Background(), llm.CompletionRequest{Messages: []llm.Message{llm.UserText("hello")}}); err != nil {
		t.Fatal(err)
	}
}

func TestBedrockGatewayRejectsUnsafeConfig(t *testing.T) {
	for _, cfg := range []Config{
		ConfigFrom("bedrock-gateway", "model", "", "token", ""),
		ConfigFrom("bedrock-gateway", "model", "https://example.com", "", ""),
		ConfigFrom("bedrock-gateway", "model", "https://example.com", "token", ""),
	} {
		if cfg.BaseURL != "" && cfg.APIKey != "" {
			cfg.CustomHeaders = "Authorization: stolen"
		}
		if _, err := cfg.NewProvider(); err == nil {
			t.Errorf("accepted unsafe config: %+v", cfg)
		}
	}
	if _, err := ParseBedrockGatewayHeaders("X-Test: ok\nInjected: x\r\nBad: y\x00"); err == nil {
		t.Fatal("accepted control characters")
	}
}
