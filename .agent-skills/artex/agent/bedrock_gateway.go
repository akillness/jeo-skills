package agent

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/textproto"
	"net/url"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream"
)

// BedrockGatewayHeaders are newline-separated HTTP headers, stored encrypted with
// the profile. The bearer token is held separately in the existing API key field.
func ParseBedrockGatewayHeaders(raw string) (http.Header, error) {
	h := make(http.Header)
	if len(raw) > 8192 {
		return nil, errors.New("custom headers exceed 8 KiB")
	}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSuffix(line, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}
		if len(h) >= 20 {
			return nil, errors.New("too many custom headers")
		}
		name, value, ok := strings.Cut(line, ":")
		name = strings.TrimSpace(name)
		value = strings.TrimSpace(value)
		if !ok || !validHeaderName(name) || !validHeaderValue(value) {
			return nil, errors.New("invalid custom header")
		}
		switch strings.ToLower(name) {
		case "authorization", "proxy-authorization", "host", "x-api-key", "content-type", "accept", "content-length", "transfer-encoding", "connection", "proxy-connection", "keep-alive", "te", "trailer", "upgrade", "cookie", "anthropic-version", "x-amzn-bedrock-accept", "x-amzn-bedrock-content-type":
			return nil, fmt.Errorf("custom header %q is reserved", name)
		}
		name = textproto.CanonicalMIMEHeaderKey(name)
		if _, exists := h[name]; exists {
			return nil, fmt.Errorf("duplicate custom header %q", name)
		}
		h.Set(name, value)
	}
	return h, nil
}

func validHeaderName(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range []byte(s) {
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || strings.ContainsRune("!#$%&'*+-.^_`|~", rune(c))) {
			return false
		}
	}
	return true
}

func validHeaderValue(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range []byte(s) {
		if c < 0x20 || c == 0x7f {
			return false
		}
	}
	return true
}

func validateBedrockGateway(baseURL, token, model, headers string) (http.Header, error) {
	u, err := url.Parse(baseURL)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"))) {
		return nil, errors.New("Bedrock gateway requires an HTTPS base URL (HTTP only for localhost)")
	}
	if !validHeaderValue(strings.TrimSpace(token)) {
		return nil, errors.New("Bedrock gateway requires a bearer token")
	}
	if strings.TrimSpace(model) == "" || strings.ContainsAny(model, "?#\r\n") {
		return nil, errors.New("Bedrock gateway requires a valid model ID")
	}
	return ParseBedrockGatewayHeaders(headers)
}

// bedrockGatewayTransport adapts Norma's Anthropic Messages request/response
// to Bedrock InvokeModel. It never changes the destination host.
type bedrockGatewayTransport struct {
	base    http.RoundTripper
	baseURL string
	token   string
	model   string
	headers http.Header
}

func (t *bedrockGatewayTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Path != strings.TrimRight(mustURLPath(t.baseURL), "/")+"/v1/messages" {
		return nil, errors.New("unexpected Bedrock gateway request path")
	}
	raw, err := io.ReadAll(req.Body)
	_ = req.Body.Close()
	if err != nil {
		return nil, err
	}
	var body map[string]json.RawMessage
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, err
	}
	var streaming bool
	if err := json.Unmarshal(body["stream"], &streaming); err != nil {
		return nil, errors.New("missing stream mode")
	}
	delete(body, "stream")
	delete(body, "model")
	body["anthropic_version"] = json.RawMessage(`"bedrock-2023-05-31"`)
	raw, err = json.Marshal(body)
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(t.baseURL)
	basePath, escapedBasePath := strings.TrimRight(u.Path, "/"), strings.TrimRight(u.EscapedPath(), "/")
	u.Path = basePath + "/model/" + t.model + "/invoke"
	u.RawPath = escapedBasePath + "/model/" + url.PathEscape(t.model) + "/invoke"
	if streaming {
		u.Path += "-with-response-stream"
		u.RawPath += "-with-response-stream"
	}
	q := req.Clone(req.Context())
	q.URL = u
	q.Host = u.Host
	q.Body = io.NopCloser(bytes.NewReader(raw))
	q.ContentLength = int64(len(raw))
	q.GetBody = func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(raw)), nil }
	q.Header = req.Header.Clone()
	q.Header.Del("x-api-key")
	q.Header.Del("anthropic-version")
	q.Header.Set("Authorization", "Bearer "+t.token)
	q.Header.Set("Content-Type", "application/json")
	q.Header.Set("X-Amzn-Bedrock-Accept", "application/json")
	q.Header.Set("Accept", "application/json")
	if streaming {
		q.Header.Set("Accept", "application/vnd.amazon.eventstream")
	}
	for name, values := range t.headers {
		q.Header[name] = append([]string(nil), values...)
	}
	resp, err := t.base.RoundTrip(q)
	if err != nil {
		return resp, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Gateways may echo authorization material in error bodies or headers.
		// Keep the status for callers and retries without exposing that echo.
		// Preserve only the quota classification used by the outer transport.
		quotaExhausted := false
		if resp.StatusCode == http.StatusTooManyRequests {
			raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
			quotaExhausted = IsQuotaExhaustedMessage(string(raw))
		}
		_ = resp.Body.Close()
		message := fmt.Sprintf("Bedrock gateway returned HTTP %d", resp.StatusCode)
		if quotaExhausted {
			message += ": quota_exceeded"
		}
		body := []byte(fmt.Sprintf(`{"message":%q}`, message))
		copy := *resp
		copy.Body = io.NopCloser(bytes.NewReader(body))
		copy.ContentLength = int64(len(body))
		copy.Header = make(http.Header)
		copy.Header.Set("Content-Type", "application/json")
		if retryAfter := resp.Header.Get("Retry-After"); retryAfter != "" {
			copy.Header.Set("Retry-After", retryAfter)
		}
		return &copy, nil
	}
	if !streaming {
		return resp, nil
	}
	if !strings.HasPrefix(strings.ToLower(resp.Header.Get("Content-Type")), "application/vnd.amazon.eventstream") {
		resp.Body.Close()
		return nil, errors.New("Bedrock gateway returned a non-eventstream response")
	}
	reader, writer := io.Pipe()
	go func() {
		defer resp.Body.Close()
		defer writer.Close()
		decoder := eventstream.NewDecoder()
		for {
			frame, err := decoder.Decode(resp.Body, nil)
			if err == io.EOF {
				return
			}
			if err != nil {
				writer.CloseWithError(err)
				return
			}
			if kind := fmt.Sprint(frame.Headers.Get(":message-type")); kind == "exception" || kind == "error" {
				writer.CloseWithError(errors.New("Bedrock gateway stream exception"))
				return
			}
			if fmt.Sprint(frame.Headers.Get(":message-type")) != "event" || fmt.Sprint(frame.Headers.Get(":event-type")) != "chunk" {
				writer.CloseWithError(errors.New("unexpected Bedrock gateway event frame"))
				return
			}
			payload := frame.Payload
			var wrapper struct {
				Bytes string `json:"bytes"`
			}
			if json.Unmarshal(payload, &wrapper) == nil && wrapper.Bytes != "" {
				payload, err = base64.StdEncoding.DecodeString(wrapper.Bytes)
				if err != nil {
					writer.CloseWithError(err)
					return
				}
			}
			var event struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(payload, &event) != nil || !validEventType(event.Type) {
				writer.CloseWithError(errors.New("invalid Bedrock gateway event"))
				return
			}
			var compact bytes.Buffer
			if err = json.Compact(&compact, payload); err != nil {
				writer.CloseWithError(err)
				return
			}
			if _, err = fmt.Fprintf(writer, "event: %s\ndata: %s\n\n", event.Type, compact.Bytes()); err != nil {
				return
			}
		}
	}()
	copy := *resp
	copy.Body = &bedrockStreamBody{PipeReader: reader, upstream: resp.Body}
	copy.Header = resp.Header.Clone()
	copy.Header.Set("Content-Type", "text/event-stream")
	copy.Header.Del("Content-Length")
	copy.ContentLength = -1
	return &copy, nil
}

func mustURLPath(raw string) string { u, _ := url.Parse(raw); return u.Path }

func validEventType(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range []byte(s) {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '_') {
			return false
		}
	}
	return true
}

type bedrockStreamBody struct {
	*io.PipeReader
	upstream io.ReadCloser
}

func (b *bedrockStreamBody) Close() error {
	_ = b.upstream.Close()
	return b.PipeReader.Close()
}
