# Constrained Go Tampering Hooks (P4.2 — PR1 Backend, API & Trace)

ARTEX supports opt-in, **operator-only** HTTP tampering hooks written in a constrained, deterministic subset of Go—with **no Python runtime** and **no external interpreter dependency**. Hooks run inside the capture proxy after declarative rewrite rules in each phase (`request` or `response`), fail open on any error, and record field-level diffs into SQLite `exchange_rewrites`.

## Kill Switch & Authority

- **Kill switch (`ARTEX_TAMPER_HOOKS_ENABLED=1`, off by default)**: when unset or false, **zero hooks are loaded** onto the capture proxy and the proxy follows the unchanged baseline path.
- **Operator-only**: hooks are global admin configuration managed only via `/api/traffic/hooks*` and are **never exposed as an agent tool**.
- **Created disabled**: every hook is created with `enabled: false` and must be explicitly enabled via toggle or update.
- **Sealed at rest**: `source` and `matchers` on both `traffic_tamper_hooks` and `traffic_tamper_hook_versions` (migration `0011_traffic_tamper_hooks.sql`) are encrypted at rest with `db/secrets.go` (AES-256-GCM) because a hook may contain hardcoded signing keys or tokens.

## Execution Order, Failure Mode & Limits

- **Order**: per phase (`priority ASC, id ASC`), **declarative rewrite rules run first**, then **tampering hooks** see the post-rule message.
- **Matchers prefilter**: hooks reuse the exact `traffic/rewrite` matchers (`methods`, `host`, `url_regex`, `headers`, `body_regex`, `status`, `resp_headers`, `resp_body_regex`). Non-matching exchanges never invoke the VM.
- **Fail-open only (0.7)**: any returned error, panic, timeout, step-limit, memory-limit, or forbidden HTTP mutation **rolls back all mutations of that hook atomically**, passes the pre-hook message unchanged, records an `outcome='error'` trace row in `exchange_rewrites` with the reason (`panic`, `timeout`, `step_limit`, `memory_limit`, `forbidden_mutation`, `forbidden_method`, `invalid_url`, `invalid_status`, `forbidden_header`, `invalid_header`, `body_too_large`, `hook_error`), and updates in-memory `last_error` (`class`, `at`, `count`).
- **Skipped messages**:
  - **Binary bodies are not modified in 0.7** (`not rewritten: binary`).
  - Bodies larger than **1 MiB** (`not rewritten: body too large`), compressed bodies (`Content-Encoding` other than `identity`), WebSocket upgrades, SSE response bodies, and responses ≥ 5 MiB (`StreamLargeBodies`) are skipped.
- **Tainted fields stay masked**: if a `sensitive: true` rewrite rule wrote a field earlier in the phase, any subsequent hook trace line for that field emits only keyed HMAC fingerprints and never stores plaintext `after_inline`/`after_blob`.

### Resource & Storage Bounds

| Limit | Default |
|---|---|
| Per-hook wall-clock timeout | `25 ms` |
| Per-phase cumulative hook timeout | `100 ms` |
| CPU step budget per invocation | `100,000` steps |
| Memory allocation budget per invocation | `4 MiB` |
| Call depth | `32` |
| Regexp pattern size | `1 KiB` (RE2) |
| Source size | `64 KiB` |
| Body size | `1 MiB` |
| Stored / enabled hooks | `50` total / `20` enabled |
| Retained version history | `20` newest versions per hook |

## Go Subset Specification

Hooks are parsed with Go's standard `go/parser` and must declare `package hook`. They are **not** full idiomatic Go; only the exact syntax, fields, and virtual stdlib functions below are supported.

### Entrypoints

- Request phase (`phase: "request"`):
  ```go
  package hook
  func OnRequest(req *Request) error
  ```
- Response phase (`phase: "response"`):
  ```go
  package hook
  func OnResponse(req *Request, resp *Response) error
  ```
  In `OnResponse`, `req` holds an isolated copy of the request as sent to the target: field assignments (`req.Method`, `req.Path`, `req.RawQuery`, `req.Body`, `req.Headers`) and mutator methods (`req.SetHeader`, `req.AddHeader`, `req.DelHeader`) fail with `forbidden_mutation`, while direct map/slice element writes (such as `req.Headers[k] = ...`, `delete(req.Headers, k)`, or `req.Body[0] = ...`) mutate only the VM copy and are discarded without affecting the wire exchange or trace.

### Allowed Syntax

- Package-level `import`, `const` (basic literals / bool / unary `-`), and helper `func` definitions (no receivers, no `init()`, no package-level `var`, no `type` declarations).
- Statements: `:=`, `=`, `+=`, `-=`, `++`, `--`, local `var`, `if` / `else if` / `else`, `for` (C-style, condition-only, infinite `for {}`, and `for k, v := range ...` with **lexicographically sorted map keys**), `break`, `continue`, `return`.
- Expressions: literals (`int`, `float`, `string`, `rune`, `bool`, `nil`), unary (`!`, `-`, `+`), binary (`+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`), indexing (`x[i]`, `m[k]`, comma-ok `v, ok := m[k]`), slicing (`x[lo:hi]`), composite literals (`[]byte{...}`, `[]any{...}`, `map[string]any{...}`), type conversions (`[]byte(s)`, `string(b)`, `int(x)`, `int64(x)`, `float64(x)`, `byte(x)`), type assertions (`v, ok := x.(T)` for `string`, `bool`, `int`/`int64`, `float64`, `[]byte`, `[]any`, `map[string]any`).
- Collections: `[]byte`, `[]any`, `map[string]any` (plus `map[string][]string` for `Headers` and `url.ParseQuery`).
- Allowed builtins: `len`, `cap`, `append`, `make`, `delete`, `string`, `int`, `int64`, `float64`, `byte`, `panic`.

### Forbidden Constructs (Rejected with HTTP 400 at Validation)

- Forbidden imports: `os`, `io`, `io/fs`, `net`, `net/http`, `os/exec`, `syscall`, `unsafe`, `reflect`, `time`, `math/rand`, `crypto/rand`, `fmt`, `sort`, or any package outside the closed allowlist below; dot (`.`) and blank (`_`) imports.
- Forbidden syntax: `go` (goroutines), `chan` / `select`, `defer`, `goto`, `switch`, `func(...)` anonymous literals, `&` (address-of), `init()`, package-level `var`, custom `type` / methods.
- Forbidden builtins: `recover`, `print`, `println`, `close`, `complex`, `real`, `imag`, `new`.

### `Request` and `Response` API

| Type | Field / Method | Access | Notes |
|---|---|---|---|
| `*Request` | `Scheme`, `Host`, `Port` (`string`) | **Read-only** | Attempting to assign fails atomically (`forbidden_mutation`) |
| `*Request` | `Method`, `Path`, `RawQuery` (`string`) | R/W (`OnRequest`), R/O (`OnResponse`) | `CONNECT` rejected; `Path` must start with `/` |
| `*Request` | `Headers` (`map[string][]string`) | R/W (`OnRequest`), R/O (`OnResponse`) | Forbidden headers (`Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Keep-Alive`, `TE`, `Trailer`, `Expect`, `Upgrade`, `Proxy-*`, `X-ARTEX-Replay-Nonce`) and CRLF/NUL values rejected atomically |
| `*Request` | `Body` (`[]byte`) | R/W (`OnRequest`), R/O (`OnResponse`) | Capped at 1 MiB; mutating strips `Content-Length`, `ETag`, `Content-MD5`, `Content-Encoding` |
| `*Request` / `*Response` | `GetHeader(name) string`, `SetHeader(name, val)`, `AddHeader(name, val)`, `DelHeader(name)` | Methods | Canonicalizes header keys |
| `*Response` | `Status` (`int`) | R/W (`OnResponse`) | Must be `200..599` excluding `204` and `304` |
| `*Response` | `Headers` (`map[string][]string`), `Body` (`[]byte`) | R/W (`OnResponse`) | Same header & 1 MiB body invariants |

### Allowed Virtual Stdlib Packages & Functions

- `strings`: `Contains`, `HasPrefix`, `HasSuffix`, `Index`, `TrimPrefix`, `TrimSuffix`, `ToLower`, `ToUpper`, `TrimSpace`, `ReplaceAll`, `Split` (returns `[]any` of strings), `Join`, `Repeat`.
- `bytes`: `Contains`, `HasPrefix`, `HasSuffix`, `Equal`, `Index`, `TrimSpace`, `ToLower`, `ToUpper`, `ReplaceAll`, `Repeat`.
- `encoding/json`: `Decode(b []byte) (any, error)`, `Marshal(v any) ([]byte, error)` (sorts object keys deterministically).
- `encoding/base64`: `EncodeToString`, `DecodeString`, `URLEncodeToString`, `URLDecodeString`.
- `encoding/hex`: `EncodeToString`, `DecodeString`.
- `net/url`: `QueryEscape`, `QueryUnescape`, `ParseQuery`, `EncodeQuery`.
- `regexp`: `MatchString`, `FindString`, `ReplaceAllString` (RE2, pattern ≤ 1 KiB).
- `crypto/sha256`: `Sum256`, `Sum256Hex`.
- `crypto/hmac`: `SHA256(key, data)`, `SHA256Hex(key, data)`.
- `strconv`: `Atoi`, `Itoa`, `ParseBool`, `FormatBool`.
- `errors`: `New`.

## Admin API & SQLite Trace

All routes require the administrator token:

| Route | Behavior |
|---|---|
| `GET /api/traffic/hooks` | Lists hooks in execution order (`priority ASC, id ASC`) with `version`, `load_error`, `last_error`, and `enabled_by_env`. |
| `POST /api/traffic/hooks` | Validates AST + matchers (400 on error) and creates a disabled hook (`version: 1`). |
| `PUT /api/traffic/hooks/{id}` | Validates and updates the hook, incrementing `version` and appending to `traffic_tamper_hook_versions`. |
| `DELETE /api/traffic/hooks/{id}` | Deletes hook and cascades its version history. |
| `POST /api/traffic/hooks/{id}/toggle` | Body `{"enabled": true|false}`. |
| `GET /api/traffic/hooks/{id}/versions` | Lists stored revisions newest-first. |
| `POST /api/traffic/hooks/{id}/rollback` | Body `{"version": N}`; restores revision `N` as a new monotonic version. |
| `POST /api/traffic/hooks/dry-run` | Executes a stored (`hook_id`) or inline (`phase`, `matchers`, `source`) hook against synthetic `request`/`response` without touching live traffic. |

In SQLite, `exchange_rewrites` adds `source_kind` (`'rule'` | `'hook'`), `hook_id`, and `hook_version`. Hook trace rows store compact metadata JSON (`{"kind":"hook","id":...,"name":...,"version":...,"sha256":...}`) in `rule_snapshot` (never full source per exchange) and preserve original client/target data in `exchanges`/`exchange_bodies`.
