// Package agent wires real LLM-driven planner and work agents (on top of the
// agent-core SDK) to the dual PostgreSQL graph. See the ARTEX architecture design doc
// §4.3 (planner) and §4.4 (work agent).
//
// Provider configuration is read from the environment so the system runs with
// any Anthropic-, OpenAI- or Ollama-format endpoint (the last being keyless).
// If no usable configuration is found — a key for the cloud formats, a base
// URL for keyless Ollama — FromEnv returns ok=false and the exploration engine
// stays idle (an LLM is required).
package agent

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/Autumn-27/artex/llmrec"
	"github.com/Autumn-27/norma/agentcore"
	"github.com/Autumn-27/norma/compaction"
	"github.com/Autumn-27/norma/llm"
	acperm "github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
	"github.com/Autumn-27/norma/transcript"
)

// Config describes the LLM backend resolved from the environment.
type Config struct {
	Format  llm.Format
	BaseURL string
	APIKey  string
	Model   string
	// Proxy routes all LLM requests through the given proxy URL (http/https/socks5,
	// optionally with user:pass@ credentials). Empty means direct — it does NOT
	// fall back to the standard *_PROXY environment variables.
	Proxy string
	// RatePerSecond / RatePerMinute cap the shared request rate across ALL agents
	// using the provider (0 = that window unlimited).
	RatePerSecond float64
	RatePerMinute float64
	// ContextWindowK is the model's context window in K tokens (user-configured).
	// CompactionWindow applies a 32K floor for compaction math; ContextWindowTokens
	// does not, so routing and side-question budgets see the real window. 0 = default.
	ContextWindowK int
	// ThinkingType independently controls the thinking "on/off" field (thinking.type):
	//   "" = don't send (default, compatible with models that don't support the field);
	//   "disabled" = explicitly off; "enabled" = on. Fully decoupled from
	//   ReasoningEffort — some endpoints have no thinking field and activate thinking
	//   via the effort parameter alone, so the two can be set independently.
	ThinkingType string
	// ReasoningEffort independently controls the thinking "effort" field:
	//   "" = don't send (default); "low"/"medium"/"high"/"xhigh"/"max" = the effort level.
	//   Mapped to top-level reasoning_effort for OpenAI, and to output_config.effort
	//   for Anthropic.
	ReasoningEffort string
	// Stream controls whether this profile uses the streaming (SSE) API. true (default)
	// = streaming; false = true non-streaming (send stream:false, get the full JSON in
	// one shot, via Provider.Complete). Non-streaming bypasses some gateways' broken
	// SSE implementations (empty frames, dropped thinking frames), at the cost of
	// losing live progress / live token counts during the run. Mapped to
	// agentcore.Options.NonStreaming = !Stream.
	Stream bool
	// MaxTokens is the per-reply output cap (tokens). 0 = don't send the field and let
	// the server default decide (historical behavior). Unlike ContextWindowK, which is
	// the model's total capacity used only locally to size compaction thresholds and
	// never sent in a request, this value is sent with every request. Mapped to
	// agentcore.Options.MaxTokens.
	MaxTokens int
	// MaxTokensField selects which request field carries MaxTokens, only effective for
	// format=openai:
	//   "" = max_tokens (default); "max_completion_tokens" = the newer field.
	// OpenAI reasoning models (o-series/GPT-5) accept only the latter and reject
	// max_tokens outright with unsupported_parameter, while most compatible gateways
	// accept only the former — so no auto-detection; the user picks per endpoint.
	MaxTokensField string
	// SessionHeaderKey, when non-empty, makes every LLM request carry a custom HTTP
	// header named by this value, with the [current session's session id] as its value
	// (chat session = conv-<id>, worker = exp<x>-worker-i<intent>, etc.; see
	// WorkerSessionID). Used by gateways that do prompt caching / sticky routing keyed
	// on a session-id header. Empty = don't send. The value is attached to the request
	// context via transcript.WithSessionID and read by the RoundTripper, so even a
	// shared provider emits different header values per session.
	SessionHeaderKey string
	// UserAgent, when non-empty, overrides the User-Agent header on every outbound
	// LLM request built from this config. Empty = don't set it, leaving the Go/Norma
	// default UA untouched (the historical behavior). Validated by ValidateUserAgent.
	UserAgent string
	// CustomHeaders are static Bedrock gateway headers, one Name: Value per line.
	CustomHeaders string
	// Retry holds the retry parameters resolved for this config (profile override →
	// global policy → built-in default, resolved server-side). See RetryConfig for
	// the per-layer semantics; zero values = fully inherit the built-in defaults.
	Retry RetryConfig
}

// RetryConfig holds the retry parameters that travel with one LLM config. The
// "attempts" of each layer share one semantics: 0 = use the built-in default count;
// negative = disable this layer's retries; >0 = use this value. The "interval" of
// each layer: 0 = keep the layer's original exponential backoff; >0 = use this
// fixed interval instead.
type RetryConfig struct {
	// ConnectAttempts/ConnectInterval: SDK connection retries (connection reset/
	// timeout/429/5xx, before the stream starts), mapped directly to
	// llm.Config.MaxRetries / RetryInterval. Default 3 attempts, exponential from
	// 0.5s (capped at 8s).
	ConnectAttempts int
	ConnectInterval time.Duration
	// EmptyAttempts/EmptyInterval: SDK empty-response retries (completed but no
	// content block, openai format only), mapped to llm.Config.EmptyResponseRetries /
	// EmptyResponseInterval. Default 2 attempts, same exponential ladder.
	EmptyAttempts int
	EmptyInterval time.Duration
	// StreamAttempts/StreamInterval: same-provider safe-window retries — a layer this
	// project adds on top of the SDK, replaying a broken/overloaded/in-stream 429 only
	// when no output has been delivered to the caller yet. Invisible to the SDK;
	// consumed by server/task_llm.go. Default 2 attempts, exponential from 0.5s
	// (capped at 4s).
	StreamAttempts int
	StreamInterval time.Duration
}

// compaction window resolution bounds (in K tokens). Below the floor the
// threshold math (window − summary reserve − buffer) would go non-positive and
// compaction would fire every turn; above the cap it would never fire.
const (
	defaultWindowK = 200  // unset → assume a 200K window (Claude default)
	minWindowK     = 32   // floor so effectiveWindow stays comfortably positive
	maxWindowK     = 1000 // cap at 1M tokens (user request)
)

// FormatOllama marks a LOCAL Ollama server profile. Ollama exposes an
// OpenAI-compatible Chat Completions endpoint (/v1), so on the wire it speaks
// llm.FormatOpenAI; the distinct sentinel matters everywhere a profile must be
// treated as usable WITHOUT an API key — Ollama runs keyless on localhost/LAN.
// See NeedsAPIKey and NewProvider (which maps it onto FormatOpenAI while
// forcing our base-URL/key defaults so an empty key never falls back to
// OpenAI's public endpoint).
const FormatOllama llm.Format = "ollama"
const FormatBedrockGateway llm.Format = "bedrock-gateway"

// DefaultOllamaBaseURL is the base of Ollama's OpenAI-compatible endpoint the
// provider appends /chat/completions to. Must never end up empty: with an
// empty BaseURL, the SDK would fall back to OpenAI's public endpoint.
const DefaultOllamaBaseURL = "http://127.0.0.1:11434/v1"

// ollamaPlaceholderKey is sent as the Bearer token when no key is configured.
// Ollama ignores authorization, but a concrete value keeps the SDK from
// falling back to OPENAI_API_KEY (which would silently ship a real cloud key
// to the local server) and keeps the header stable.
const ollamaPlaceholderKey = "ollama"

// normalizeOllamaBaseURL maps whatever the operator typed onto the /v1 root the
// OpenAI-compatible provider expects: it strips a pasted "/chat/completions"
// suffix, an empty value becomes the local default, and a missing "/v1" is
// appended so the natural "http://host:11434" also works. Shared by the saved
// profile path (ConfigFrom) and the environment path (FromEnv): both used to
// differ, and only the profile path normalized.
func normalizeOllamaBaseURL(raw string) string {
	b := strings.TrimRight(strings.TrimSuffix(strings.TrimSpace(raw), "/chat/completions"), "/")
	if b == "" {
		return DefaultOllamaBaseURL
	}
	if !strings.HasSuffix(b, "/v1") {
		b += "/v1"
	}
	return b
}

// NeedsAPIKey reports whether this provider format requires an API key to be
// usable. Ollama (local server) is keyless; every cloud format needs one.
func (c Config) NeedsAPIKey() bool { return c.Format != FormatOllama }

// CompactionWindow returns the model context window in TOKENS for compaction
// thresholds, resolved from the user-configured size (ContextWindowK). 0/unset →
// a 200K default; otherwise clamped to [32K, 1M] so compaction stays effective.
func (c Config) CompactionWindow() int {
	k := c.ContextWindowK
	if k <= 0 {
		k = defaultWindowK
	}
	if k < minWindowK {
		k = minWindowK
	}
	if k > maxWindowK {
		k = maxWindowK
	}
	return k * 1000
}

// ContextWindowTokens returns the model's actual configured context window in
// tokens (0/unset → 200K, capped at 1M) without the 32K compaction-math floor.
// llmpool pre-filtering and sidequestion budgets use this so an 8K/16K profile
// is not treated as 32K — that leak lets an oversize request hit the small
// model, 400, and never fail over (shouldFailover ignores 400s).
func (c Config) ContextWindowTokens() int {
	k := c.ContextWindowK
	if k <= 0 {
		k = defaultWindowK
	}
	if k > maxWindowK {
		k = maxWindowK
	}
	return k * 1000
}

// compactionConfig builds the agent-core compaction config for a context window
// in tokens. agentcore.NewSession wires the summarizer (same provider) when this
// is set on Options.Compaction.
func compactionConfig(windowTokens int) *compaction.Config {
	if windowTokens <= 0 {
		windowTokens = defaultWindowK * 1000
	}
	return &compaction.Config{ContextWindow: windowTokens}
}

// FromEnv resolves the LLM provider config:
//
//	ARTEX_LLM_PROVIDER = anthropic|openai|openai-responses|ollama (default: inferred from keys)
//	ARTEX_LLM_MODEL    = model id        (default: per provider)
//	ARTEX_LLM_BASE_URL = endpoint        (optional; ollama defaults to localhost:11434/v1)
//	ARTEX_LLM_PROXY    = proxy URL        (optional; http/https/socks5)
//	ANTHROPIC_API_KEY / OPENAI_API_KEY         = credentials (unused for ollama)
func FromEnv() (Config, bool) {
	// Case- and space-insensitive: "Ollama" used to miss every case below and
	// fall through to anthropic, sending ANTHROPIC_API_KEY to the Ollama base URL.
	prov := strings.ToLower(strings.TrimSpace(os.Getenv("ARTEX_LLM_PROVIDER")))
	anthKey := os.Getenv("ANTHROPIC_API_KEY")
	oaiKey := os.Getenv("OPENAI_API_KEY")

	if prov == "" {
		switch {
		case anthKey != "":
			prov = "anthropic"
		case oaiKey != "":
			prov = "openai"
		default:
			return Config{}, false
		}
	}

	c := Config{
		BaseURL: os.Getenv("ARTEX_LLM_BASE_URL"),
		Model:   os.Getenv("ARTEX_LLM_MODEL"),
		Proxy:   strings.TrimSpace(os.Getenv("ARTEX_LLM_PROXY")),
		// Streaming by default; ARTEX_LLM_STREAM=false/0/off explicitly switches to
		// non-streaming.
		Stream: !isFalsy(os.Getenv("ARTEX_LLM_STREAM")),
	}
	switch prov {
	case "openai":
		c.Format = llm.FormatOpenAI
		c.APIKey = oaiKey
		if c.Model == "" {
			c.Model = "gpt-4o"
		}
	case "openai-responses":
		c.Format = llm.FormatOpenAIResponses
		c.APIKey = oaiKey
		if c.Model == "" {
			c.Model = "gpt-5"
		}
	case "ollama":
		c.Format = FormatOllama
		// Deliberately NOT inheriting OPENAI_API_KEY: a local Ollama ignores the
		// bearer token, so the only thing the inheritance could do is ship a real
		// cloud key to the endpoint. A gateway that does require a key can still
		// be configured as a saved profile with an explicit one.
		c.BaseURL = normalizeOllamaBaseURL(c.BaseURL)
		if c.Model == "" {
			c.Model = "llama3.2"
		}
	case "bedrock-gateway":
		c.Format = FormatBedrockGateway
		c.APIKey = strings.TrimSpace(os.Getenv("ARTEX_LLM_API_KEY"))
		c.CustomHeaders = os.Getenv("ARTEX_LLM_CUSTOM_HEADERS")
		if c.BaseURL == "" || c.Model == "" {
			return Config{}, false
		}
	default:
		c.Format = llm.FormatAnthropic
		c.APIKey = anthKey
		if c.Model == "" {
			c.Model = "claude-opus-4-8"
		}
	}
	// Ollama runs without a key: only the cloud formats gate on one.
	if c.APIKey == "" && c.NeedsAPIKey() {
		return Config{}, false
	}
	return c, true
}

// ConfigFrom builds a Config from UI-provided strings (provider defaults to
// anthropic; model defaults per provider). Inputs are trimmed and the base URL
// is normalized to the API base the provider expects (the provider appends the
// endpoint path itself), so a full endpoint URL is tolerated.
func ConfigFrom(provider, model, baseURL, apiKey, proxy string) Config {
	c := Config{
		Model:   strings.TrimSpace(model),
		BaseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		APIKey:  strings.TrimSpace(apiKey),
		Proxy:   strings.TrimSpace(proxy),
		Stream:  true, // streaming by default; the caller overrides per profile
	}
	switch strings.TrimSpace(provider) {
	case "openai":
		c.Format = llm.FormatOpenAI
		// provider appends "/chat/completions"; tolerate a full endpoint URL.
		c.BaseURL = strings.TrimRight(strings.TrimSuffix(c.BaseURL, "/chat/completions"), "/")
		if c.Model == "" {
			c.Model = "gpt-4o"
		}
	case "openai-responses":
		c.Format = llm.FormatOpenAIResponses
		// provider appends "/responses"; tolerate a full endpoint URL.
		c.BaseURL = strings.TrimRight(strings.TrimSuffix(c.BaseURL, "/responses"), "/")
		if c.Model == "" {
			c.Model = "gpt-5"
		}
	case "ollama":
		c.Format = FormatOllama
		// Ollama's OpenAI-compatible endpoint lives at /v1 and the provider
		// appends "/chat/completions". Never leave it empty: an empty BaseURL
		// would let the SDK fall back to OpenAI's public endpoint with this
		// profile's request.
		c.BaseURL = normalizeOllamaBaseURL(c.BaseURL)
		if c.Model == "" {
			c.Model = "llama3.2"
		}
	case "bedrock-gateway":
		c.Format = FormatBedrockGateway
		// No public-provider defaults: an absent URL, model or token fails closed.
		c.BaseURL = strings.TrimRight(strings.TrimSuffix(strings.TrimSuffix(c.BaseURL, "/invoke-with-response-stream"), "/invoke"), "/")
	default:
		c.Format = llm.FormatAnthropic
		// provider appends "/v1/messages".
		c.BaseURL = strings.TrimRight(strings.TrimSuffix(c.BaseURL, "/v1/messages"), "/")
		if c.Model == "" {
			c.Model = "claude-opus-4-8"
		}
	}
	return c
}

// isFalsy reports whether an env-var string explicitly requests "off". Empty or
// unrecognized → false (so an unset var keeps the streaming default).
func isFalsy(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "0", "false", "off", "no":
		return true
	}
	return false
}

// Provider returns the short provider name
// ("anthropic"/"openai"/"openai-responses"/"ollama").
func (c Config) Provider() string {
	switch c.Format {
	case llm.FormatOpenAI:
		return "openai"
	case llm.FormatOpenAIResponses:
		return "openai-responses"
	case FormatOllama:
		return "ollama"
	case FormatBedrockGateway:
		return "bedrock-gateway"
	}
	return "anthropic"
}

// NewProvider builds an llm.Provider from the config. When a rate is set, the
// limiter lives on the single provider instance — so planner + all workers +
// main agent (which share this provider) are bounded by one shared rate limit.
func (c Config) NewProvider() (llm.Provider, error) {
	client, err := quotaAwareHTTPClient(c.Proxy, c.SessionHeaderKey, c.UserAgent)
	if err != nil {
		return nil, err
	}
	wireFormat := c.Format
	baseURL := c.BaseURL
	apiKey := c.APIKey
	// Ollama speaks OpenAI's Chat Completions on the wire. Bundle the keyless
	// defaults here so an Ollama config can never leak toward the SDK's env-
	// driven fallbacks: BaseURL to OpenAI's public endpoint, APIKey to
	// OPENAI_API_KEY. A local Ollama ignores the placeholder token; a gateway
	// that requires one carries a real key in the profile.
	if wireFormat == FormatOllama {
		wireFormat = llm.FormatOpenAI
		if strings.TrimSpace(baseURL) == "" {
			baseURL = DefaultOllamaBaseURL
		}
		if strings.TrimSpace(apiKey) == "" {
			apiKey = ollamaPlaceholderKey
		}
	}
	if wireFormat == FormatBedrockGateway {
		headers, err := validateBedrockGateway(baseURL, apiKey, c.Model, c.CustomHeaders)
		if err != nil {
			return nil, err
		}
		wireFormat = llm.FormatAnthropic
		qt := client.Transport.(quotaAwareTransport)
		qt.base = &bedrockGatewayTransport{base: qt.base, baseURL: baseURL, token: apiKey, model: c.Model, headers: headers}
		client.Transport = qt
		client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	}
	lc := llm.Config{
		Format:     wireFormat,
		BaseURL:    baseURL,
		APIKey:     apiKey,
		Model:      c.Model,
		HTTPClient: client,
	}
	// The thinking on/off and effort fields are each passed through as-is (empty =
	// the field is not sent). The two are decoupled: send only thinking.type, only
	// effort, both, or neither.
	lc.ThinkingType = c.ThinkingType
	lc.ReasoningEffort = c.ReasoningEffort
	// Field-name selection for the output cap (empty = use max_tokens). The cap's
	// VALUE is not here: it travels per round with agentcore.Options.MaxTokens; the
	// provider only decides which key to put it under.
	lc.MaxTokensField = c.MaxTokensField
	// Retry params share the SDK's semantics (attempts: 0=default/negative=off;
	// interval: 0=exponential backoff/>0=fixed), passed through verbatim.
	lc.MaxRetries = c.Retry.ConnectAttempts
	lc.RetryInterval = c.Retry.ConnectInterval
	lc.EmptyResponseRetries = c.Retry.EmptyAttempts
	lc.EmptyResponseInterval = c.Retry.EmptyInterval
	if c.RatePerSecond > 0 || c.RatePerMinute > 0 {
		lc.RateLimit = &llm.RateLimit{PerSecond: c.RatePerSecond, PerMinute: c.RatePerMinute}
	}
	return llm.NewProvider(lc)
}

// IsQuotaExhaustedMessage deliberately recognizes only explicit balance,
// billing, credit, or quota-exhaustion signals. Generic 429/rate-limit text,
// authentication failures, network errors, and server failures are excluded.
var nonFailoverHTTPStatus = regexp.MustCompile(`(?:status(?:\s+code)?|http(?:\s+status)?)\s*[=:]?\s*(?:401|403|5\d\d)\b`)
var transientQuotaLimit = regexp.MustCompile(`(?i)(?:\b(?:rpm|tpm|rpd|qps)\b|quota[_\s-]*metric|rate[_\s-]*limit|too many requests|(?:requests?|tokens?)\s+(?:per|/)\s*(?:second|minute)|(?:per|/)\s*(?:second|minute)\s+(?:requests?|tokens?)|generate[_\s-]*requests[_\s-]*per[_\s-]*(?:minute|second)|tokens?[_\s-]*per[_\s-]*(?:minute|second))`)

func IsQuotaExhaustedMessage(message string) bool {
	message = strings.ToLower(message)
	// Authentication/authorization and provider-side 5xx failures never rotate,
	// even when a gateway happens to echo a quota-looking phrase in the body.
	if nonFailoverHTTPStatus.MatchString(message) {
		return false
	}
	// Provider APIs frequently describe an ordinary rate limit as "quota
	// exceeded", especially Google-style responses containing a quota metric.
	// These limits recover with time and must stay on the current provider.
	if transientQuotaLimit.MatchString(message) {
		return false
	}
	markers := []string{
		"insufficient_quota", "quota_exceeded", "quota exceeded", "quota exhausted",
		"exceeded your current quota", "billing_hard_limit_reached",
		"billing hard limit", "billing_not_active", "credit balance", "insufficient credit",
		"insufficient balance", "balance is too low", "payment required", "status 402",
		"insufficient funds", "out of credit", "credit used up", "in arrears",
	}
	for _, marker := range markers {
		if strings.Contains(message, marker) {
			return true
		}
	}
	// gRPC RESOURCE_EXHAUSTED is overloaded for both account quota and ordinary
	// request-rate limiting. Preserve it as an explicit exhaustion signal only
	// when the same error does not identify a transient rate limit.
	return strings.Contains(message, "resource_exhausted") &&
		!strings.Contains(message, "rate limit") &&
		!strings.Contains(message, "too many requests")
}

// quotaAwareTransport preserves Norma's normal retry behavior except for a 429
// whose body explicitly says the account quota/balance is exhausted. Norma's
// retry loop treats every 429 as transient; normalizing only that response to
// 402 lets a task router fail over immediately while retaining the original
// response body for provider-specific classification and audit logs.
type quotaAwareTransport struct {
	base http.RoundTripper
	// sessionHeaderKey, when non-empty, is the HTTP header name each request
	// carries; its value is the session id read from the request context. Empty
	// disables it. See Config.SessionHeaderKey.
	sessionHeaderKey string
	// userAgent, when non-empty, is set as the User-Agent header on every request.
	// Empty leaves the default UA untouched. See Config.UserAgent.
	userAgent string
}

func (t quotaAwareTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Custom session-id header: name is user-configured, value is THIS run's
	// session id (norma stashes it on the context via transcript.WithSessionID).
	// Stable across a session's turns and distinct across sessions — exactly what
	// a session-keyed prompt cache wants. Skipped when no session id is present.
	if t.sessionHeaderKey != "" {
		if sid := transcript.SessionIDFrom(req.Context()); sid != "" {
			req.Header.Set(t.sessionHeaderKey, sid)
		}
	}
	// Custom User-Agent: override only when configured, so an empty value keeps the
	// underlying transport's default UA exactly as before.
	if t.userAgent != "" {
		req.Header.Set("User-Agent", t.userAgent)
	}
	// When LLM recording is on, the Recorder puts a Capture on the context so the
	// raw wire bodies can be persisted. This is the only layer that still sees
	// them: norma builds the request body internally and decodes the SSE response
	// before either reaches the recorder.
	capt := llmrec.CaptureFrom(req.Context())
	capt.SetRequest(requestBodySnapshot(req))

	resp, err := t.base.RoundTrip(req)
	if err != nil || resp == nil {
		return resp, err
	}
	// Tee rather than read: a 200 is an SSE stream that must keep streaming. The
	// 429 branch below reads through this wrapper, so its body lands in the
	// capture before being replaced.
	resp.Body = capt.TeeResponse(resp.StatusCode, resp.Body)

	if resp.StatusCode != http.StatusTooManyRequests {
		return resp, nil
	}
	body, readErr := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	resp.Body = io.NopCloser(bytes.NewReader(body))
	resp.ContentLength = int64(len(body))
	if readErr != nil {
		return resp, nil
	}
	if IsQuotaExhaustedMessage(string(body)) {
		resp.StatusCode = http.StatusPaymentRequired
		resp.Status = "402 Payment Required"
	}
	return resp, nil
}

// requestBodySnapshot copies an outgoing request body without consuming it.
// norma builds every model request from a *bytes.Reader, so net/http populates
// GetBody and the copy has no effect on what gets sent.
func requestBodySnapshot(req *http.Request) string {
	if req.GetBody == nil {
		return ""
	}
	rc, err := req.GetBody()
	if err != nil {
		return ""
	}
	defer rc.Close()
	b, err := io.ReadAll(rc)
	if err != nil {
		return ""
	}
	return string(b)
}

func quotaAwareHTTPClient(proxy, sessionHeaderKey, userAgent string) (*http.Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	proxy = strings.TrimSpace(proxy)
	if proxy == "" {
		transport.Proxy = nil // empty = direct; no fallback to the HTTP_PROXY/HTTPS_PROXY env vars
	} else {
		proxyURL, err := url.Parse(proxy)
		if err != nil {
			return nil, fmt.Errorf("llm: invalid proxy %q: %w", proxy, err)
		}
		switch proxyURL.Scheme {
		case "http", "https", "socks5":
		case "":
			return nil, fmt.Errorf("llm: proxy %q missing scheme (use http://, https:// or socks5://)", proxy)
		default:
			return nil, fmt.Errorf("llm: unsupported proxy scheme %q (use http, https or socks5)", proxyURL.Scheme)
		}
		transport.Proxy = http.ProxyURL(proxyURL)
	}
	return &http.Client{Transport: quotaAwareTransport{base: transport, sessionHeaderKey: strings.TrimSpace(sessionHeaderKey), userAgent: strings.TrimSpace(userAgent)}}, nil
}

// MaxUserAgentLen bounds a custom User-Agent value. Generous for real UA strings
// while keeping a pathological value out of every outbound request.
const MaxUserAgentLen = 256

// ValidateUserAgent trims a custom User-Agent and returns the cleaned value. An
// empty/blank input is valid and means "no override" (keep the default UA). A
// non-empty value is rejected when it exceeds MaxUserAgentLen or contains any
// control character (including CR/LF, which would allow header injection).
func ValidateUserAgent(raw string) (string, error) {
	ua := strings.TrimSpace(raw)
	if ua == "" {
		return "", nil
	}
	if len(ua) > MaxUserAgentLen {
		return "", fmt.Errorf("user agent too long: %d bytes (max %d)", len(ua), MaxUserAgentLen)
	}
	for _, r := range ua {
		if r < 0x20 || r == 0x7f {
			return "", fmt.Errorf("user agent contains a control character")
		}
	}
	return ua, nil
}

// logTestConnection prints the raw HTTP status code(s) and response body of a
// connection test to the server log, so "click test" leaves a diagnosable trail of
// exactly what the gateway returned — 401 bodies, quota text, empty frames — not
// just the collapsed ok/err the UI shows. Bodies are clipped to keep a chatty
// SSE stream from flooding the log.
func logTestConnection(c Config, capt *llmrec.Capture) {
	attempts := capt.Attempts()
	if c.Format == FormatBedrockGateway {
		if len(attempts) == 0 {
			log.Print("[llm-test] bedrock-gateway — no HTTP request was sent")
			return
		}
		for i, a := range attempts {
			log.Printf("[llm-test] bedrock-gateway — attempt %d/%d HTTP %d", i+1, len(attempts), a.Status)
		}
		return
	}
	if len(attempts) == 0 {
		log.Printf("[llm-test] %s / %s @ %s — no HTTP request was ever sent (config resolution or connection setup failed)",
			c.Provider(), c.Model, c.BaseURL)
		return
	}
	for i, a := range attempts {
		log.Printf("[llm-test] %s / %s @ %s — attempt %d/%d HTTP %d\nresponse body: %s",
			c.Provider(), c.Model, c.BaseURL, i+1, len(attempts), a.Status, clipBody(a.Body))
	}
}

// clipBody trims a wire body for logging. 4K is plenty to show an error JSON or
// the head of an SSE stream while bounding a runaway response.
func clipBody(s string) string {
	s = strings.TrimSpace(s)
	// One log record per attempt. A body that contains a newline would
	// otherwise look like a second log line.
	s = strings.ReplaceAll(s, "\r\n", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", " ")
	if s == "" {
		return "(empty)"
	}
	const max = 4096
	if len(s) > max {
		return s[:max] + fmt.Sprintf("…(truncated, %d bytes total)", len(s))
	}
	return s
}

// TestConnection makes a minimal real completion to verify the provider/model/
// endpoint/key actually work. Returns the round-trip latency and the model's
// reply text.
func TestConnection(ctx context.Context, c Config) (time.Duration, string, error) {
	prov, err := c.NewProvider()
	if err != nil {
		return 0, "", err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	// Capture the raw wire messages: what a connection test most needs to see is
	// exactly what the gateway returned (status code + response body), which is gone
	// once norma decodes the response into StreamEvents. quotaAwareTransport finds
	// this Capture on the context and fills in each HTTP attempt's status and body.
	ctx, capt := llmrec.NewCapture(ctx)
	defer logTestConnection(c, capt)
	// A connection test is a one-shot path that bypasses agentcore's session loop, so
	// nobody attaches a session id to the context. For endpoints configured with a
	// SessionHeaderKey (e.g. opencode zen mandates the x-opencode-session header and
	// rejects with 400 MissingSessionID without it), this caused the "conversations
	// work, but clicking test gives a 400" discrepancy. Here we attach a one-time
	// random session id so the test uses the exact same header logic as a real
	// conversation; endpoints without a SessionHeaderKey don't read it, no side
	// effects.
	ctx = transcript.WithSessionID(ctx, "conntest-"+transcript.NewSessionID())
	start := time.Now()
	// MaxTokens must be generous: reasoning models (e.g. deepseek-v4-pro) emit a long
	// stretch of thinking before answering (measured ~2900 tokens even for a one-word
	// "ping"). Given only 32, the model stays stuck "thinking" until it hits the
	// output cap (finish=length) and gets truncated — the connection test still passes
	// (err=nil) but shows as a messy "interrupted/length/resume". Give it enough
	// budget to emit OK cleanly (finish=stop).
	// EscalateMaxTokens stays false: don't raise the cap and retry on truncation, to
	// avoid burning tokens in a resume loop.
	reply, err := agentcore.Run(ctx, agentcore.Options{
		Provider:       prov,
		SystemPrompt:   []string{"You are a connection test. Just output the two characters OK — no thinking, no explanation, nothing else."},
		Tools:          []actool.CoreTool{}, // not nil: nil means the SDK's unconfined file and shell tools
		PermissionMode: acperm.ModeBypass,
		MaxTurns:       1,
		MaxTokens:      8192,
		NonStreaming:   !c.Stream, // use this profile's real send/receive mode for the connection test
	}, "ping")
	lat := time.Since(start)
	if err != nil {
		if c.Format == FormatBedrockGateway {
			attempts := capt.Attempts()
			if len(attempts) > 0 && attempts[len(attempts)-1].Status >= 400 {
				return lat, "", fmt.Errorf("Bedrock gateway returned HTTP %d", attempts[len(attempts)-1].Status)
			}
			return lat, "", fmt.Errorf("Bedrock gateway connection failed")
		}
		return lat, "", err
	}
	// err==nil is not enough: requests that go through while the model emits nothing
	// at all really happen (thinking burned the whole budget, the body got swallowed
	// by a safety policy, a compatibility layer dropped the content). Such a config
	// means "no replies" in conversations, yet the test would report success — exactly
	// the discrepancy this check eliminates. No visible body = fail.
	reply = strings.TrimSpace(reply)
	if reply == "" {
		return lat, "", fmt.Errorf("the model returned no content (the request went through, but no text was returned)")
	}
	return lat, reply, nil
}
