# Capture-proxy rewrite rules

A rewrite rule matches a request or a response that goes through the capture proxy and describes
how to change it: the method, the path and query, headers, the body, the status code.

**Status: the capture proxy applies enabled rules to HTTP traffic (request and response phases),
records what it did, tags bound evidence snapshots, supports per-replay rule opt-in, carries
rewrite provenance in traffic archive v2, exposes rewrite counters and a rewritten filter/flag on
`GET /api/traffic`, and shows the filter and badge on the Traffic page.** Not yet in this change:
the rule-management web UI. See [Application in the capture proxy](#application-in-the-capture-proxy)
for what is covered and what is not.

Rules are a convenience for the operator, not a security control: a rule that fails leaves the
message unchanged (fail open).

## Rule

| Field | Meaning |
|---|---|
| `name` | Required. |
| `enabled` | A rule is created disabled, whatever the request says. Enable it with the toggle or an update. |
| `phase` | `request` or `response`. |
| `priority` | Rules run by priority ascending, then id ascending: the highest priority runs last and wins. Each rule sees the output of the previous one. |
| `matchers` | Object, see below. |
| `actions` | Array, at least one, see below. |
| `note` | Free text. |

### Matchers

All matchers of a rule must hold. An absent matcher is true.

| Matcher | Phase | Meaning |
|---|---|---|
| `methods` | both | List of methods, case-insensitive. |
| `host` | both | Host name without port, case-insensitive: an exact name, or a suffix glob `*.example.com` (which does not match `example.com`). No other wildcard. |
| `url_regex` | both | Applied to the path and query. |
| `headers` | both | List of `{name, value_regex}` on the request headers. The name is case-insensitive; an empty `value_regex` tests presence. |
| `body_regex` | both | Applied to the request body. |
| `status` | response | List of codes (`404`) or classes (`4xx`), any of. |
| `resp_headers` | response | Like `headers`, on the response. |
| `resp_body_regex` | response | Applied to the response body. |

In the response phase, the request matchers see the request as it was sent to the target, that is,
after the request-phase rules.

Regular expressions use Go's `regexp` syntax (RE2).

### Actions

| Action | Phase | Fields | Effect |
|---|---|---|---|
| `set_method` | request | `value` | Replaces the method. `CONNECT` is refused. |
| `set_path_query` | request | `value` | Replaces the path and query. Must start with `/`. |
| `replace_url` | request | `regex`, `value` | Regex replacement on the path and query only. |
| `delete_header` | both | `name` | Removes every value of the header. |
| `set_header` | both | `name`, `value` | Replaces every value of the header with one. |
| `replace_header` | both | `name`, `regex`, `value` | Regex replacement on each value. |
| `set_body` | both | `value` | Replaces the body. |
| `replace_body` | both | `regex`, `value` | Regex replacement on the body. |
| `set_status` | response | `value` | Replaces the status code: 200 to 599, except 204 and 304. |

In a replacement, `value` is a template: `$1` or `${name}` insert a capture group.

Within a rule, actions run in a fixed order whatever the order they are listed in: method and URL,
`delete_header`, `set_header` and `replace_header` (in listed order), body, status. A rule is
atomic: if one action fails, none of the rule's actions applies.

A rule can never change the scheme, the host or the port. These header targets are refused: `Host`,
`Content-Length`, `Transfer-Encoding`, `Connection`, `Keep-Alive`, `TE`, `Trailer`, `Expect`,
`Upgrade` and every `Proxy-*` header. A header value cannot contain a line break or a NUL byte.

A rule that reads or rewrites a body is skipped whole, its header, URL and status actions included,
when that body is binary, larger than 1 MiB, compressed (`Content-Encoding` other than `identity`),
streamed, or absent by protocol (response to `HEAD`, status 1xx, 204 or 304).

### Sensitive actions

An action marked `"sensitive": true` keeps its `value` out of every API response. A read returns
the action without `value` and with `"value_set": true`.

On update, a sensitive action sent without `value` keeps the stored value, provided the stored
rule has exactly one sensitive action with the same type, header name (case-insensitive) and
`regex`, whatever its position: actions can be reordered without sending their values. When the
stored rule has no such action, or several (same type, same name, same `regex`), the update is
refused with HTTP 400 and the value must be sent again. An explicit `"value": ""` is a value.

A stored sensitive value is not written to a new destination. When an update keeps at least one
stored value, the `host` matcher must stay the same (compared case-insensitively); otherwise the
update is refused with HTTP 400 and the value must be sent again or cleared. The `url_regex`
matcher is not part of this comparison, an accepted limit: a kept value follows a rule whose
`url_regex` changes on the same host.

The flag covers the action's value only. Matchers are not masked. A value an action places in the
URL, marked sensitive or not, is sent to the target as part of the URL.

## Limits

| Limit | Value |
|---|---|
| Rules | 100, of which 50 enabled |
| Regular expression | 1 KiB |
| Value or replacement template | 1 MiB |

A request over a limit is refused with HTTP 400.

## API

All routes require the administrator token, like the rest of `/api`.

| Route | Effect |
|---|---|
| `GET /api/traffic/rewrite-rules` | `{"rules": [...]}` in execution order. |
| `POST /api/traffic/rewrite-rules` | Creates a rule (disabled). |
| `PUT /api/traffic/rewrite-rules/{id}` | Replaces a rule. |
| `DELETE /api/traffic/rewrite-rules/{id}` | Deletes a rule. |
| `POST /api/traffic/rewrite-rules/{id}/toggle` | Body `{"enabled": true}`. |

A rule the validation refuses, or a limit reached, answers 400; an unknown id answers 404.

```json
{
  "name": "staging token",
  "phase": "request",
  "priority": 10,
  "matchers": {"host": "*.staging.example.com", "methods": ["GET", "POST"]},
  "actions": [
    {"type": "set_header", "name": "Authorization", "value": "Bearer ...", "sensitive": true},
    {"type": "replace_url", "regex": "^/v1/", "value": "/v2/"}
  ],
  "note": ""
}
```

A rule in a response also carries `load_error` when it is enabled but left out of the running
snapshot (for example a rule saved by an older version that the current validation refuses), and
`last_error` (`class`, `at`, `count`) for its most recent run-time error. `last_error` is kept in
memory and lost at restart.

Rules are never exposed as an agent tool.

## Storage

Rules live in the PostgreSQL table `traffic_rewrite_rules` (migration
`0005_traffic_rewrite_rules.sql`). They are global configuration and are not part of a task
archive. The `matchers` and `actions` columns are encrypted at rest with the instance secret key,
like the other stored secrets: a database backup without `keys/secret.key` (or `ARTEX_SECRET_KEY`)
cannot restore them, and ARTEX refuses to start under a key that cannot open them.

The server compiles the enabled rules into an immutable snapshot at startup and after every rule
change, and hands it to the proxy without a restart.

## Application in the capture proxy

The proxy applies the snapshot to each exchange in two phases. The request phase runs before the
request is sent to the target; the response phase runs before the response is returned to the
client. Each rule sees the output of the previous one. Only rules whose phase matches the step
are run, and a rule that fails leaves the message as it was (fail open).

### What is recorded

For a rewritten exchange, the record keeps the request as the client sent it and the response as
the target sent it. The rewritten values are not stored as the exchange's original data.

- Each action that ran (applied, skipped or failed) is written in the SQLite table
  `exchange_rewrites`, in the same transaction as the exchange itself, with the rule id, a copy of
  the rule as it was applied, the action, the outcome and the reason.
- The before value is kept as its SHA-256. The after value is kept as the value itself, inline or
  in the blob store when it is large, with its SHA-256. A sensitive action stores neither value nor
  plain hash: its after value is not stored, and the hashes it leaves are a keyed HMAC when a key is
  available (empty otherwise). The same HMAC applies to later actions on a field a sensitive action
  wrote.
- `traffic_get` shows a `=== REWRITTEN ===` line naming the rule ids when the exchange was changed.
  The line says that the shown values are the originals.
- `traffic_search` searches only the original values. It never finds a value that a rule wrote.

Reasons a rule is not applied are recorded in the trace, for example `not rewritten: binary`,
`not rewritten: stream`, or `not rewritten: snapshot capacity`.

### Streams: SSE and WebSocket

- **SSE** (`text/event-stream`): status and headers are rewritten at the start of the stream
  (SSEStart), since they are sent once. Later event frames pass unchanged.
- **WebSocket**: not rewritten. The capture library calls its start hook after the upgrade is
  already done, and it short-circuits the upgrade before the request and response hooks run, so
  the handshake status and headers cannot be changed. Frames pass unchanged. The exchange is
  traced `not rewritten: stream`.

### Large responses

go-mitmproxy does not call the response hook for a body of 5 MiB or more (its `StreamLargeBodies`
default). Such a response is forwarded to the client unchanged and is not recorded in full, and no
response rule runs on it.

### Snapshot limits

Each exchange with a rewrite trace (at least one rule matched and produced a line: applied, skipped or failed) keeps an original copy in memory until it finishes. Limits:

| Limit | Value |
|---|---|
| Entries holding an original request | 1024 |
| Bytes held by those entries | 64 MiB |
| Tombstones (slots whose data was released) | 4096 |
| Time after which the slot of a live flow may be turned into a tombstone (see below) | 15 minutes |

When there is no room, the request is not rewritten. The exchange is traced `not rewritten: snapshot capacity` when a tombstone slot is free; when the tombstone table is full, the request is refused with no trace line at all (the refusal is counted and logged, at most once a minute).
The slot of a finished flow is swept when its connection closes (at most once per second) and at
least once a minute while slots exist. The 15-minute TTL never deletes a live flow's slot: past it,
the slot may be converted into a tombstone if a new reservation needs the room.

### Replay

`POST /api/traffic/replay` sends the edited request through the recording proxy so the exchange is
captured in Traffic, but **bypasses capture rewrite rules by default** (`apply_rules: false`). To
run enabled capture rules against a replay and trace them like captured traffic, opt in with
`"apply_rules": true` (or check **Apply capture rewrite rules** in the Replay panel).

When `apply_rules` is false, `traffic.Replay` registers a single-use random 32-byte hex nonce in an
in-memory registry, attaches the internal header `X-ARTEX-Replay-Nonce: <nonce>`, and removes the
nonce when the call returns. The capture proxy strips `X-ARTEX-Replay-Nonce` unconditionally in the
request hook so the target never sees it; only a value matching a registered nonce bypasses both
request and response rule phases, while any forged header is stripped and ignored.

### Stats

`GET /api/traffic` includes a `rewrite` object exposing the proxy's `RewriteStats` counters since
start: `large_responses`, `capacity_refusals`, `tombstone_drops`, `conversions`, and `sweeps`.

### Traffic list

Each exchange returned by `GET /api/traffic` carries `"rewritten": true|false`, computed with an
`EXISTS` check against `exchange_rewrites` for rows with `outcome = 'applied'` (skipped or failed
rules do not mark an exchange as rewritten).

`GET /api/traffic` accepts an optional `rewritten` query parameter:

- `all` (default when omitted or unrecognized): returns all exchanges.
- `rewritten` (alias `true`): returns only exchanges with at least one applied rewrite row.
- `original` (alias `false`): returns only exchanges with no applied rewrite row.

The filter combines with `host`, `method`, `path`, `status`, `q`, `body`, `resp_min`, and
`resp_max` using `AND`, and `total` and pagination reflect the filtered set. The Traffic page shows
the filter next to the existing filters and renders a `Rewritten` badge on rewritten rows.

### Task archives (v2)

Task archives export captured traffic into `traffic/traffic.json` using **format version 2**:

- Each `ArchiveExchange` carries optional `rewritten` (`bool`) and `rewrite_rule_ids` (`[]int64`),
  matching `RewriteInfo` (applied rows only, sorted ascending, distinct). Exchanges with no applied
  rewrite omit both fields.
- Output stays deterministic: exchanges are ordered by `(ts, id)`, `rewrite_rule_ids` are sorted
  and distinct, and `blobs` are sorted so re-exporting the same data produces a byte-identical
  `traffic.json`.
- `ImportArchive` accepts versions 1 and 2 and refuses any other version. Version 1 entries import
  as unrewritten with no rule IDs. Version 2 entries marked `rewritten: true` reconstruct minimal
  applied rows in `exchange_rewrites` (`phase = 'archived'`, `outcome = 'applied'`,
  `reason = 'archived'`, `rule_snapshot = NULL`) for each distinct rule ID (or a single `NULL`
  `rule_id` row when `rewrite_rule_ids` is empty), preserving `RewriteInfo`, `traffic_get`'s
  `=== REWRITTEN ===` header, evidence-binding provenance, and the traffic list filter without
  fabricating a rule snapshot or request/response phase. Existing hot rows always win on import.
