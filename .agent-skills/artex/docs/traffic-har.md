# Traffic HAR 1.2 Import and Export

ARTEX supports importing and exporting captured HTTP traffic using the **HAR 1.2** JSON format so operators can bring captures from browser DevTools or external proxies into the Traffic store and export filtered subsets out of ARTEX.

Both routes require the standard administrator JWT (`Authorization: Bearer <token>`) like the rest of `/api/traffic`, and return `503` when the traffic store is unavailable.

---

## Import: `POST /api/traffic/import/har`

### Request format

Send a raw HAR 1.2 JSON document directly as the HTTP request body (`Content-Type: application/json`), capped at the standard API JSON body limit (**32 MiB**; oversized bodies return `413 Request Entity Too Large`).

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @capture.har \
  http://127.0.0.1:8787/api/traffic/import/har
```

The Traffic page also provides an **Import HAR** file picker (with the same 32 MiB limit) that reads a `.har` / `.json` file, posts it to this endpoint, displays loading/error state and a count summary, and refreshes the table.

### Validation & error handling

The request is rejected with `400 Bad Request` naming the reason when:

- the body is empty or malformed JSON (including trailing content after the root object),
- the `log` object is missing,
- `log.version` is not `"1.2"`,
- `log.entries` is missing or `null`,
- `log.entries` exceeds the per-import entry cap (`2000` entries).

Individual malformed entries (invalid `startedDateTime`, non-HTTP(S) URL, invalid HTTP method, header/cookie names or values containing CR/LF/NUL, out-of-range status, invalid base64 or unsupported body encoding) do **not** fail the whole import: they are counted in `failed` and reported in `errors` (up to 50 error details) while valid entries continue importing. HTTP/2 pseudo-headers starting with `:` (such as `:authority` or `:method` from browser DevTools) are skipped cleanly.

### Response

```json
{
  "imported": 12,
  "skipped": 3,
  "failed": 1,
  "truncated": false,
  "errors": [
    { "index": 4, "url": "notaurl", "reason": "invalid request url \"notaurl\"" }
  ]
}
```

### Deterministic IDs, round-trip fidelity, & idempotence

- **ARTEX exports (`_artexExchangeId`)**: Every entry exported by ARTEX carries the HAR 1.2 custom field `_artexExchangeId` set to the exchange's stored ID. When a valid `_artexExchangeId` (`[A-Za-z0-9._:-]`, 1–128 chars) is present on import, ARTEX preserves it. This guarantees that two distinct ARTEX exchanges recorded within the same second with identical method, URL, status, and bodies do **not** collapse into one row when imported into a fresh store, and that re-importing an export into the source store stays idempotent (`skipped`).
- **External HARs (no `_artexExchangeId`)**: Each entry receives a deterministic content-based ID:

```text
har-<hex(sha256(ts_unix_seconds + NUL + METHOD + NUL + canonical_url + NUL + status + NUL + sha256(req_body) + NUL + sha256(resp_body)))>
```

  `ts_unix_seconds` is `startedDateTime` parsed as RFC 3339 and truncated to UTC Unix seconds (matching `exchanges.ts`). Re-importing the same external HAR skips existing IDs (`INSERT OR IGNORE`, hot rows always win). Identical entries in the same external HAR sharing `(ts_unix_seconds, method, canonical_url, status, req_body, resp_body)` are deduplicated (the first is imported, duplicates are counted in `skipped`).

### Storage, bodies, cookies, `postData.params`, and userinfo

- **URL userinfo**: Any `user:pass@` userinfo in `request.url` is stripped before storing, indexing, listing, exporting, or reporting errors (matching ARTEX's asset store).
- `host` is derived from `URL.Hostname()` and `url_template` from `db.TemplatePath(URL.EscapedPath())`; `path` stays empty.
- **Bodies & base64**: `response.content.text` and `request.postData.text` are stored as raw UTF-8 bytes when `encoding` is empty, and decoded via standard base64 when `encoding` is `"base64"`. When `request.postData.text` is empty and `request.postData.params` is populated, ARTEX reconstructs the form body as `application/x-www-form-urlencoded` (preserving parameter order).
- **Cookies arrays**: When `request.headers` does not already include a `Cookie` header and `request.cookies` is non-empty, ARTEX synthesizes a `Cookie` header from `request.cookies`. Likewise, when `response.headers` does not already include a `Set-Cookie` header and `response.cookies` is non-empty, ARTEX synthesizes `Set-Cookie` headers from `response.cookies`. When the headers are already present, they are kept as-is without duplication.
- `req_len` and `resp_len` record the actual decoded byte lengths.
- `content_type` comes from `response.content.mimeType` (falling back to the response `Content-Type` header).
- Bodies larger than the 256 KiB inline threshold spill to the content-addressed blob store (`_blobs/sha256/...`) with `blob_refs` rows, and searchable text bodies are added to the `ex_fts` full-text index — identical to proxy capture and `ImportArchive`.

### Capture rewrite rules are NOT applied

HAR import writes directly to the traffic store without passing through the MITM capture proxy. **Capture rewrite rules are never applied to imported exchanges**, no `exchange_rewrites` rows are created, and imported rows always have `rewritten: false`.

### Import limits

| Limit | Default | Behavior when exceeded |
|---|---|---|
| Raw HTTP request body | 32 MiB | `413 Request Entity Too Large` |
| Entries per HAR | 2,000 | `400 Bad Request` |
| Total decoded request + response body bytes | 32 MiB | Stops importing remaining entries, sets `"truncated": true`, counts remaining entries in `skipped`, and appends an explanatory item in `errors`. |

---

## Export: `GET /api/traffic/export/har`

### Request & filters

Returns an `application/json` HAR 1.2 document (`Content-Disposition: attachment; filename="artex-traffic.har"`) ordered deterministically by `(ts ASC, id ASC)`.

It reuses the same filter parser and SQL predicate builder as `GET /api/traffic`, supporting:

- `host`, `method`, `path`, `status`, `q`, `body`, `rewritten` (`all` | `rewritten` | `original` | `true` | `false`), `resp_min`, `resp_max`.

### HAR 1.2 compliance & unknown placeholders

- `log.version` is `"1.2"` and `log.creator` is `{"name": "ARTEX", "version": "<build-version>"}`.
- `startedDateTime` is formatted from `exchanges.ts` as UTC RFC 3339, and `_artexExchangeId` carries the exchange's stored ID.
- Request and response headers are parsed from the stored raw heads (`req_head` / `resp_head`). ARTEX does not invent `serverIPAddress` or headers that are not present in the store.
- Required HAR 1.2 fields whose values are not recorded by ARTEX are emitted with explicit **unknown placeholders** rather than fabricated measurements:
  - `entry.time`: `0`
  - `entry.cache`: `{}`
  - `entry.timings`: `{"send": -1, "wait": -1, "receive": -1}` (unknown/unavailable per HAR 1.2)
  - `request.cookies`, `request.queryString`, `response.cookies`: `[]`
  - `request.headersSize`, `response.headersSize`: `-1` (unknown per HAR 1.2)
  - `response.redirectURL`: `""`
- Bodies are read in full from inline columns or spilled blobs: valid NUL-free UTF-8 bodies are emitted as plain `text`, and binary / non-UTF-8 bodies are emitted with `encoding: "base64"`.

### Export limits, import-compatibility invariant, & truncation reporting

| Limit | Default | `truncatedReason` |
|---|---|---|
| Exported entries | 1,000 | `max_entries` |
| Total raw request + response headers and bodies | 20 MiB | `max_bytes` |
| Marshaled JSON size backstop | 31 MiB | `max_bytes` |

**Cap invariant**: Every HAR produced by `GET /api/traffic/export/har` fits inside `POST /api/traffic/import/har`'s **32 MiB** HTTP body limit (and the Traffic page's 32 MiB file limit). Raw headers and bodies are capped at **20 MiB** so worst-case base64 expansion (`4/3x ≈ 26.7 MiB`) plus JSON structure stays comfortably under 32 MiB, backed by an explicit **31 MiB** marshaled-JSON cap so even heavily JSON-escaped payloads cannot trigger a `413` on re-import.

Truncation is never silent. Every export reports it in both HTTP response headers and HAR 1.2 custom (`_`-prefixed) `log` fields:

- Headers:
  - `X-ARTEX-HAR-Truncated: true|false`
  - `X-ARTEX-HAR-Truncated-Reason: max_entries|max_bytes` (when truncated)
  - `X-ARTEX-HAR-Exported: <count>`
  - `X-ARTEX-HAR-Matched: <total matching rows>`
- JSON (`log` object, omitted when not truncated):
  - `_truncated: true`
  - `_truncatedReason: "max_entries" | "max_bytes"`
  - `_totalMatched: <total matching rows>`
