# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Wildcard domains in asset scope**: a scope line such as `*.example.com`, the way bug bounty programs write a domain and its subdomains, is accepted in company and task asset scope and stored as the `example.com` domain rule, which already covers its subdomains. A URL form (`https://*.example.com/`) works too. The wildcard is accepted only on a registrable domain: `*.api.example.com`, `*.co.uk` and `*.<IP>` are still rejected, because no rule covers only a subdomain's subdomains (#519).
- **Stream viewer direction filter** (follow-up to #380): the Traffic detail's Stream tab can show all messages, client-to-server messages or server-to-client messages. Pagination and refresh keep the selected direction, changing the filter resets the list, and opening another exchange resets the direction to all. Recording-limit warnings remain visible but are excluded from the displayed message counts.
- **Security response headers on every response**: `X-Content-Type-Options: nosniff`, a same-origin referrer policy, `X-Frame-Options: SAMEORIGIN` and a `frame-ancestors 'self'` CSP are now set by one wrapper around the whole handler tree, so the JSON API carries them too; previously only the console route did. Console documents additionally get `Permissions-Policy` and COOP/CORP. `Strict-Transport-Security` is sent only when the request is known to be HTTPS: directly over TLS, or via `X-Forwarded-Proto: https` from a peer in `ARTEX_TRUSTED_PROXIES`, so a direct client cannot claim HTTPS on its own. The README reverse-proxy recipe now starts with an 80 to 443 redirect.
- **Global company switcher**: the sidebar header carries a company picker (search, an explicit "all companies", the asset count). It persists per browser and narrows these views on the server: the findings list, grouped view, asset tree and stat cards (`GET /api/exploration/findings`, `/groups`, `/asset-tree`, `/stats` take `company`), the dashboard findings panels (same list endpoint), the task list (`GET /api/tasks?company=`), the traffic list (`GET /api/traffic?company=`, the hosts the company owns) and the asset tabs (`GET /api/assets?company_id=`, plain and DSL path; the company clause is ANDed outside the compiled DSL). A finding belongs to a company through its live assets. A finding with no live asset belongs to a company only when its task is scoped to that company (`task_scope` kind `company`); otherwise it shows under "all companies" only. An unknown or non-numeric company id returns nothing (#425).
- **Go vulnerability scanning in CI**: every push and pull request runs the official `govulncheck` action against packages reachable from `./...`, using the Go version declared by `go.mod`. Run the same check locally with `./scripts/verify.sh --security`.

### Fixed

- **Missing Docker buildx is reported before the build**: without the buildx plugin, Compose only warns and falls back to the legacy builder, which fails on the Dockerfile's first `FROM --platform=$BUILDPLATFORM` with `failed to parse platform`. `install.sh` (all-Docker) and `update.sh` (Docker update) now check `docker buildx version` first and stop with an install hint, and the automatic Docker install on apt-based distros not covered by get.docker.com installs the buildx package as well. The README Docker section names buildx as a requirement.
- **A goal URL followed by punctuation is still seeded**: a goal such as `Assess http://juiceshop:3000.` no longer logs `could not parse a target host/IP` and skips the site. Trailing punctuation, including full-width `。` and a closing bracket that has no matching opener, is trimmed from the URL before it is parsed, so `http://[::1]` is left alone. The scheme the goal names is kept and a final period does not end up in the host.
- **Task timeout triggers fire for every task**: `on_task_timeout` used the task id as a watermark, but tasks time out in deadline order. Once a newer task timed out first, an older task that timed out later was never fired for. Fired timeouts are now kept in a persisted set, like met goals; on first start the set is seeded with the tasks already timed out, so nothing replays.
- **A named pipe in the task workspace no longer hangs the archive worker**: packing opened every non-directory entry, and opening a FIFO blocks until a writer appears, so the single archive worker stopped there and every later archive, restore and delete job waited behind it. A socket failed the archive instead, and a device was packed but refused on restore. The packer now skips every entry that is neither a directory nor a regular file, as it already did for symlinks.
- **Task form does not keep test-account secrets on screen**: after a task is created the credential rows are cleared, and the password field is masked.
- **LLM connection-test logs stay one line**: the response body written by a connection test has CR and LF replaced with spaces before it is logged, so the body cannot start a second log record.
- **Benchmark judge validation**: grading and the judge's falsification battery require one verdict per ground-truth ID, actual boolean decisions and gates, and matches to the supplied scanner findings. Invalid grading responses use the existing three-attempt budget and abort without writing scores, rather than counting duplicate IDs or truthy strings such as `"false"`.
- **Live log subscribers can no longer crash the process**: a client disconnect closes its log channel. The sink now delivers a line while it still holds the subscriber lock, so that close cannot land in the middle of the send.
- **Notification delivery ignores HTTP_PROXY**: the dial guard checks the address it connects to. An environment proxy made that address the proxy, so a link-local target could still be reached. Notification HTTP now connects directly.
- **Captured traffic blobs are owner-only**: HTTP and raw-stream bodies spilled out of the database are written `0600`, and their bucket directory is `0700`. An existing blob is tightened when it is seen again.
- **Asset URLs drop userinfo when parsing fails**: a URL `url.Parse` rejects is no longer stored unchanged. The `scheme://userinfo@` prefix is removed first, so a password in that prefix does not land in the asset row.
- **Hook `==` keeps the fraction of a float**: comparing a float with an integer truncated the float first, so `1.5 == 1` and `-0.5 == 0` were true. A number decoded by `json.Decode` is a float, so a hook testing `m["amount"] == 0` matched `{"amount":0.5}`. A float on either side is now compared as a float.
- **Hook `range` counts against the memory budget**: ranging over a body, slice, string, or map charges the iteration before the loop. A body larger than the hook budget now stops with the memory limit instead of allocating one element at a time with no check.
- **Chat upload name search stops**: choosing `name`, `name-1`, `name-2`, … now returns an error when the filesystem rejects the path or after 10000 collisions, instead of looping while `Stat` keeps failing.
- **Uploads do not follow a symlink**: chat and workspace uploads `Lstat` the destination and refuse to write when it is already a symlink. A dangling link is no longer treated as a free name.
- **Hardening follow-up for the upload and capture fixes**: existing spill blob directories and files are tightened on startup, hook `range` charges 32 bytes per pair, and uploads open with `O_NOFOLLOW` on Unix. The Windows upload path keeps the `Lstat` check.
- **Docker Compose database passwords with URL-special characters**: `docker-compose.yml` no longer pastes `POSTGRES_PASSWORD` into `ARTEX_PG_DSN`. The server builds the URL from `ARTEX_PG_HOST`, `ARTEX_PG_PORT`, `ARTEX_PG_USER`, `ARTEX_PG_PASSWORD`, `ARTEX_PG_DBNAME` and `ARTEX_PG_SSLMODE`, percent-encoding the user and password, so `/`, `?`, `%`, `@`, `:` and spaces connect. An explicit `ARTEX_PG_DSN` still wins and is not rewritten. `ARTEX_PG_PASSWORD` is removed from the environment with the other startup secrets (#450).

## [0.7.0] - 2026-11-21

Agent-driven traffic capture (SOCKS5, transparent TCP and raw UDP), operator tampering hooks with their admin panel, the agentic injection and proof hardening from the #124 audit, LLM context telemetry and the worker cache-prefix split, capture-proxy rewrite rules, HAR import and export, and a large security batch across the interception gate, sessions, logs, the workspace file API and the model endpoint probe.

### Added

- **Traffic > Hooks admin panel (P4.2 PR2)**: the Traffic page gains an operator-only Hooks tab for the constrained Go tampering hooks: list, create (always created disabled), edit, delete, toggle, version history with rollback, and a dry-run against a captured exchange or a synthetic input. A dry-run shows the mutated request or response, the fields the hook changed, and the per-line trace, with masked fields shown as their keyed HMAC. Binary and compressed bodies are flagged and skipped, bodies over 1 MiB are flagged, and the UI never renders hook or exchange text as HTML (#435).
- **Concurrent multi-LLM worker rotation** (#270): a task can rotate several bound LLM profiles across its workers, with per-lane exhaustion tracked and shown on the task controls.
- **Encrypted S3 archive storage** (#285, #318): an optional S3 backend stores task archives encrypted, connects with the existing archive lifecycle, and lets an interrupted archive job be recovered on the next start.
- **Turkish and Simplified Chinese UI, optional Neon theme** (#346, #413, #401): the web console gains a translation layer with a Turkish and a Simplified Chinese locale, and an opt-in Neon theme preset in Settings.
- **Readiness probe** (#363): `GET /api/ready` checks PostgreSQL and reports readiness separately from the health route.
- **Operator console browser protections** (#349): the embedded console restricts framing to the same origin and keeps referrer information on the same origin.
- **Target noise governor**: one shared egress governor paces ARTEX's own HTTP requests (WebFetch, the http custom tools and the enrich probe) against a noise profile (`off` by default, `quiet`, `balanced`, `aggressive`): a per-host token bucket with jitter, per-host and global in-flight caps, 429/503 backoff, GET deduplication with a short cache, and a configurable target User-Agent (`ARTEX_TARGET_USER_AGENT`). Off is a strict passthrough (#205).
- **Low-and-slow prompt block**: when a noise profile is set, the planner, worker, main agent and chat prompts carry the per-host limits of the profile and the exact rate or delay flags for nmap, nuclei, httpx, katana, ffuf, dalfox and sqlmap; with the profile off the prompts are unchanged (#212).
- **Noise profile at runtime**: System settings has a **Target noise** card. It sets the profile (`off`, `quiet`, `balanced`, `aggressive`) through the `noise_profile` setting, which takes precedence over `ARTEX_NOISE_PROFILE`. The change applies to the next WebFetch, http custom tool and enrich request, and to the next agent prompt, without a restart. The card also shows the per-host counters, which `GET /api/settings/noise` returns (#233).
- **Bash requests paced through the capture proxy**: with traffic capture on, the Bash proxy URL carries a marker userinfo. The recording proxy paces each request of a marked connection by the noise profile's per-host rate and jitter, and counts it, before it goes upstream. This applies inside CONNECT tunnels too. WebFetch, the http custom tools and enrich keep the unmarked URL and are not paced twice. The proxy now drops `Proxy-Authorization` from every request it forwards or records. This is best effort: only clients that honour the proxy are covered, with capture on (#234).
- **Hierarchical budgets**, off by default: a task budget and a per-intent budget take the minimum of their own budget and the parent's remaining budget above the wrap-up reserve, planner calls count inside the task, and reaching the reserve forces a wrap-up (#206).
- **Coverage ledger**: the worker records what it examined, ruled out or left open for each surface and risk class with `record_coverage`; gaps, unexamined classes and completeness appear in the planner context, `GET /api/tasks/{id}/coverage`, the coverage card and the Markdown report (#207).
- **Closed-question judge**: the LLM fallback judge answers eight fixed questions that the code owns and the code takes the decision; every failure now leads to ask instead of allow, and the previous behaviour stays available as `llm_judge_mode = freeform` (#208).
- **argv interception rules**: a new `match_type = argv` matches the parsed prefix of a Bash command exactly, and a pending Bash approval can create such a rule in one click; a code-owned denylist refuses programs where a prefix would allow arbitrary code (#210, #211).
- **Scanner output ingestion**: `ingest_scan_output` parses nmap XML, nuclei JSONL, httpx JSONL and ffuf JSON, and writes assets and facts deterministically, so the model never reads the raw output (#214, #215).
- **bbot ingestion**: a typed parser splits bbot JSONL events by `scope_distance`, only in-scope events go through `insert_assets`, and `ingest_bbot` reads the file line by line with a 64 KiB cap (#199, #200).
- **Tool RAG**, off by default: when the bound tool list of an agent is large, only the subset relevant to the current intent is injected, as a projection that never adds or edits a tool (`ARTEX_TOOL_RAG`) (#204).
- **Fact provenance**: `record_fact` takes a closed `source` enum (default `inference`) and every fact carries the server-set `origin`, both shown in `recent_facts`, `list_facts` and `expand_digest` (#194).
- **Per-message nonce envelope**: agent- and target-derived fields reach the planner and worker user messages inside a code-owned data envelope with a random nonce per message; operator input stays outside it (#195).
- **Intercept risk score and batch approval**: a deterministic risk score (low, medium, high) is shown on each pending approval, and up to 100 pending decisions can be settled in one call, each through the existing single-decision path (#232).
- **`ask_operator` target warning**: a request whose question names a host or URL outside the goal targets is tagged as containing target-derived text (#197).
- **Opt-in update banner**: `ARTEX_UPDATE_CHECK` makes the backend check the latest GitHub release at most once per 24 hours and the UI show a banner; off by default (#202).
- **Release provenance**: release archives carry GitHub build provenance attestations and a CycloneDX SBOM (`gh attestation verify <zip> --repo BaaRai/ARTEX`); release notes are the matching `CHANGELOG.md` section (#219, #201).
- **Opt-in constrained Go tampering hooks — backend, API & trace (P4.2 PR1)**: opt-in behind `ARTEX_TAMPER_HOOKS_ENABLED=1` (off by default; flag off loads zero hooks and keeps the no-hook baseline unchanged). Adds a small, deterministic, zero-dependency Go-subset evaluator (`traffic/hookvm`, parsed via `go/parser` with sorted map iteration, hard 100k step / 25 ms per-hook / 100 ms per-phase / 4 MiB memory bounds, and AST rejection of FS/network/exec/env/time/rand/goroutine/channel/defer/goto/global-var/pointer/switch constructs). Operator-only hooks (never an agent tool) are stored sealed at rest in `traffic_tamper_hooks` and `traffic_tamper_hook_versions` (migration `0011_traffic_tamper_hooks.sql`), managed via `/api/traffic/hooks*` (CRUD, toggle, version history, rollback, dry-run), prefiltered with `traffic/rewrite` matchers, executed after declarative rewrite rules per phase (fail-open only in 0.7; binary/compressed/>1 MiB bodies skipped; tainted sensitive fields stay HMAC-masked), and traced in SQLite `exchange_rewrites` (`source_kind`, `hook_id`, `hook_version`). See `docs/traffic-tamper-hooks.md`.
- **Opt-in SOCKS5 UDP ASSOCIATE & raw UDP recording (P4.1c)**: when traffic capture is enabled, setting `ARTEX_SOCKS5_UDP_ENABLED=1` enables RFC 1928 `UDP ASSOCIATE` (`0x03`, IPv4 first) on the SOCKS5 listener (off by default: with flags off no listener starts; with SOCKS5 TCP on and UDP off, `UDP ASSOCIATE` returns `0x07` and no UDP socket is opened). Enforces per-datagram destination policy before forwarding using the existing target gate (`intercept.Interceptor.ResolveUDP4` / `intercept.PinnedUDP4Resolver`) and egress governor (`egress.Do`), dropping denied datagrams without passthrough; bounds associations (`UDPMaxDatagrams`, `UDPMaxBytes`, `UDPIdleTimeout`) and tears them down with the TCP control connection; drops `FRAG != 0` with no fragmentation reassembly; and records each forwarded datagram individually in SQLite `raw_udp_datagrams` with capped previews and atomic `_blobs` refs without writing HTTP `exchanges` rows or PG migrations. Transparent UDP (`IP_RECVORIGDSTADDR`) is deferred to C2. See `docs/traffic-socks5-udp.md`.
- **Opt-in Linux transparent TCP inbound & raw TCP recording (P4.1b)**: on Linux when traffic capture is enabled, setting `ARTEX_TRANSPARENT_TCP_ENABLED=1` (loopback `127.0.0.1:1081` by default) or `ARTEX_TRANSPARENT_TCP_ADDR=<ipv4:port>` starts an IPv4 transparent TCP listener fed by operator-managed `iptables`/`nftables` `REDIRECT` rules (off by default; ARTEX never touches the host firewall; root/`CAP_NET_ADMIN` is required only for the operator's redirect rules; IPv6 is not covered). Recovers original IPv4 destinations via `SO_ORIGINAL_DST` with self-redirect loop protection, reuses the P4.1a target gate (`intercept.Interceptor.DialSOCKS5`), egress governor (`egress.Do`), half-close relay bounds, and SQLite `raw_tcp_streams` store (atomic `_blobs` spill, no HTTP `exchanges` row, no PostgreSQL migration). See `docs/traffic-transparent.md`.
- **Opt-in SOCKS5 inbound proxy & raw TCP recording (P4.1a)**: when traffic capture is enabled, setting `ARTEX_SOCKS5_ENABLED=1` (loopback `127.0.0.1:1080` by default) or `ARTEX_SOCKS5_ADDR=<addr>` starts an RFC 1928 SOCKS5 `CONNECT` listener alongside the HTTP recording proxy (off by default; HTTP proxy and agent proxy env vars are unchanged; listener does not start if traffic recording is disabled). Accepts loopback no-auth and RFC 1929 username/password without verifying credentials (carrying `artex-pace` in the username; binding to a non-loopback address therefore exposes an unauthenticated proxy, though the target gate and governor still apply), rejects `BIND`/`UDP ASSOCIATE` with `0x07`, enforces the existing target gate (`intercept.Interceptor.DialSOCKS5` / `intercept.PinnedDialer`) and egress governor (`egress.Do`) before dialing, relays half-close-aware TCP with concurrency/byte/idle/handshake bounds, and records one row per connection in SQLite `raw_tcp_streams` with capped directional previews and atomic (temp+rename) `_blobs` refs without writing HTTP `exchanges` rows. See `docs/traffic-socks5.md`.
- **Opt-in worker cache-prefix split (P3.5 Phase C)**: setting `ARTEX_CACHE_PREFIX=1` (off by default) splits the `worker` system prompt at `DynamicBoundary = 1` into a sibling-shareable static prefix (`body + untrustedContentTail + workerTrafficBlock`) and a per-intent dynamic suffix (`workerArtifactSpec(runDir)` through `<available-deferred-tools>`) without reordering sections or altering the visible joined prompt text. Planner, mainagent, chat, and goals are unchanged; custom worker prompts referencing `{{.Now}}` remain volatile in the static segment. See `docs/context-telemetry.md`.
- **Opt-in LLM context size telemetry (P3.5 Phase A)**: setting `ARTEX_CONTEXT_TELEMETRY=1` (off by default) records per-call request section byte sizes (`system_static`/`system_dynamic` split at `DynamicBoundary`, serialized `tools`, `messages` by role, `tool_result` subset, and `last_message_bytes`), tool/message counts, and token/cache usage in the new `llm_context` table (migration `0009_llm_context.sql`), with zero prompt/behavior change and zero content stored, independent of `llm_record`. `GET /api/llm/context/summary` aggregates input percentiles (`p50`/`p90`/`p99`), pro-rata section shares over real `input_tokens`, `cache_read/input` ratios by `(worker, model)`, and top tasks. See `docs/context-telemetry.md`.
- **HAR 1.2 traffic import and export**: `POST /api/traffic/import/har` imports raw HAR 1.2 JSON captures (up to 32 MiB / 2,000 entries / 32 MiB decoded bodies) with deterministic `har-<sha256>` IDs (and `_artexExchangeId` preservation for ARTEX exports so distinct same-second exchanges round-trip without collapsing), base64 decoding, `postData.params` and `cookies` array fallbacks, URL userinfo stripping, blob spilling above 256 KiB, and full-text indexing, without applying capture rewrite rules (`exchange_rewrites` stays empty); per-entry errors are reported alongside `imported`/`skipped`/`failed` counts. `GET /api/traffic/export/har` exports filtered traffic (reusing the `GET /api/traffic` filters) as a compliant HAR 1.2 document (with explicit unknown placeholders for unrecorded timings and header sizes) in stable `(ts, id)` order, encoding UTF-8 bodies as text and binary bodies as base64, capped at 1,000 entries / 20 MiB raw headers+bodies (31 MiB JSON backstop, guaranteed under the 32 MiB import limit) with explicit truncation reporting via `X-ARTEX-HAR-*` headers and `_truncated`/`_truncatedReason`/`_totalMatched` fields. The Traffic page adds **Import HAR** and **Export HAR** controls. See `docs/traffic-har.md`.
- **Capture-proxy rewrite rules, storage and API**: `GET`, `POST`, `PUT` and `DELETE /api/traffic/rewrite-rules` and `POST /api/traffic/rewrite-rules/{id}/toggle` manage rules that match a request or a response (method, host, URL, headers, body, status) and describe a rewrite (method, path and query, headers, body, status). Rules are validated on save, limited to 100 of which 50 enabled, created disabled, and stored in the new table `traffic_rewrite_rules` (migration `0005_traffic_rewrite_rules.sql`) with `matchers` and `actions` encrypted at rest. The value of an action marked `sensitive` is never returned, and an update sent without it keeps the stored one. The server compiles the enabled rules at startup and after every change and hands the snapshot to the proxy. The proxy applies them from the next entry. See `docs/traffic-rewrite-rules.md`.
- **Capture-proxy rewrite rules applied**: the capture proxy applies enabled rules to each HTTP request before it is sent to the target and to each response before it reaches the client. Each action that ran is recorded in the new table `exchange_rewrites` in the same transaction as the exchange, `traffic_get` shows a `REWRITTEN` line, and `traffic_search` never finds a value a rule wrote. SSE status and headers are rewritten at the start of the stream. **WebSocket handshakes are not rewritten**: the capture library runs its hook after the upgrade, so the status and headers cannot be changed, and frames pass unchanged. **Responses of 5 MiB or more** are forwarded unchanged and not recorded in full, because the library does not call the response hook for them. Snapshots of original requests are capped at 1024 entries and 64 MiB. Replays (`POST /api/traffic/replay`) bypass capture rewrite rules by default via an internal `X-ARTEX-Replay-Nonce` header stripped unconditionally by the proxy, and apply the rules when opted in with `apply_rules: true` (the **Apply capture rewrite rules** checkbox in the Replay panel). `GET /api/traffic` exposes the proxy's `rewrite` counters (`large_responses`, `capacity_refusals`, `tombstone_drops`, `conversions`, `sweeps`), flags each exchange row with `rewritten`, and filters with `rewritten=all|rewritten|original` (also accepting `true`/`false`), surfaced with a filter control and row badge on the Traffic page. Traffic archives export version 2 with per-exchange `rewritten` and sorted distinct applied `rewrite_rule_ids` while remaining deterministic and backward-compatible with version 1 archives. The rule-management web UI comes later.
- **Bulk finding status** (#298): select findings in the findings table and apply one disposition to all of them, up to 500 per call, in one transaction; each row still goes through the single-decision notification semantics and the change is mirrored onto its exploration node (#289).
- **Stream message direction filter** (#379): `GET /api/traffic/stream` and the `traffic_messages` agent tool take an optional `direction` (`c2s` or `s2c`) that lists only one side of a WebSocket or SSE conversation. `total` and `offset` apply to the filtered list, each row keeps its `seq` in the whole stream, and the `meta` row (messages dropped past the recorder limits) stays in a filtered page. Any other value is a 400 (API) or a tool error.
- **Traffic replay** (#266): replay a recorded request from the traffic detail with its method, URL, headers and stored body; replay is disabled when only the body preview is loaded.
- **Finding proof strength in reports** (#268): the Markdown report and the export show each finding's proof strength next to its verification status.
- **Opt-in Keenable web search backend** (#295): the search tool gains Keenable alongside Brave and Tavily; the key is stored encrypted and can be cleared independently.
- **Durable activity outbox** (#300): activity rows that cannot be stored are written to the new `activity_outbox` table (migration `0006_activity_outbox.sql`) and replayed once on the next start. The server stops admitting new work before the drain, and a shutdown cancel leaves an in-flight intent claim running so the next start can reset it to open instead of recording it as done or blocked.
- **LLM model search** (#284): the System → LLM model picker can search the model list, and the API-key field opts out of password-manager autofill.
- **Finding report state** (#308): findings carry a `report_state` (`none`, `submitted`, `accepted`, `rejected`, `duplicate`) for what was sent to a bug bounty program, separate from the triage status; the bulk update accepts both fields, and restoring an older archive fills `none` (migration `0007_finding_report_state.sql`).

### Changed

- **`record_fact` is facts-only** (#410, #282): the tool publishes and accepts facts only; asset writes go through `insert_assets`.
- **Web dependency lockfile** (#438): `source-map-js` 1.2.4 and `baseline-browser-mapping` 2.11.39, past their denial-of-service advisories; `npm audit --omit=dev` is clean.
- **Build and supply-chain hardening** (#408, #416, #419, #420): tool and Node digests are pinned instead of fetching their checksums, `npm ci` runs with `--ignore-scripts` in the build, install and update stages, the web build disables Next.js telemetry, and the api-recon skill lockfile points at the public npm registry.
- **Password changes revoke sessions**: a password change stores a monotonic `auth.password_version` in the same transaction as the hash. Tokens carry that version, so a token from an older version is rejected, including when two changes land in the same second. `reset-password.sh` writes the same counter and requires an ARTEX restart, because the process reads the version at startup. A failed write leaves the previous session valid. Log, activity, and side-question streams re-check the token and close after the version moves. If the version cannot be read at startup, sessions are rejected until the next login reads it.
- **Task budgets survive a restart**: planner, worker, judge, and compactor rows in `llm_usage` are counted back into `ARTEX_TASK_BUDGET_*`. A restored task already inside the wrap-up reserve only has that reserve left, so the run wraps up instead of starting another worker. The per-worker estimate is not restored and starts from the defaults (50,000 tokens and 10 turns) until a worker finishes in this process. Chat, goal decomposition, and side questions stay outside the cap.
- **Untrusted-output boundary is now on by default**: Norma frames tool results for the worker, planner, chat and main agent unless `ARTEX_UNTRUSTED_BOUNDARY` is set to `0`, `false`, `off` or `no`. It was opt-in via `ARTEX_UNTRUSTED_BOUNDARY=1` in 0.6.0 (#166); the default flips here (#203).
- **Versioned migrations**: the `db` package applies numbered `db/migrations/NNNN_slug.sql` files once, in order, under the schema advisory lock, and records a SHA-256 checksum in `schema_migrations`; missing, renamed, changed or out-of-order migrations fail closed (#226).
- **Coverage graph performance**: the coverage graph batches its connector lookups (three queries instead of one per root and per company) and adds the partial index `idx_ts_icp`; on a task of about 3,000 assets the p50 dropped from 126 ms to 27 ms and the queries per call from 221 to 3 (#230).
- **Request body bounds** (#305): JSON request bodies decode at most 32 MiB, every non-multipart body is capped, and an oversized body answers 413 instead of a generic bad request. `ReadTimeout` bounds how long headers and the body may take to arrive without cutting a handler that is already running.
- **Chat attachments up to 512 MiB** (#252): the client, server, compose file and reverse-proxy sample agree on a 512 MiB combined multipart limit.
- **MITM passthrough TTL** (#306): a host that cannot be intercepted is tunnelled for one minute, then interception is tried again; an expired mark counts as intercepted.
- **Norma v0.4.11** (#294).
- **CI**: the suite also runs on the latest Go release as an advisory job, the rewrite-rule engine runs under the race detector, and the gzip/compression fixtures no longer depend on the local Go version (#279, #278).
- **Repository hygiene** (#275): `docs/` is no longer ignored, and contributing documents the 7-open-pull-request cap (#307).

### Fixed

- **Compose private model endpoints** (#406): `ARTEX_LLM_PRIVATE_ENDPOINTS` is passed to the artex container, so the private endpoint allow-list works in the Compose deployment.
- **Bash exit 127 in transcripts** (#398): the session transcript explains a 127 exit as a missing command and shows the matching hint.
- **LLM usage status on early stream exit**: when a consumer stops reading a stream before `message_stop`, the recorder now stores the `llm_usage` row as `error` at that point, whether or not the context was cancelled, instead of inferring the status from `ctx.Err()` in a deferred call. `TestSideUsageRecordedOnceOnConsumerCancellation` runs again (follow-up to #9).
- **RSI lesson trust**: the planner overview carries each finding's triage status, and `prove_goal` refuses a `false_positive`, `duplicate`, or `ignored` finding. A lesson with no company is visible only to tasks that also have no company. Retracted evidence stays on the row with `withdrawn_at` set, extraction runs when a disposition changes or a retest completes, and it still withdraws evidence after a task gains a second company. The rendered lesson block is capped in characters, not bytes.
- **Workspace and skill symlink confinement**: workspace file operations, the skill file APIs and the skill loader resolve symlinks in every path component and refuse a target outside their root, so a link planted in the workspace or a skill directory cannot expose another file.
- **Target gate behind proxies**: a target approval is name-only whenever a proxy is in the path, including the recording proxy, the global egress proxy and a custom tool's own proxy, so the gate never claims an IP binding the proxy does not enforce.
- **Remote MCP response bound**: Streamable HTTP JSON-RPC bodies and SSE data payloads are refused above 8 MiB, so a remote MCP server cannot force an unbounded decode.
- **LLM response capture bound**: each recorded provider attempt keeps at most 1 MiB, and a call keeps at most 8 attempts, so a large or retrying stream cannot grow the recorder without bound. The live stream is unchanged.
- **Intercept audit ring**: `preToolUse` records allow only after intercept and the target gate decide, so a blocked call no longer leaves a leftover allow row in `Guard.Audit()`.
- **DSN password redaction**: `config.Redact` now masks libpq `password=` keywords and `?password=` query values as well as URL userinfo, so a ping-failure log cannot print the database password.
- **Asset DSL nesting**: `ParseDSL` refuses queries longer than 4 KiB or nested more than 32 parentheses deep, so a crafted `dsl` cannot grow the goroutine stack without bound.
- **Retry-After overflow**: a 429/503 `Retry-After` of huge seconds no longer wraps `time.Duration` into a tiny delay. Values above `MaxDelay` are not retried.
- **Conversation message pages**: `GET /api/conversations/{id}/messages` clamps `limit` (200 for history, 1000 for `?since=`), so a huge query cannot load the whole transcript in one response.
- **Findings CSV formula cells**: `FindingsCSV` prefixes name, class, summary, task, and other text fields that start with `=`, `+`, `-`, `@`, tab, or CR so Excel/LibreOffice do not evaluate them as formulas when the export is opened.
- **Asset service links**: the Services tab only uses an asset URL as `href` when it is `http:` or `https:`. `javascript:`, `data:`, and other schemes render as text.
- **Chat session directories**: `ChatAgent.Chat` accepts only `[A-Za-z0-9_-]` session ids (at most 64 bytes) before joining them under `<workDir>/sessions`, so `..` and path separators cannot escape that directory.
- **Change-password rate limit**: `POST /api/auth/change-password` uses the same limiter as login, keyed by client IP and by the session token, so a stolen session cannot guess the current password without backoff.
- **Ingested traffic headers**: `RecordExternal` rejects a method that is not an HTTP token and header names or values that contain CR, LF, or NUL, matching Replay, so ingested exchanges cannot inject extra header lines into stored evidence.
- **Browser MCP starts offline** (#329): the seeded `browser` MCP ran `npx @playwright/mcp`, which contacts the npm registry on every start even with the package installed globally, and Playwright MCP defaulted to a Chrome channel the image does not ship. It now runs the image's `playwright-mcp` binary with `--headless --browser chromium`. Existing databases that still have a stock `npx @playwright/mcp` row (including the common `-y` form) or a `playwright-mcp` row with no `--browser` are rewritten once; any other command or package is left alone. The image also installs the Chromium build `@playwright/mcp` and `@playwright/cli` expect, which is not the same build `playwright install` puts in the cache.
- **CREATE DATABASE identifiers**: `ensureDatabase` now builds the statement with `pgx.Identifier`, which quotes the DSN database name and doubles any embedded quote, so the name cannot close the identifier. No database name PostgreSQL accepts is refused, so existing installs with a hyphen, a dot or non-ASCII characters keep starting.
- **ask_operator image_path**: the screenshot path must resolve inside the run directory of the agent that asks (`<data>/tasks/<id>/i<N>` for a worker, `<data>/tasks/<id>/main` for the main agent). A relative path resolves from that directory and an absolute path must be inside it; `..` segments and symlinks that leave it are refused, so the tool cannot copy an arbitrary server image into the operator transcript. The copy is staged in `<data>/tasks/<id>/uploads`.
- **ask_operator image_path, behavior change**: a worker that passed `i<N>/shot.png` relative to the task directory must now pass `shot.png` from its working directory, or an absolute path inside its run directory.
- **insert_assets fail-closed**: when intercept or task allow/block rules cannot be loaded, `insert_assets` refuses the whole call instead of evaluating an empty rule set (which allowed every asset). The tool result does not include the underlying database error.
- **BlobRange length no longer wraps int64**: `offset+length > size` overflowed when length was near MaxInt64, so the cap was skipped and `make([]byte, length)` could exhaust memory. The bound is now `length > size-offset`.
- **PostgreSQL text[] literals escape backslashes**: `marshalStringArray` quoted double quotes but not backslashes, so a value ending in `\"` could close the current array element and inject another. It now doubles backslashes before quotes, matching `marshalJSONBArray`.
- **Browser MCP env null no longer crashes startup**: a stored MCP `env` of JSON `null` unmarshaled into a nil map, and `syncBrowserMCPProxy` then assigned `NODE_EXTRA_CA_CERTS` when traffic capture was on, panicking the process on every start. `decodeStrMap` now always returns a writable map.
- **Provider refusals reported as refusals**: a turn the provider's safety system declined (Anthropic `stop_reason: "refusal"`, OpenAI-compatible `finish_reason: "content_filter"`) has no text and no tool calls, so it ended as `completed` with "the model ended this turn normally", and the idle-turn rerun resent the same conversation up to the empty-response retry count, where it is expected to be refused again. The LLM recorder now hands each call's stop reason to the run (`llmrec.WithStopSink`, `agent.WithStopTracker`). After a refusal the idle-turn rerun is skipped, and the run summary says the provider refused the turn and the intent was not completed.
- **LLM health badge on every task path**: `/system/llm/` read a breaker state that only the failover Pool wrote, so a profile used by an explicit task chain, by a bound agent with failover off, or as the global provider stayed "Healthy" through a real outage. Every task LLM attempt now records its outcome through the same policy the Pool uses, keyed by the profile that served it. The LLM recording page also explains an empty list when the `llm_record` toggle is off instead of looking broken.
- **LLM health persistence** (#304): persisted breaker rows are applied in sequence at startup and written before the database closes, and a slow write no longer holds the registry lock while it runs.
- **Skill visibility survives restarts**: turning a skill off now writes an explicit disabled row instead of deleting it, so the startup seed, which only inserts missing rows, can no longer bring the skill back. Skills that were turned off before this version have no row to keep, so they come back once after the upgrade and must be turned off again.
- **Browser extension traffic capture**: CDP delivers `Network.responseReceived` response headers as an object, not an array of `{name, value}` records, so the extension threw on every response and never queued an exchange. It now accepts both shapes and lower-cases names before the body-capture gate, so captures work again and `content-type` correctly controls body capture.
- **bbot on arm64**: the image now builds on arm64 hosts such as Apple Silicon. bbot's `gowitness` downloaded an x86-64 Chrome and `retirejs` an x86-64 Node, which can't run there, so the build failed. On arm64 the image uses Debian's `chromium` for gowitness and an arm64 Node for retirejs, and the build check now covers `retirejs` too. amd64 builds are unchanged.
- **Auto-scope hygiene**: auto `task_scope` rows count for coverage and untested assets only under a declared root, and direct coverage counts anchored assets through fact anchors only; the scope is described as "coverage scope, not enforced" (#196).
- **Enrich HTTP probe**: it now dials through `intercept.PinnedDialer`, so the target gate applies and a probe without a target scope is refused (#198).
- **Agent hook data races**: the eight package-level hooks are synchronised, so a second wire-up no longer races tasks that already read them (#227).
- **Coverage flag read failure** (#303): asset-coverage tools stay available when the coverage flag cannot be read, and a failed read no longer disables coverage for the task.
- **RSI lesson correctness** (#287, #290): lessons are scoped from `task_scope`, UTF-8 is no longer split mid-character, caution lessons are looked up by cue, lesson evidence and every retest are retracted when a finding's disposition reverses, and extraction is skipped on a task with more than one company.
- **Finding disposition mirror** (#289): finding triage is mirrored onto its exploration node, so the graph and the findings table agree.
- **RSI lessons in the data envelope** (#288): lesson text reaches the planner and worker inside the same nonce-framed envelope as other target-derived content.
- **Intent summaries framed** (#311): the intent summary on the worker-finished and finding lines, and the summaries in `graph_overview`, now reach the planner inside the nonce frame; the structured intent fields stay in the plain JSON, and the operator-typed deletion reason stays outside.
- **LLM pool context window** (#286): the pool and side-question paths use the model's real context window instead of a default when computing compression thresholds.
- **Sensitive rewrite values** (#273 follow-ups): a kept sensitive value is matched on action type, header name and regex, and a host change is refused while a stored sensitive value is kept.
- **Triage bot context** (#274): the PR triage bot receives a directory map instead of a truncated file list.

### Security

- **Secrets at rest**: the credential-bearing columns and settings (LLM API keys and proxy, task credentials, MCP server env, notification channel config, search and proxy settings), the exec spec of custom tools and the evidence snapshot heads are encrypted in PostgreSQL with AES-256-GCM (`enc:v1:`) using `ARTEX_SECRET_KEY`, else `keys/secret.key`; existing plaintext rows are backfilled once at startup, and a missing or wrong key while encrypted data exists refuses to start. This protects database dumps and backups, not a running instance (#213, #216, #217, #218).
- **URL credentials are dropped before storage**: scan and bbot ingestion, the asset store and archive restore strip URL userinfo, so `https://user:pass@host/app` is stored and matched as `https://host/app` (#222, #223, #224).
- **Agentic injection and proof hardening** (#437): the four surfaces that still carried target or agent text outside the per-message data envelope now go through it: the worker intent assets move out of the system prompt into the framed user message, and the planner stagnation warning, agent-written task credentials and planner todos are framed. Scanner output is opened with `os.Root` and every symlink and hard-linked file is refused. `prove_goal` closes a goal with a finding only when a bound `traffic_ref` still exists in the live capture and its host matches the finding's linked asset, and refuses fail-closed when that check is unavailable, so a planted or unbound finding stays recorded but cannot close a goal. An agent scope addition outside the declared scope, or one whose classification read fails, is recorded as `expanded` with its source and reason. A deterministic adversarial bench runs in CI against a hostile local target.
- **Interception, session, log and endpoint hardening** (#436): when the interception rules cannot be read, tool calls are blocked instead of allowed, and a rule whose pattern does not compile blocks the calls it would target. A cookie-authenticated POST, PUT, PATCH or DELETE must carry a same-origin `Origin` or `Sec-Fetch-Site`, otherwise it answers 403; bearer tokens, GET and HEAD are unaffected. The one-time setup token is no longer written to the log the API exposes, and proxy credentials are masked at write time, on stderr and on read-back. The workspace refuses the capture CA, index and blob store for read and write, and refuses a delete that would remove them. `POST /api/llm/models` refuses carrier-grade NAT, benchmark, IETF protocol and reserved ranges for literal hosts, resolved names, redirects and at dial time, judges NAT64 and 6to4 addresses by the IPv4 they embed, and no longer echoes an upstream error body.

### Thanks

Thanks to the contributors whose work is in this release:

- Security and core reliability: @Coff0xc, @Protonmatter, @liuxiaobo0920, @cyberd4ch, @Dev-next-gen, @Michael-JRead, @anqorithm, @renaesop, @tglemser, @adam-33-pixel
- Features, UI and locales: @Toys0125, @cocodedk, @BlackGownQ, @Amineharrabi, @chetanvhsk-wq, @YunzhouLi-hub, @mervedalgin
- Build, packaging and tests: @ldevbr, @Lusitaniae, @mp-web3, @Alexandre200-lab, @maheshBawa
- Documentation: @err0rgod, @yeting1107, @henefesto, @mathkartel

## [0.6.0] - 2026-11-12

Machine-checked finding verification (S1), intercept decisions traced to their actor, configurable notification limits, prompt hardening and goal guards from the #124 agentic audit, the target gate (S3b phase 1 and step 2.1, off by default and API-only), intent claim leases, and checksum-verified tool downloads in the Docker image.

### Verified findings (S1)

- **POE level and verification status**: findings carry `poe_level` (0-4), `verification_status` and `verification_note`; a finding is `verified` only with a bound proof or verification response, a declared POE level of 3 or more, and every evidence quote of 8 runes or more found verbatim in a bound body. Existing rows stay `unverified` (#162).
- **Verification in the findings UI**: a badge (`Verified L3`/`L4`, `Unverified`, `Blocked`, `Not assessed`, `False positive`) beside the triage status, a filter, and the note on the detail page; the list, groups, asset tree and export accept `verification_status` (#163).
- **Retest linkage**: a completed retest with verdict `reproduced` or `fixed` upgrades an `unverified`, `not_assessed` or `blocked` finding to `verified`, with a note naming the retest; other verdicts never change the state (#164).
- **Evidence gzip decoding**: gzip and deflate bodies are decoded (one layer, 4 MiB cap, fail-closed) before the quote check, so compressed HTML can verify; brotli and zstd stay `not_assessed` (#169).
- **Counterevidence and confidence rationale**: findings take two optional free-text fields, `counterevidence` (what was tried and did not work) and `confidence_rationale` (why the conclusion holds), through `report_finding`, the findings API and the finding detail page; a missing field never refuses a finding. An idempotent upgrade adds both properties to the stored `report_finding` schema on existing databases and keeps user edits (#193).

### Intercept decision tracing

- **`decided_by` on approvals**: each settled approval records its actor (`human`, `rule`, `model`, `system`), shown in a "Decided by" column with a filter; legacy rows show "Legacy" and are not rewritten (#165).
- **Judge decisions no longer stored as `unknown`**: the `[model]`/`[Model]` prefix case mismatch is fixed, and an idempotent backfill relabels the affected rows `decision_source=model` (#159, fixes #156).

### Notifications (closes #168)

- **"and N more" counts the hidden items**: the notification asset list reported the total instead of the assets left out (#170); the malformed-IP asset warning had the same bug (#171).
- **Configurable limits**: `notify_summary_max_runes` (default 120, 0-4000) and `notify_assets_max_shown` (default 3, 0-50) in `/api/settings`, `0` meaning no truncation; the Feishu card guard drops from 24000 to 16000 bytes to stay under the 20 KB request limit (#172).
- **Limits on the settings page**: both fields under System > Notifications > Global settings, validated before anything is saved (#173).
- **Feishu digest overflow**: digests are packed against the serialized request body, so a digest of many short items is split instead of exceeding 20 KB and being rejected (#174).

### Agentic prompt hardening (#124 phase B)

- **Untrusted-content tails owned by code**: the planner and the compactor get an untrusted-data rule appended after their prompt body, and the #49 block moves out of the editable bodies into a tail appended for every chat agent (worker, main agent, auto, pentest, reporter), so a prompt override cannot remove it (#189).
- **Planner goal anchor**: the planner user message ends with a block that restates the task goal and constraints and asks each new intent to name the goal it serves (#189).
- **bbot skill rules**: every bbot event field is untrusted, only `scope_distance == 0` reaches `insert_assets`, and other events stay intel facts that are never auto-scoped or probed (#189).

### Agentic guards (#124 phase B)

- **`goal_met` refuses while a goal is open**: it names the open count and points to `prove_goal`; a task with no goal node keeps the old behaviour (#190).
- **`prove_goal` requires an observed fact**: a fact is accepted only with `confidence` `observed`; findings are accepted as before (#190).
- **Hint origin**: `add_hint` stores who wrote the hint (`human`, `orchestrator` or the agent name) and the planner trigger names it, instead of always "The human (main agent)" (#190).
- **Built-in rules for the planner and the main agent**: the `[built-in]` deny rules now apply to their Bash and other intercept-enabled tools; user rules and the judge still do not (#190).
- **Deny reasons to the model are capped**: the reason in a block message (deny rule, judge or target gate) is cut to 4000 runes, with a truncation marker, before it reaches the model; the reason stored in the interception log is unchanged (#192).

### Target gate (S3b phase 1 and 2.1): OFF by default, API-only

- **Opt-in only**: `target_gate` on tasks and conversations defaults to `false` and is set through the API (`POST`/`PATCH`); there is no UI. With it off, nothing below runs. Decision D2 (gate on by default) is NOT in 0.6.0 (#178).
- **Hooks and scope**: the planner and the main agent run with tool hooks, and every session carries a target-gate scope (#177).
- **Schema, flag and approval requests**: `target_pins`, one open request per scope and `host:port`, and a human approval that pins the displayed addresses; pin list and revoke routes (#178).
- **Extraction, resolver, exemptions, decision in the hook**: declared targets are extracted, block rules and exemptions applied, names resolved, and uncovered targets wait for a human approval (#179).
- **Rendered custom-tool targets**: the URL or command that a custom `http` or `command` tool renders goes through the gate (#180).
- **Inheritance**: a task spawned by a gated caller and a conversation triggered by a gated task start gated; pins are never copied (#182).
- **Declared form first**: block and URL rules match the declared targets before any DNS lookup (#183).
- **Redirect hops**: every redirect hop of WebFetch and of the custom `http` tool is checked; an uncovered hop fails with `TARGET_APPROVAL_PENDING` (#185).
- **Pinned dialer**: in a gated scope, WebFetch and a direct custom `http` call connect only to pinned or exempt addresses, on every hop, with no direct retry (#186).

### Other changes

- **Custom User-Agent for LLM requests**: an optional per-profile `User-Agent` (trimmed, no control characters, 256 bytes max); empty keeps the default. Part of #154, without the fixed-full-URL mode (#155).
- **Untrusted-output boundary toggle**: `ARTEX_UNTRUSTED_BOUNDARY=1` enables Norma's framing of tool results for worker, planner, chat and main agent; off by default (#166).
- **Intent claim lease and fencing (S3c)**: a claim has a 15 s heartbeat, a 90 s TTL and an owner token, so a stale worker can no longer overwrite a result; in-flight intents reopen when their claim expires, not at startup (#176).

### Fixed

- **Custom-tool proxy scheme**: `use_recording_proxy` produced `http://http://...`; a value with a scheme is now used as is and a bare `host:port` gets `http://` (#187).
- **`list_task_credentials` schema**: it emitted `"required": [""]`, which strict providers reject, failing every worker; fixed, with a one-time heal of existing databases at startup. Reported and first fixed by @kiserufetch (#130).
- **MCP protocol version**: the Streamable HTTP client negotiates the version (offers 2025-11-25, then 2025-06-18) and sends the negotiated one after `initialize` (#132, fixes #131).

### Build, Docker and tests

- **Docker tool verification**: the recon tools are checked against their release checksums, sqlmap is pinned to tag 1.9.9 at a fixed commit, Node 22.23.4 comes from nodejs.org verified against `SHASUMS256.txt`, and the Playwright packages are pinned. Carries over the Dockerfile part of #127 (#188).
- **Secrets out of the build context**: `.dockerignore` excludes `.env`, `config.json`, `jwt.key` and `backups` (#153).
- **Server tests skip without a DSN**: the Postgres-backed `./server` tests skip when no database is configured instead of failing (#175).
- **Norma v0.4.4 to v0.4.8**: v0.4.5 (#160), v0.4.6 (#161), v0.4.7 (#184), v0.4.8 (#186).

### Docs

- **LLM base URL note in the README**: the Anthropic base has no `/v1` suffix; OpenAI-format bases end in `/v1` (`/chat/completions` or `/responses` is appended). Follow-up to #154 (#157, #158).

### Known limits

- **Target gate**: OFF by default and API-only; turning it on by default (D2) is not part of this release.
- **Declared-input detection, not enforcement, for subprocesses**: the gate reads the targets a call declares; a subprocess that builds its target at run time, or a custom script tool's stored code, is not seen. Only WebFetch and direct custom `http` calls are bound at connect time; calls through a proxy are not (recording-proxy binding is step 2.2).
- **URL rules match the URL as written**, with no normalisation; use a domain, IP or CIDR rule to keep an agent away from a host (#183).
- **Fact provenance**: `prove_goal` trusts the `confidence` the model declared in `record_fact`; F4 fact provenance and the source check come in 0.7.0. There is no pending-proof UI.
- **Prompt rules are advisory to the model**: the tails, the goal anchor and the skill rules are prompt text, and their effect on model behaviour was not measured. The enforced parts are the `goal_met`/`prove_goal` handlers, the built-in deny rules and the target gate.
- **Stored tool descriptions**: the new `add_hint` and `prove_goal` descriptions reach fresh databases only (#190).
- **Intent claim leases need one version per database**: an older binary does not heartbeat, so a 0.6.0 instance takes over its live claims (#176).
- **Verification**: no path produces `blocked` or `false_positive` yet, and non-HTTP findings stay `unverified` until S1b.
- **Finding reasoning fields are not enforced**: the prompts and the `report_finding` descriptions ask for `counterevidence` and `confidence_rationale` when confidence is not high, but findings have no confidence field, so nothing requires them; a confidence field and its enforcement are 0.7.0 items. The prompt sentence reaches fresh databases only; the schema descriptions reach existing ones through the upgrade (#193).

## [0.5.1] - 2026-11-05

Login rate limiting per client IP with trusted-proxy support, a 12-character minimum for new passwords, a loopback-only default for the binary, and the JWT signing key in its own Docker volume.

### Changed

- **The binary listens on `127.0.0.1:8787` by default**: the `-addr` default was `:8787`, every interface. Running `artex` or `./start.sh` without `-addr` now accepts connections from the local machine only; pass `-addr :8787` to listen on every interface. Docker is unchanged: the image starts the server with `-addr :8787` inside the container, and `docker-compose.yml` already publishes it on `127.0.0.1` by default (`ARTEX_BIND_ADDR`).
- **New passwords need at least 12 characters** (was 8), at first-run setup (`POST /api/auth/init` and the `/setup` page) and in `POST /api/auth/change-password`. Login does not check length, so a password set under the old minimum keeps working until it is changed. `reset-password.sh` enforces the same minimum.

### Fixed

- **The JWT signing key survives container rebuilds**: the server wrote `jwt.key` to the executable's directory, `/app` in the image, so the key lived in the container's writable layer and recreating the container (for example `docker compose up -d --build`) generated a new key and signed every user out. The key directory is now set by `ARTEX_JWT_KEY_DIR` (default: the executable's directory, unchanged for non-Docker installs). `docker-compose.yml` sets it to `/app/keys` and bind-mounts `./keys` there, outside `./data`, which the file manager browses. On start, when `<key dir>/jwt.key` is missing, a key at `data/jwt.key`, then at the executable's directory, is copied there with mode 0600 and the old file is removed; otherwise a new key is generated. An existing key is never overwritten. Upgrading a Docker install signs every user out once, because the old key is in the container being replaced; to keep sessions, copy it out before recreating the container:

  ```bash
  mkdir -p keys
  docker cp artex-artex-1:/app/jwt.key ./keys/jwt.key
  ```

### Security

- **Login rate limit**: `POST /api/auth/login` allows 10 attempts per minute per client IP. The next attempt gets 429 with a `Retry-After` header (seconds) and a JSON error, and the IP is blocked for 1 minute. Each attempt while blocked, and each later block, doubles the wait, up to 15 minutes. A successful login clears the IP's count. There is no per-account lockout, so failing logins cannot lock the admin out from other addresses. The state is in memory: a restart clears it, an IP idle for 15 minutes is dropped, and at most 10,000 IPs are tracked (the least recently seen is dropped first). The IP is the TCP peer address, and `X-Forwarded-For` is ignored, unless the peer is listed in the new `ARTEX_TRUSTED_PROXIES` (comma-separated CIDRs, empty by default, passed through by `docker-compose.yml`). For a listed peer the header is read from the right and the first address that is not a trusted proxy is the client; entries the client added further left are never used. Behind a reverse proxy, set it: otherwise every client has the proxy's address and shares one budget, and an attacker failing logins through the proxy blocks the real users, admin included, for up to 15 minutes. The README nginx example now sends `X-Forwarded-For`.
- **`GET /api/health` hides the version from anonymous callers**: without a valid token it answers `{"ok":true}` only. With a token (the web UI sends one for the version in its top bar) the answer is unchanged: `ok`, `service` and `version`.

## [0.5.0] - 2026-11-04

Ollama support, a setup token for the first-run claim, secret scrubbing for child processes, a Docker image that builds from a fresh clone, Go 1.26.10 and Node 22, and race and shellcheck runs in CI. Entries marked "direct commit" landed on `main` without a pull request.

### Added

- **Ollama support**: an `ollama` LLM profile format for a local or LAN Ollama server. Keyless by design: no API key is needed, `OPENAI_API_KEY` is never inherited, the base URL defaults to `http://127.0.0.1:11434/v1` and is normalized to the `/v1` root, and the profile works in the failover pool, task LLM chains, model listing and connection tests. Contributed by @glauberportella (#128).
- **Setup token for first-run setup**: while no admin password is set, the server generates a random 128-bit one-time token at startup and prints it to its log (`docker compose logs artex | grep "Setup token"`). The `/setup` page has a field for it, `POST /api/auth/init` requires it (`setup_token`, compared in constant time, 403 when missing or wrong), and it is cleared once the password is stored (#137).
- **`ARTEX_BIND_ADDR`**: the address `docker-compose.yml` publishes the web UI on, default `127.0.0.1` (#137).

### Security

- **First-run claim**: before, anyone who reached port 8787 on a fresh install before the operator could set the admin password. Init now needs the setup token above, and Docker installs publish 8787 on `127.0.0.1` by default; set `ARTEX_BIND_ADDR=0.0.0.0` in `.env`, or use a reverse proxy or SSH tunnel, for remote access (#137).
- **Startup secrets removed from the environment**: `ARTEX_PG_DSN`, `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are unset inside `server.New` after they are read and before the MCP discovery goroutine and the task resume loop start, so agent shells, MCP stdio servers and custom tools spawned afterwards no longer inherit them (#136). The binary passes the option that enables this, but `New` did not apply its options, so the scrub from #136 never ran until #146 fixed it (#146). See Known issues for what this does not cover.
- **Saved API keys go only to their own endpoint**: `POST /api/llm/test` and `POST /api/llm/models` used a saved key (the profile's, or the global one) for any `base_url` in the request body, so a crafted request could send it to another host. A saved key is now sent only when the request's provider and normalized base URL match the ones it was saved for; otherwise the request must carry `api_key` (#142).
- **`ARTEX_LLM_PROVIDER` is matched case-insensitively**: `Ollama` or a value with surrounding spaces fell through to the Anthropic default and sent `ANTHROPIC_API_KEY` to the configured base URL (#140).

### Fixed

- **Ollama base URL on the environment path**: `ARTEX_LLM_BASE_URL=http://host:11434` is normalized to the `/v1` root the same way the saved-profile path already was, so a LAN Ollama server configured through the environment no longer answers 404 on chat (direct commit 1c35c9c).
- **Malformed `config.json` is an error**: `config.Load` used to ignore a parse error and treat the file as missing, which surfaced as a misleading "no database config found" or a silently ignored `skill_dir`. A read or parse error is now returned with the file path and startup exits (#141).
- **`install.sh` escapes what it writes**: the local install writes `config.json` string values through a JSON escaper and requires a numeric port; the Docker install escapes `\`, `|` and `&` in the Postgres password and API key before the `.env` substitution (#141).
- **`scripts/backup.sh --keep 0` is rejected**: it used to delete every dump, including the one just written, and still report success. Values with a leading zero are rejected too (#139).
- **`backups/` is ignored again**: a missing newline had merged it into the previous `.gitignore` line, so database dumps showed up as untracked files (#138).

### Build and CI

- **The image is built from the checkout instead of pulled**: `docker-compose.yml` no longer references the `autumn27/artex` namespace, whose repository is gone and whose name its holder could republish at any time. `install.sh` and `update.sh` build the image locally (direct commit 1ed154e).
- **A fresh clone builds the image**: the Dockerfile copied a prebuilt `dist/<arch>/artex` that a clean checkout does not have. It is now a multi-stage build: a Node 22 stage runs the frontend static export, a Go 1.26 stage runs `build.sh` with the release binaries job's flags (CGO-free cross-compile, `-trimpath`, version stamp), and the runtime stage copies the result (#147).
- **`update.sh` refuses to rebuild stale code**: when `git pull --ff-only` fails on a diverged clone (including every clone made before the 2026-10-23 history rewrite), it now stops with recovery commands instead of warning, rebuilding the old tree and printing "Build complete" (direct commit 1ed154e).
- **CI runs the race detector and shellcheck**: `go test -race -p 1` over every package with tests except `./server`, and `shellcheck -S warning` on `install.sh`, `update.sh`, `start.sh` and `scripts/backup.sh` (#144). The race run uses its own database (direct commit 0477751).

### Upgrades

- **Go 1.26.10** in `go.mod` (was 1.26.3), and **`golang.org/x/net` v0.62.0** (was v0.58.0), which raised x/crypto to 0.58.0, x/text to 0.43.0, x/sys to 0.49.0, x/sync to 0.24.0, x/mod to 0.41.0 and x/tools to 0.51.0 (#145).
- **Node 22 in the runtime image**: NodeSource `setup_22.x` instead of the end-of-life `setup_20.x`, matching CI and the release workflow (#143).

### Known issues

- **The secret scrub has limits**: `os.Unsetenv` changes only the Go runtime's copy, so a process running as the same user can still read `/proc/<pid>/environ` of the server (and, in Docker, of PID 1, `start.sh`). Other variables that may carry credentials, such as `ARTEX_LLM_PROXY`, are not scrubbed.
- **The LLM test and model-list endpoints still take `proxy` from the request**, so a saved key can travel through a request-supplied proxy when the base URL is plain HTTP.
- **Postgres passwords with URL-special characters** (`@`, `/`, `#`, `?`) break the `ARTEX_PG_DSN` that `docker-compose.yml` builds by interpolation, and Compose interpolates `$` in `.env`.
- **The build context includes local secrets**: `.dockerignore` does not exclude `.env`, `config.json` or `jwt.key`, so the build stage's `COPY . .` puts them in a build-stage layer of the local builder cache. They are not copied into the final image.
- **Image supply chain**: the recon tools are downloaded at pinned versions but not checksum-verified, sqlmap tracks its default branch, and the Playwright packages are installed at `@latest`. Draft #127 proposes checksum verification.
- **No Docker image is published for this release**: the release workflow's `docker` job only runs when `DOCKERHUB_ENABLED` is set, and it still downloads prebuilt binaries into `dist/` that the Dockerfile no longer uses. Build the image from the checkout with `docker compose up -d --build`.
- **CI gaps**: there is no `docker build` job. Four tests skip themselves (fresh-database or timing failures, see #9).
- **Reported and not fixed in this release**: `list_task_credentials` emits an invalid `"required": [""]` schema that strict LLM providers reject (#130), and the MCP Streamable HTTP client fails against servers that only support protocol version 2025-11-25 (#131; fix proposed in #132).

## [0.4.0] - 2026-10-23

First release of this fork. The engine underneath is still upstream's, but this tree carries a long stretch of operational work on top of it: a recon toolbox and skills, findings discipline, cost accounting, and container packaging.

### Added

- **Recon toolbox in the image**: nuclei, httpx, subfinder, katana, ffuf and dalfox installed at release-pinned versions, plus a sqlmap checkout that tracks the default branch, each smoke-tested at build time (run once, not checksum-verified), so hunt workers can call them directly (#112). Checksum verification arrives with #127.
- **Recursive recon skill** (`bbot-recon`): bbot v3.0.2 in its own virtualenv with module dependencies preinstalled. Policy-gated modes (passive seeds-only when scanners are banned, active-safe, loud only on explicit permission) and JSONL ingestion into the facts graph (#118).
- **php2shell skill**: turns a file-inclusion finding into verified RCE through the session.upload_progress chain, lab first and gated on program policy (#113).
- **Code audit and reverse-engineering skills** (#55, #77).
- **Goal ambiguity gate**: task creation rejects goals that name no target and goals under 80 characters; `[targetless]` opts out for tasks that legitimately have none (#111).
- **LLM chain hardening**: consecutive-failure escalation across the ordered profile chain, plus per-intent profile rotation with a strict round-robin (`llm_rotate`) (#111, #114).
- **Stagnation warning**: the graph overview tells a worker when it has repeated the same direction without producing findings (#111).
- **Per-task credentials vault**: accounts stored per task, agent-generated passwords allowed, injected into the worker context and managed from the task page.
- **Cost ledger**: token spend metered per call, with usage surfaced in the UI and judge/fallback calls counted separately (#71, #74).
- **Backup script and MCP health reporting** (#43, #44).
- **Ask-operator tool with environment handoff** (#45, #57).
- **DrostBench corpus and benchmark harness** (#59, #95, #96, #97, #98).
- **One database per test package**, removing cross-package test races (#82).

### Changed

- **Norma upgraded to v0.4.4**: per-task process-tree memory watchdog, UTF-8 aligned output truncation, non-interactive subprocess environments, message_delta usage recovery, and streaming fixes (#121).
- **Planner quiet mode** for less narration during long runs (#81, #88).
- **Findings discipline**: proof-basis gates, measured impact, adversarial verification and dedup rules decide what a finding must contain before it is reported (#51, #53, #63, #69).
- **Prompt-injection hardening** on seed material and MCP tool descriptions (#49).
- **Pause preserves the task timeout budget**, and paused time is frozen in the task clock (#2, #110).
- **Deadline contract** in the executor seeds (#65).
- **Task detail metrics and outcome cards** summarise a finished run (#92, #102).
- **Skill-gap and loop-contract reporting** for the planner (#104, #106); the RSI notes land as documentation in #108.

### Removed

- **In-app self-update and the automatic version check**: the update source was hard-coded to a repository that no longer exists, and its checksums came from the same release. The `selfupdate` package, the `/api/update/*` endpoints, the top-bar update badge and the "Version & Updates" settings card are gone; `start.sh` / `start.bat` now only restart the process after a crash. Upgrade with `update.sh` or a release archive. (#125, contributed by @stevenAthompson)

## [0.3.15] - 2026-10-07

### Interception

#### Added

- **Added a built-in interception rule for delete-style endpoint paths**: the previous built-in HTTP destructive rules only matched the DELETE **method**, while most applications trigger deletion via GET/POST, so calls like `curl 'http://t/api/user/delete?id=1'` would really delete target data. A new `deny` rule now covers `/delete /del /remove /unlink /erase /destroy` (the verb must be followed by a separator, so `/delivery`, `/details`, `/delta` are not falsely blocked). Existing instances get it after upgrading too; it can be disabled or deleted under "System → Command Interception".
- **Token usage of model fallback approvals can now be viewed separately**: approval calls previously had no independent metering, so usage could only be guessed. It is now metered on its own — under the "Model fallback approval" toggle in "System → Command Interception" there is a new usage card with cumulative stats for five items — calls, input, output, and cache read/write — plus a mini bar chart of daily consumption over the last 30 days.

### Vulnerability push

#### Added

- **Vulnerability findings can be pushed to IM**: a new "System → Notification Push" page lets you push scan findings to six channels: **DingTalk, Feishu, WeCom, generic Webhook, Telegram, and email**. Any number of instances per type, each with its own enable/disable, rate limiting, and filter rules.
- **Delivery timing has realtime and digest modes**: realtime mode sends each hit as it happens; digest mode merges them into one message on a global cycle (default 30 minutes), with the new count and severity distribution at the top. For "High-severity realtime, everything else digested", create two channels and configure them separately.
- **Filter rules support four dimensions**: minimum severity, restricting task / asset scope, vulnerability type keyword inclusion and exclusion (exclusion wins), and whether to receive handling-status changes (default off). Messages carry a "View details" button whose target URL comes from the global "back-link address" setting; leave it empty to omit the button.
- **Delivery history and manual resend**: lists each delivery's status, attempt count, failure reason, and channel, filterable by channel and status; failed items can be resent with one click (resending resets the retry count).
- **Channel credentials are masked on display**: Webhook URLs, signing secrets, Bot Tokens, SMTP passwords, etc. are only shown as masked values with a trailing hint; submitting the masked value unchanged means "do not modify", while clearing the input deletes the field.

#### Fixed

> This section is the outcome of a security audit round after the feature's initial release: every item was reproduced first, then fixed, then given a regression test.

- **Fixed a mask bypass via "change the target URL, keep the credentials" (Critical)**: config merging preserved the stored value for any "unmentioned key", so changing only the address while saying nothing about credentials would make the server send the real stored credentials to an arbitrary address, completely silently. Now, once the target address changes, every credential field must be stated explicitly — provide a new value, or explicitly leave it empty to indicate it is no longer needed.
- **Fixed markdown-based channels performing zero escaping of untrusted content**: vulnerability titles and summaries come from model output, and asset URLs come from scan results, so crafted titles would render as clickable external links in DingTalk / WeCom / Feishu, and image syntax would be fetched by clients at render time, leaking the reader's IP. Now everything is single-lined + markdown metacharacters are escaped, and escaping happens at each channel's render exit point rather than in the shared title function.
- **Fixed the SSRF surface of delivery addresses**: previously loopback, internal, and cloud metadata addresses were all deliverable, and the first 200 bytes of a failed response body went into `last_error` and were echoed in the delivery history, forming a semi-blind read primitive. Defenses now apply **at the dial stage**, covering DNS rebinding and rejecting cross-host redirects; loopback and link-local addresses require explicitly setting `ARTEX_NOTIFY_ALLOW_LOCAL=1`, while RFC1918 private networks are still allowed (self-hosted internal SMTP relays are common).
- **Fixed push credentials leaking through error messages**: DingTalk's `access_token`, WeCom's `key`, and Telegram's bot token all live in the URL, and on delivery failure the full URL flowed into four places: `last_error`, delivery history, server logs, and frontend messages. Now uniformly redacted, keeping only `scheme://host` and the underlying reason.
- **Fixed silent loss when a truncated digest message marked the whole batch as sent**: truncated-off vulnerabilities were neither in the message nor in the failure list, yet the delivery history showed success. Packing is now done **per whole item** — only those packed into this message are marked; the rest go back to the queue to continue in the next message without consuming retry attempts, and the message header states how many more will follow.
- **Fixed a typo in the minimum severity threshold silently disabling the filter**: when `min_severity` was mistyped as something like `hgih`, the unknown severity's ordinal was 0, the check degenerated to always-true, and users who thought they would only receive High-severity findings actually got every vulnerability poured into the group. The write path now validates the value and lists the allowed options.
- **Fixed `rate_per_min = 0` (no rate limit) being unreachable**: the storage layer silently rewrote an explicit 0 to the default, so operators who thought they had lifted rate limiting were still throttled. The default is now filled in at the API layer when the field is absent.
- **Fixed digest channels completely bypassing the token bucket**: `rate_per_min` previously had no effect at all in digest mode. The number of claimed items is now constrained by both this round's budget and an in-memory upper bound.
- **Fixed failure handling judging by the batch's maximum attempt count, dragging new deliveries down with old ones**: an old delivery retried twice would pull brand-new deliveries in the same batch into failed, permanently losing new vulnerabilities before they used a single retry. Now decided per item.
- **Fixed deliveries with unparseable snapshots in a digest batch being silently marked successful**: these items were skipped at the render stage but counted as successful along with the batch. They are now explicitly marked failed with a reason.
- **Fixed a single channel's per-round delivery count potentially exceeding the lease duration**: in multi-instance deployments, rows whose leases expired would be re-claimed, sent twice, and have their attempt counts incremented twice. The per-round cap is now derived from "lease / per-send timeout", and assertions pin down the relationship between these constants.
- **Fixed Telegram truncation potentially cutting through HTML entities**: truncation avoided half-tags but not entity fragments like `&amp`, which could make the parser reject the **entire** message. Both are now avoided.
- **Fixed the email channel treating transient SMTP failures as permanent**: greylisting `450`-style 4xx replies are temporary rejections that should be retried later, but they were all judged dead before — servers with greylisting enabled would fail every push after its first attempt. Now distinguished by the first digit of the reply code: 4xx is retryable, 5xx is permanent.
- **Fixed masked literals actually being written to the database when submitting nested structures**: object fields like `webhook.headers` can only be masked or submitted as a whole; stuffing the mask sentinel inside an object would be stored as a real value, silently breaking authentication. Such submissions are now explicitly rejected.

#### Design notes

- **The vulnerability-writing transaction does a single blind INSERT**: `notification_events` and the vulnerability are written in the same transaction, so commit guarantees atomic consistency of both. This INSERT deliberately does not read the channel table or run the user's filter rules, and is wrapped in a `SAVEPOINT` — otherwise one misconfigured filter condition could abort the transaction and keep a High-severity vulnerability out of the database.
- **Delivery uses lease-based claiming instead of long transactions**: after claiming via `FOR UPDATE SKIP LOCKED`, the row is set to `sending` and `next_attempt_at` is pushed into the future as a lease, so no database lock is held during delivery; rows left behind by a crashed process are re-claimed after the lease expires — self-healing and never retried infinitely.
- **Rate limiting does not consume the retry budget**: the token bucket computes this round's allowance first, then that many items are claimed. The reverse order would charge an attempt to deliveries blocked by the limiter, and the three-attempt budget would be burned purely by waiting before landing in failed.

### Test infrastructure

#### Fixed

- **Fixed permanent asset residue caused by the cleanup order of the company ICP attribution test case**: `defer d.Close()` ran first at function return, with `t.Cleanup` after it, so all cleanup statements ran on an already-closed connection and their errors were discarded — test assets and companies remained in the database forever and made other cases asserting on asset counts fail mysteriously. Closing the connection now also goes through `t.Cleanup`, registered first, and cleanup failures are surfaced.

### Traffic

#### Added

- **The traffic list supports content search, path / status code / length filtering, and column sorting**: the filter row supports filtering by **response content** (via the full-text index), **path**, **status code** (exact value or buckets like `2xx`), and **response length range**; column headers sort by time, status code, and response length, with the sort preference stored locally. Two new indexes were added and take effect automatically after upgrade; the Agent tool's query contract is unchanged.
- **The traffic list gains "Clear all"**: deletes all traffic records at once (ignoring the current filter), cleans up historical host directories no longer recorded in the index, and then runs a full compaction, reporting how much space was actually freed. Traffic evidence already bound to vulnerabilities lives in a separate evidence store and is unaffected.

#### Fixed

- **Fixed disk space not being freed after deleting traffic**: the index database was created without `auto_vacuum`, so the file never shrinks; the full-text index is `contentless_delete`, so `DELETE` only writes tombstones without reclaiming the original postings — deleting traffic actually made the index bigger (measured: 6MB of captured bodies → 16MB index, still 16MB after deleting everything). Newly created index databases now enable `auto_vacuum=incremental`, and after each deletion a background chunked run performs full-text index merges and incremental reclaim, gradually returning space to the system (the same scenario drops to 104KB); reclaiming releases the write lock between chunks so it does not block traffic recording.

> Upgrade note: `auto_vacuum` can only be set at database creation, so **existing instances' index databases remain in the old mode**, and incremental reclaim on them is a no-op (a notice line is printed at startup). For such databases, tombstone growth stops after upgrading, and the already-occupied space can be reclaimed once with "Clear all" — that step converts the database to incremental reclaim mode, after which everyday deletions take effect on their own.

### LLM

#### Fixed

- **Fixed custom session headers not taking effect on "one-shot LLM call" paths**: goal decomposition (round 0) and cold-node compression are one-shot calls without a transcript store, so there is no session id on the context and the gateway cannot read the header — for endpoints like opencode zen that return 400 when the header is missing, this showed up as "round 0 fails, yet subsequent planner rounds are perfectly fine". Both paths now explicitly attach a session id that is stable per exploration, which also lets token usage be correctly attributed to the corresponding exploration (previously it was not recorded at all).

### Tools

#### Fixed

- **Fixed output truncation not working for MCP and custom tools, flooding the context with large results**: MCP tool returns previously bypassed truncation entirely, while HTTP-style custom tools, because they were given an empty tool context, always used the hardcoded 6000 characters instead of the session-configured limit. Both paths now go through `actool.Capture`: truncated to the session's `MaxOutputChars` (default 30000), and when `ToolOutputDir` is configured, the full output spills to disk and only a leading excerpt plus a file pointer stays in the message.
- **Upgraded norma to v0.4.3**: the harness layer uniformly executes `CaptureOnce`, so no tool (including future ones) will overflow the context by missing truncation again.

### Deployment

#### Fixed

- **Fixed the activity stream failing to connect under reverse proxy deployments**: the SSE address was previously unconditionally assembled as `${hostname}:8787`; in deployments reverse-proxied to 443, the page loads from `https://domain/` while SSE pointed at port 8787, which is not publicly exposed, so the activity stream kept reconnecting. Now distinguished by `NODE_ENV`: production defaults to same-origin, and only `next dev` keeps `:8787` to bypass Next.js's SSE buffering; the `NEXT_PUBLIC_SSE_BASE` override remains. The README gained a reverse proxy deployment section.

### Findings

#### Fixed

- **Fixed the "By asset" view's asset list having no scrollbar after overflowing**: the outer card had only `max-height` and no definite height, so the scrolling viewport's percentage height could not resolve — with many assets the list either broke out of the card or was truncated and unscrollable. The height cap now lands directly on the asset tree's native scroll container and adapts to the window height.

### Database

#### Fixed

- **Set an upper bound on the connection pool**: `database/sql` by default does not limit how many connections the application itself may open — when the pool has no idle connection it unconditionally creates new ones, and is only rejected after hitting PostgreSQL's `max_connections` (default 100). Now capped at 32; excess queries wait for an idle connection, so the same load shows up as slower rather than errors; if `max_connections` was lowered, lower this accordingly.
- **Improved connection reuse**: `MaxIdleConns` defaults to 2, so connections beyond 2 concurrent users are closed as soon as they finish, and the next request has to redo the TCP and PostgreSQL auth handshake. The idle cap is now raised to match the total cap, plus a 30-minute connection lifetime and 5-minute idle eviction, letting the pool naturally replace long-lived bad connections.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)

## [0.3.14] - 2026-09-24

### Task list

#### Added

- **The task list gains a "Vulnerabilities" column**: shows counts bucketed by severity (Critical / High / Medium / Low), non-zero buckets colored by severity, so each task's vulnerability scale and distribution is clear at a glance.

#### Changed

- **The "Description / Goal" columns are narrower**: overly long content is ellipsized, with the full text on hover, reducing long text hogging horizontal space.

### Exploration graph and planning situation overview

#### Changed

- **Slimmed down the planning situation overview (graph_overview) and set count caps on each list**: recent facts, finished intents, pending intents, cold-area digests, and confirmed vulnerability details are all now "latest window + count fallback", with anything not shown queryable on demand; this significantly reduces per-round LLM context size and avoids context bloat in long tasks (the cold area of linked-task overviews is rate-limited as well).

#### Fixed

- **After folding cold nodes, eliminated the reverse duplicate edges between digest and finding nodes in the exploration graph**.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)

## [0.3.13] - 2026-09-19

### Asset interception

#### Added

- **Added global asset interception rules (blacklist)**: supports entering exact-match and fuzzy-match domains / IPs / URLs and CIDR ranges, with full CRUD and enable/disable for rules; the management page is under "System → Asset Interception"; fuzzy interception of government (`.gov` / `.gov.cn`) and education (`.edu` / `.edu.cn`) sites is built in by default.
- **Asset interception is wired into the execution chain**: before dispatching an intent (`add_intent`) or inserting assets (`insert_assets`), the agent first runs an interception check on the target assets — intents that hit interception are not dispatched, assets that hit interception are not inserted, and the agent gets back the asset info and the interception reason.
- **Added task-level interception / allow (whitelist) rules**: independent of global rules and effective only for this task. Evaluation order is "intercept first, then allow" — a hit on interception forbids; if interception is not hit but the task has allow rules configured and none of them match, then "testing is not allowed"; when no allow rules are configured, the whitelist is not enabled. Rules can be entered when creating a task, and added/edited/removed and enabled/disabled in the task details "Overview".
- **Task templates support preset categories and task-level interception/allow rules**: a template can save a task category and a set of task-level rules, and applying the template brings them into the new-task form.

### Operation review

#### Fixed

- **Tightened the model judge's output protocol to reduce false allows caused by truncation**: lowered the verdict comment cap from 500 Chinese characters to 120 and enforced "output JSON only, no preamble or code blocks", avoiding cases where a verdict truncated by `MaxTokens` becomes unparseable and is then allowed per the model-failure policy (fail-open).

### Task archiving

#### Fixed

- **Archiving now skips symbolic links instead of failing the whole package**: the archive format end-to-end only supports regular files and directories, and previously any symbolic link in the working directory failed the entire task archive; now the link is skipped with a log entry and the remaining files archive normally (links are not followed, and nothing escapes the directory tree).

### Accounts and compliance

#### Added

- **Added a "Terms of use and disclaimer" dialog before login**: login requires checking the consent box.

### License and dependencies

#### Changed

- **The project is now under the AGPL-3.0 open source license**, and the README's license and disclaimer sections were improved.
- **Upgraded norma to v0.4.1**.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)

## [0.3.12] - 2026-09-17

### Exploration chain broadcast board

#### Added

- **The task details page gains an "Exploration chain broadcast board"** (#144): presents the task's exploration nodes (start/goal/intent/fact/vulnerability/hint/compaction) as a timeline stream, with type filtering, keyword search, ascending/descending order, pagination, and auto-refresh; while on "page one, newest first" it is a live position that refreshes every round, and leaving it only accumulates an unread count without disturbing your reading, with a one-click "N new broadcasts · back to latest" return. Grouped by day, so even when paging through long tasks you can tell "which day this was".
- **Each broadcast board row shows the node id** (#145), making it easier to cross-reference the exploration graph and locate specific nodes.
- **Broadcast board node details expand to show upstream/downstream and anchored assets** (#147): expanding a broadcast shows the node's upstream (where it came from) / downstream (what it produced) relationships; hovering a related entry pops up the corresponding node's card (type/status/source/time/summary/payload excerpt); and also lists the assets anchored to that node (type label + identifiable text). The related data is delivered along with the broadcast page, so expanding sends no extra requests.
- **Broadcast board search supports filtering by node id** (#150): in addition to "content / source", the search box now matches node ids — enter a plain number or the "#41" form shown in the UI to precisely locate the corresponding node.

### Intent management

#### Added

- **Intent deletion supports "soft delete / hard delete" modes** (#149): Open, Running, and Paused intents can all be deleted, and deletion requires a reason; the mode is chosen in the confirmation dialog.
  - **Soft delete (default)**: the intent is set to "Deleted" with the reason recorded in a dedicated field; the intent node and all its outputs and lineage are preserved.
  - **Hard delete**: physically removes the intent plus its exclusive descendant nodes "supported only by it" (cascading along output / intent chains to the leaves), avoiding orphaned data; the deleted intent's token metering is archived by its original date; shared nodes (still referenced by other intents), goals, and task root facts are all preserved, and the hard-delete dialog shows the expected number of cascade-affected nodes.

  Both modes notify the planner "this intent was deleted by the user + reason" and trigger re-planning accordingly.

### Operation review

#### Added

- **Approval records support filtering by status and decision source** (#139): filter approval records by approval status and decision source to quickly locate target records.

#### Fixed

- **Pending approval requests now load independently of history pagination** (#133): pending requests are no longer affected by history list pagination and remain fully visible while browsing history.

### Agent

#### Changed

- **The Worker role description was reworded to generic cybersecurity platform phrasing** (#138).

#### Fixed

- **Fixed cold-node compression never triggering**: the per-task planner is now wired to the Compactor; cold-node compression (cold-digest) previously never ran because it was never connected, and now works again.

### Chat

#### Added

- **Chat supports @-referencing multiple record types with scroll pagination** (#135): you can @-reference several types of records in chat, and the reference candidates load with scroll pagination.

#### Fixed

- **Long message bubbles are constrained within the conversation panel** (#137): overly long message bubbles no longer overflow the conversation area.
- **Fixed "missing uploaded file" when uploading a file before the new conversation was created**: the Composer's file selection now snapshots the `FileList` into an array before clearing the input, then calls back; previously, the draft state had to asynchronously create the conversation first, and when execution resumed, the `FileList` live-bound to the input had already been cleared, so the upload lacked the file field and the backend returned 400.

### Traffic

#### Fixed

- **The traffic recording proxy now listens on 127.0.0.1 by default** (#129, #130): prevents the open proxy from being exposed on other network interfaces under the default configuration.

### Web

#### Fixed

- **Fixed the static-export task list page losing the global header**.
- **Filled in the demo vulnerability details page's associated-traffic mock, fixing a white screen**.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)
- [@RuoJi6](https://github.com/RuoJi6)
- [@dingpotian](https://github.com/dingpotian)

## [0.3.11] - 2026-09-15

### Operation review

#### Added

- **Approval records support source locating** (#125): clicking an approval record's "Source" jumps back to the exact tool execution that triggered that approval — opens the original full conversation, auto-paginates to the target position, expands the command and result in place, and centers and highlights them in the scroll area while surrounding messages stay readable; automatic adjustment stops when the user scrolls manually. Across plain conversations, task Workers, planner, and main agent segmented conversations, locating is precise via the persisted `tool_use_id` and task mapping (a new scoped call-ID index); when missing, duplicated, or ambiguous, it explicitly says so instead of jumping to another execution. A clear notice is given when the conversation was deleted or the task archive/records are missing.
- **Approval records support pagination** (#115).

#### Changed

- **Slimmed down model review input** (#124, #125): the model review (the LLM judge after no rule matches) input converges to a versioned JSON of "the current full tool call + explicitly selected brief background + the local working directory". The background only takes real user messages (the current user message of the chat / task main agent); Workers no longer attach intent summaries, and backgrounds inherited from parent agents are cleared; the planner and auto-triggered sessions do not fabricate user messages. Task descriptions, goals, operation constraints, global exploration situation, historical calls, and full Worker intents are no longer attached — these are still used as before for agent execution and independent session audits, just not fed into operation review. All verdicts must output JSON `decision`/`comment`, and the comment must include "the actual operation, the consequences if it succeeds, and the matched rule"; instructions in parameters or background cannot change the review policy. A snapshot and fingerprint of the actual input sent to the model is saved; old-version snapshots are kept and labeled with their version, and old inputs are not reconstructed from current data.

#### Fixed

- **Model verdicts wrapped in code blocks are no longer silently allowed** (#126): if the verdict JSON returned by the model is wrapped in ``` code fences, the previous parse failure would be silently allowed via the model-failure policy; now the code fence is stripped before parsing, and only a still-failing parse falls back to the configured failure policy.

### Agent

#### Added

- **Added experimental noa context compression** (norma upgraded to v0.4.0): an experimental feature toggleable in system settings, off by default. When enabled, noa (model-driven context compression) takes over context compression for the four agent types — main agent, planner, Worker, and chat — replacing the built-in compression; compression originals are persisted to an archive, centrally under `<workDir>/noa/<session ID>/` (not scattered across task directories), one globally unique directory per session ID. If integration fails it automatically falls back to built-in compression without interrupting real tasks; the toggle is read once per run, so switching only affects runs started afterwards.

#### Fixed

- **Exploration graph tools now refuse instead of nil-crashing when there is no task context**: calling exploration-graph-related tools from a non-task context returns a clear error instead of crashing on a nil store dereference.

### MCP

#### Added

- **Support for legacy SSE MCP servers** (#117): compatible with MCP servers that only provide the legacy SSE transport.

### Traffic

#### Fixed

- **Traffic search host matching is now port-aware** (#114): `traffic_search` host matching now includes the port, preventing records of the same host on different ports from cross-talking.
- **A `traffic_search` description migration error no longer interrupts subsequent reporter migrations**: a single migration failure is isolated and does not affect later migrations.

### Web

#### Changed

- **Added dividers between task retest vulnerability options** (#122): separators between retest vulnerability choices for clearer visuals.

#### Fixed

- **Fixed the demo task details page crashing entirely**: in mock mode, the task details "Sessions" tab fetches `GET /api/tasks/<id>/side-questions` (side question history), but the mock handler has no such route, and the read fallback returned `[]` per "path ending in s means collection", leaving `data.items` as `undefined`; the side-question hook's `merge()` iterating over it threw `TypeError: t is not iterable`; the exception occurred in `setItems`' updater and was re-thrown by React deferred to the render phase, so the caller's `catch` could not catch it and the whole page was taken over by the error boundary showing "This page couldn't load". The mock handler now explicitly returns an empty side-question history, and `sideAPI.history` also normalizes the return value (any non-array `items` becomes `[]`) as defense in depth.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)
- [@RuoJi6](https://github.com/RuoJi6)

## [0.3.10] - 2026-09-13

### Network

#### Added

- **Web search gains an official DeepSeek source**: it directly reuses the currently active LLM configuration. It differs in nature from the other three sources — DeepSeek has no directly callable search API; search exists only inside its Anthropic-compatible API (the `web_search_20250305` server-side tool), executed by DeepSeek's servers. Therefore it **only supports the official DeepSeek endpoint + the anthropic protocol** (OpenAI-protocol endpoints outright reject server-side tools), and each search **consumes an extra model call**, the request **does not go through the search egress proxy**, and **is not counted in traffic records**; results contain **only titles and links** (no snippets — WebFetch fetches the body when needed). The settings page documents these limits but **does not validate or block**; whether they are met is up to the user to confirm, and the "Test search" button runs a real query to verify.

### Agent

#### Added

- **Workers gain cross-work lookback**: new `search_all_worker_traces` (no need to know the intent_id first — globally keyword-searches the execution processes of all works in this task for matching steps) and `get_worker_trace` (after locking onto a work, lists its step stream, searches in place by keyword, and fetches full content by step_id), used to reuse observations other works saw but never wrote into facts, avoiding duplicate work.
- **`node_detail` is delegated to workers**: paired with the lookback tools above, once a worker has an intent_id / node id it can directly query that node's full details.
- **Planning rounds triggered by `add_hint` are now explicitly broadcast**: previously, new hints were only folded into the situation overview for the planner to discover on its own; now one `add_hint` records a trigger for the planner like "human added N strategic hints: …" (a batch counts as one, no per-item spam), and the planner is explicitly told "this round was triggered by new hints" and sees the hint content directly.

#### Changed

- **The global situation prompt now uses a "loosen up" tone**: encouraging exploratory divergence and timely reporting of cross-intent clues, rather than premature convergence.
- **Streamlined the worker boundary wording**: a first setback does not mean fully explored — focus on "exhaust the bypass methods within this intent before concluding".
- `insert_assets` removes the per-asset `related` parameter: its only effect was deciding whether to add the asset to this task's scope, and the value was never persisted (re-registering the same asset voids it, and the UI cannot show what was judged unrelated) — in practice it just made the model do one more judgment that nothing kept.
- **The test scope (`task_scope`) is no longer affected by the asset coverage toggle**: `insert_assets`' automatic scope insertion (`source='auto'`) runs regardless of whether coverage is enabled, and `add_task_scope` is always provided to the planner / in-task main agent / goal-decomposition agent. Scope is the task's authorization boundary and the filter baseline for asset queries; the coverage toggle should only decide whether to use it as the denominator for metrics, not whether to accumulate scope itself. Previously, turning coverage off disabled both the `auto` and `agent` write paths, leaving `task_scope` with only manually added rows. `list_untested_assets` is still hidden when coverage is off (it is itself a pure coverage view).

#### Fixed

- **Fixed assets crossing over between tasks** (#59): `list_assets` previously hardcoded the task id to 0 and raw-queried the entire shared asset database, and the model had no way to write scope filters, so assets from other tasks (especially IPs) were treated as this task's targets and testing went astray. Now it only returns assets within the test scope (`task_scope`) of [this task and directly linked tasks], matched by **ownership** rather than literal value: with a root domain in scope, all of its subdomains/services/endpoints are reachable; with a CIDR range in scope, hosts and services inside it are reachable; fetching an out-of-scope asset directly by id likewise fails. Non-task contexts (Auto/pentest) have no scope to rely on and still fall back to the whole database. Also fixed the ownership blind spot where direct-IP hosts (e.g. `http://1.2.3.4/api`) could not be matched by CIDR scopes. The UI's "Test assets" view (filtered by task producer) is unaffected.
- **Fixed the worker cross-work lookback tools being accidentally removed**: after `search_all_worker_traces` / `get_worker_trace` (and `node_detail`) were added to the worker default toolset, an old "narrow the worker tool surface" migration unbound them again at startup, so workers could not actually get these tools. They have been removed from that unbind list, and databases that already ran the old migration get a one-time re-binding to worker.
- **Fixed `/btw` side questions occasionally failing to persist**: the side_question checkpoint now strips the NUL (`\u0000`) escape that JSONB does not support before writing, avoiding write errors for content containing that character.

### Triggers

#### Fixed

- **Merged trigger sessions deduplicate task descriptions/goals per task**: when multiple tasks are merged into one trigger, the same task's description/goal is no longer repeatedly concatenated into the message, avoiding long goals stacking up and blowing up the context.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)

## [0.3.9] - 2026-09-11

### Agent

#### Added

- The in-task main agent supports **multiple sessions**: create, switch, and independently reset context; every session is interactive.
- Supports persistent `/btw` **side questions**: ask without interrupting the main line; Q&A is persisted and survives restarts.
- `spawn_task` adds `source_task_ids`, letting new tasks **read-only inherit** assets and findings from source tasks.

#### Changed

- Disabled workers' cross-engagement memory and narrowed their default tool surface: reading context and cross-work retrospection are planning duties; workers only handle execution and write-back of a single intent.
- Streamlined the worker default prompt; `get_worker_output` dropped the `terminated` and `worker_name` fields; streamlined the `insert_assets` / `list_assets` descriptions.

#### Fixed

- Fixed works being cut short by **idle-spin rounds**: the model sometimes spends an entire round outputting only thinking, with neither content nor tool calls, and the harness sees a natural end (`end_turn` with no `tool_use`), finishing directly as `completed` + empty summary — an unfinished intent breaks halfway, showing up as "the task ended normally but with no written summary". None of the five LLM retry layers can reach it: it is not an error; the same-provider safe-window retry's entry point is "stream failure"; circuit breaking judges success directly when `err == nil`; intent rerun only recognizes `model_error`; the SDK's empty-response retry cannot reach it either, because that layer judges emptiness by "whether any event was yielded", and thinking deltas are themselves events. Now the work's Stop hook recognizes this kind of round and injects a continue instruction, letting the model carry its already-produced thinking into the next step — deliberately not "resend as-is", because such idle spins are usually determined by the prompt and context shape, a stable behavior rather than a random glitch, and resending would just make the model think it all over again.
- The count reuses the **empty-response retry count** from the LLM page's "Retry & Backoff" (both answer "the model finished but produced nothing of substance", just with different criteria and means), default 2, and `-1` turns it off, reverting to the previous "idle spin means wrap up" behavior. It is a **total** cap per intent, not a consecutive count: the harness itself already limits consecutive idle spins to one push, and the quota only refreshes after a real tool round, so this number guards against "tool → idle spin → push → tool → idle spin" loops burning through the intent budget. When triggered, the log records `[work <worker> · #<intent>] idle-spin round…injecting continue instruction (n/N)`. See `docs/llm-retry-design.md` §1.1 for the design.
- Fixed the `/btw` context budget and input layout in long conversations; insecure contexts (non-HTTPS access) degrade how side-question request IDs are generated.

### Traffic

#### Added

- Vulnerabilities support **linking multiple traffic evidence items**, sortable, with notes, and distinguished by role (request/response/corroboration).
- The report agent **automatically links** relevant traffic evidence before writing the report.
- Added an Agent **traffic binding toggle**, and completed the evidence handoff between agents.

### Tasks

#### Added

- Supports **session-level vulnerability retesting**: retests run in independent agent sessions, with run status shown in lists and details.

### Interception

#### Added

- Approval records gain **details and execution audit**: view the tool request context, model/rule initial verdicts, execution output, and parameter fingerprints.

### Assets

#### Added

- Task test assets support **DSL search**.

### LLM

#### Fixed

- Fixed the test connection not resending custom session headers, which made opencode zen return 400.

### Network

#### Added

- MCP's HTTP transport supports **skipping TLS certificate verification**, making it easier to connect services with self-signed certificates.

### UI

#### Added

- The session list is grouped by agent, supports expand/collapse and independent pinning; conversations support filtering by agent.
- The attack chain graph renders compaction (digest) nodes and collapses their members.

#### Fixed

- Fixed the white screen caused by out-of-sync login credentials.
- The interception notice wording now explicitly marks it as "platform control", avoiding being misread as target-side defense.

### Deployment and updates

#### Added

- Supports **one-click update from the page**: the system settings page gains a "Version & Updates" card, and the top bar shows a notice when a new version is available. The flow is: download the release package → verify `SHA256SUMS` → smoke test → stage → exit and get relaunched by the daemon script to complete the swap, with the page auto-refreshing.
- Added the daemon startup scripts `start.sh` / `start.bat` as the official launch entry (already shipped in release packages and the Docker image; `install.sh` unchanged). They decide whether to relaunch based on the exit code and forward SIGTERM to artex. Verification and swap logic all live in Go; the scripts stay dumb-simple.
- Automatic failure fallback: failed verification or smoke test discards the staged file and keeps running the current version; if the new version fails to start 3 times in a row it rolls back to the previous one. The settings page also has manual rollback (note the database schema is not rolled back).
- Updates only trust GitHub domains and enforce HTTPS; the release source is not configurable; dev builds disable one-click update. GitHub query results are cached for 30 minutes so the top-bar notice does not exhaust the API quota.

#### Known limitations

- Under Docker only the program is swapped, not the image: toolchains are not upgraded along with it, and recreating the container reverts to the image-bundled version — use `docker compose pull artex` when needed.
- The `skills/` from the release package are not synced; new built-in skills in the new version do not take effect automatically.
- Updating means restarting, which interrupts running tasks.

### Dependencies

#### Changed

- Upgraded norma to v0.3.7.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)
- [@RuoJi6](https://github.com/RuoJi6)

## [0.3.8] - 2026-09-09

### LLM

#### Added

- The LLM page gains a "Retry & Backoff" tab: both the **count** and the **interval** of all five retry layers are configurable. A failed model call passes, from inside out, through connect retry (SDK; connection reset / timeout / 429 / 5xx before the stream starts), empty-response retry (SDK; a normal end with no content at all, openai format only), same-provider safe-window retry (replaying a broken stream before any output was delivered to the caller), polling circuit breaker (cool down and skip after consecutive failures hit the threshold), and intent rerun (after a worker ends with model_error, the whole intent reruns) — an outer layer only kicks in after the inner ones are exhausted. Each layer has two knobs with unified semantics: empty = use the original default count with exponential backoff; a count = use that count; an interval = switch exponential backoff to a fixed interval; -1 = turn off this layer. The first three layers follow the endpoint and can override the global defaults field by field in each model configuration (pinning only the interval still inherits the global count); circuit breaking and intent rerun are process-level semantics with only one global copy. Changes take effect hot after saving, no restart needed. Leaving everything empty is the current behavior, and upgraded databases are byte-for-byte unchanged (new columns default to 0; absent settings keys mean all defaults). The connection test deliberately does not carry these parameters — it has a 30s hard timeout, and stacking user-configured retries would only misdiagnose a working endpoint as a timeout failure. See `docs/llm-retry-design.md` for the design.
- Each LLM configuration supports a custom **session header** (`session_header_key`): when non-empty, every LLM request carries this HTTP header whose value is the current run's session id (`conv-<id>` for chat sessions, `exp<x>-worker-i<intent>` for workers, etc.), for gateways that do prompt caching / sticky routing by session-id header. Implementation reads the session id from the request context and injects it, no norma changes needed, and even a shared provider can emit different header values per session. Existing databases get a migration, and the frontend LLM configuration dialog gains an input box.

#### Fixed

- Fixed saving an LLM configuration failing with `23502` when the session header field was empty: the column is `NOT NULL DEFAULT ''`, but a misplaced `NULLIF($n,'')` wrote an unfilled session header as NULL and tripped the not-null constraint; it now passes the parameter directly with empty-string semantics.

### Agent

#### Added

- Wall-clock timeout now **wraps up in place**: depending on norma v0.3.6, when `MaxDuration` hits, the running tool is interrupted and the run continues on a live ctx for the wrap-up rounds (writing back identified content + summary, final state timeout), instead of relying on worker/planner's own `maxDur+90s` external hard ctx to kill a stuck run straight into `aborted_tools`. Chat goes through the same harness and gets the same behavior automatically; mainagent has no `MaxDuration` and is unaffected.
- Stall fallback: when the planner wakes on a heartbeat / no-change wake-up and the whole graph has no open or running intents left, its opening message becomes a stall alarm, clearly stating that no worker is running and no direction is queued, and that this round must produce one or more mutually non-duplicate new intents (zero intents is not allowed).

#### Changed

- Worker prompt rework: the intent / launch instructions / anchored-asset raw JSON moved into the system prompt, reassembled every round, never compacted away, and continuation no longer depends on the transcript's first message surviving; the launch user message slimmed down to just the global situation overview (degradable, stale-tolerant). The cost is per-intent data mixing into system and losing cross-intent cache reuse — a deliberate trade-off for "never lose the intent".
- Streamlined planner / worker default bodies and fixed several field issues: the planner distinguishes `recent_done` by status (blocked/exhausted → check the trace before deciding, neither treated as a dead end nor blindly rerun), negative conclusions become "observation / doubtful, not verdict" with evidence checked before acceptance, an unmet goal with no open/running intents must produce output (hard floor), and depth takes priority over coverage; worker negative conclusions only write "observation + tentative reading", the verdict belongs to the planner, and cross-intent clues go into a fact's summary for the planner instead of being chased by the worker itself. Reseeding appends the new defaults as a new version and switches to it; user-customized / old versions are kept in history and can be rolled back.
- Narrowed the work agent default toolset and the asset write-back hints: workers only handle execution and write-back of a single intent — reading context / cross-work retrospection are planning duties — so `list_facts` / `node_detail` / `list_companies` and the cross-work retrieval tools (`search_all_worker_traces` / `list_worker_traces` / `get_worker_trace`) were removed from their default tools, keeping only `list_findings` (dedup before reporting vulnerabilities) + `add_finding` / `record_fact` + `insert_assets` / `list_assets`; the prompt dropped stale field descriptions that conflict with the `insert_assets` schema (`type=tech`/`on_url`/`props`). Existing databases get a one-time migration stripping the corresponding bindings; the same-named bindings of planner/main are untouched.

### Exploration graph

#### Added

- **Exploration graph cold-node compression (cold-digest)**: folds old, long-inactive intents / facts into digest nodes shown in `graph_overview`; the original nodes are kept forever and fully restorable by id (lossless storage, presentation-only compression, reversible folding). Hot/cold is determined by reverse reachability + any live branch making it hot, with R=6 rounds of debounce and connected-component grouping; background compression (minor folds uncovered cold blocks, major re-compresses from source and merges fragments) has activity rechecks and cooldown mutual exclusion, never touches the hot path and never overwrites revived nodes. The overview side provides `cold_digests` and the per-asset `cold_index`; `expand_digest` / `expand_index` restore them. Linked / inherited tasks' overviews likewise reuse their own folded views, and `expand_digest` supports cross-task read-only restore. `expand_digest` / `expand_index` go to planner and main agent only, not workers. All with migrations for existing databases.
- `graph_overview` now outputs `finding_list` in full: findings are a task's highest-value output and usually few per task, so they are now fully included in the overview (unlike facts, which only give a recent window) — planner/worker can see all confirmed vulnerabilities at a glance each round without calling `list_findings`. Each is slimmed to `{id, summary, evidence?, from_intent?, assets?}`, with affected assets given as readable content (url / domain / ip:port) instead of bare ids.

#### Changed

- `graph_overview` no longer lists `hosts` flat: the coverage block drops the host list (in large-scope tasks it carried up to 500 host strings per round, of limited value to planning decisions) and keeps only `host_count`; specific hosts are queried on demand via `list_assets`. Added a top-level `done_intents_total` (total finished intents), parallel to `recent_done_intents` which is truncated to ≤15, so the planner knows whether truncation happened when deduplicating.

### Tools

#### Changed

- `add_company_scope` default binding changed from worker to planner: defining a company's asset scope is the duty of planning / main control / Auto; workers only execute exploration. Fresh seeds default-bind to mainagent/planner/auto; existing databases get a one-time migration.
- planner now default-binds `list_assets`: it has both `list_assets` (DSL full-database search) and `list_untested_assets` (untested within scope); existing databases get a one-time backfill that does not override user unbindings.

### Tasks

#### Added

- The task list gains a "Running Workers" column: counts the intent nodes with `state='running'` under that task, with exactly the same semantics as the "Running Workers" in the task details overview; shows 0 when none are running.

### Network

#### Added

- Added a **global egress proxy** configuration: all target traffic can egress through one unified global proxy (http/https/socks5, `user:pass` supported). When traffic capture is on, it acts as the upstream of the MITM recording proxy (traffic is still recorded, then egresses via the proxy; both interception and passthrough paths use the upstream and never leak the source IP); when capture is off, it is injected directly into the agent's bash environment and WebFetch (`proxyEnv` gains `ALL_PROXY` for socks5). The configuration lives in the settings KV table (no migration needed); the frontend system settings page gains a "Global proxy" card, independent of the web search proxy and the LLM proxy.

### UI

#### Fixed

- Fixed semantic errors in intent status labels: `exhausted` "Exhausted" → "Budget exhausted" (it actually means the step/time budget was cut off midway with only partial results written back, not that the direction was fully explored), `blocked` "Blocked" → "Error" (it actually means model / API / network failures exhausted retries and the intent barely got explored, not target / WAF interception), and added the previously missing `stopped` "Stopped" (a work manually stopped by the user).

### Dependencies

#### Changed

- Upgraded norma to v0.3.4: MCP tool output gains truncation and disk spilling (see `651b961`); the later v0.3.6 supports in-place wall-clock wrap-up.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)

## [0.3.7] - 2026-08-31

### LLM

#### Added

- Model configurations gain an "output limit", plus a choice of which request field name carries it: the limit caps how many tokens a single reply may generate and is sent with every request; 0 (default) = do not send the field, the server's default decides. It is not the same as the "context window" — the latter is the model's total capacity, used only locally to compute compression thresholds, and never appears in requests. The field-name switch only matters for the `openai` (Chat Completions) format: empty (default) sends `max_tokens`, which the vast majority of compatible gateways only accept; OpenAI's official reasoning models (o-series / GPT-5), conversely, only accept `max_completion_tokens` and respond to `max_tokens` with `unsupported_parameter`, so such endpoints must be switched manually. The other two formats hardcode their field names (Anthropic is `max_tokens`, Responses API is `max_output_tokens`), so for non-openai formats the switch is greyed out and cleared on save. Also connected a link that was never wired before: none of planner / worker / chat / main agent / goal decomposition ever set an output limit — openai-style never sent it, Anthropic fell back to the SDK's 8192 — so adding the config without wiring this link would make any filled number ineffective; now the value is resolved per round from the configuration, just like "streaming output", and takes effect the round after a failover switch. Behavior is completely unchanged after upgrading existing databases (new column defaults to 0 and empty field name).
- Clicking "Test" in the backend now logs each HTTP attempt's status code and the gateway's raw response body to the server log (bodies truncated to 4K), making it easier to diagnose 401s, quota messages, empty frames, HTML page responses, etc., instead of only seeing the UI's collapsed ok / err. This logging does not depend on the "LLM records" toggle.

#### Changed

- The task LLM configuration chain can now be modified in any state, no longer restricted to "Running / Paused / chain exhausted": after a task ends (done / failed / timeout), the main agent conversation still uses this chain, and when a model on the chain had problems you previously could neither edit it nor continue interacting. Both terminal-state blocks — the backend HTTP layer and the DB transaction layer — were removed, and the frontend dialog allows editing and saving for terminal tasks too. Saving a terminal task no longer reopens quota-blocked intents (those intents are moved to open — no worker executes them, and they no longer meet the "rerun intent" conditions); to keep running, use rerun intent / add goal, which pull the task back to the running state.

### Agent

#### Changed

- "Messaging a running Worker to adjust its direction" now reuses the existing pause / resume + transcript resume mechanism, behaving consistently with main agent conversations: it previously used a self-built intervention persistence protocol that touched scheduling barriers, recovery flows, and a dozen-plus activity query filters. Now messages are injected via the next round's input, and the intent runs directly in a dedicated goroutine, unconstrained by the 3-slot worker pool — send and it runs; the frontend keeps the message box and restores the "Continue directly" button, with sending now carried over SSE. No DB schema changes. Trade-offs: messages live only in memory with no crash recovery, and the task may transiently exceed concurrency by one worker while messaging (a low-frequency scenario, acceptable).

### Tasks

#### Fixed

- Fixed out-of-memory (OOM) crashes when archiving large tasks: archiving now streams the snapshot instead of reading the whole task into memory at once; also closed three recovery gaps on the cold-archive path — traffic from modern installs lives only in SQLite, and previously a crash between the PostgreSQL commit and the SQLite commit would leave an archived task's traffic stranded in hot storage with no way to recover; now a staging journal is written whether or not a history directory exists, and a missing `journal.json` is treated as discardable.
- Fixed system sluggishness with many tasks: loading conversations and loading pages had noticeable delays. Queries for the task list, task context, and exploration records were optimized together, and the frontend dashboard, conversation page, and task details page reduced duplicate requests in sync.

### Assets

#### Changed

- Removed the "at most 256 rules" limit on company asset scopes: companies entering scopes IP by IP / domain by domain easily hit this cap, after which they could only split into multiple companies, even though the scope itself is no slower with more entries. The cap was removed in all three places — frontend, backend, and demo mock; each rule is still limited to 1024 characters, and the 2 MiB request body cap remains as a backstop (roughly forty to fifty thousand rules).

### Skills

#### Fixed

- Fixed "upload failed: zip: unsupported compression" when uploading skill archives: the Go standard library only ships Store / Deflate decompressors, so bzip2 and Zstandard archives written by compression software at non-default settings could not be opened at all. Both decompressors are now added (pure Go implementations, no new external dependencies); methods that genuinely cannot be decompressed, like Deflate64 / LZMA / XZ / PPMd, and encrypted archives, now produce a clear message before extraction naming exactly which file uses which compression method and how to repackage it, instead of throwing the low-level English error at the user.
- Fixed skill-internal filename validation rejecting Chinese filenames as illegal: path validation used to be an ASCII whitelist of `[A-Za-z0-9-_./]`, so an archive with even one Chinese-named file (like `reference/notes.md`) failed the whole upload with "archive contains illegal paths". Now it's a Unicode blacklist: filenames in any language and spaces are allowed, while control characters, invalid UTF-8, zero-width and bidi control characters (RLO filename spoofing), `\ % # ? * : " < > |`, and `..` / absolute paths / empty path segments are still rejected — directory traversal protection is unchanged. Skill names are likewise relaxed — ASCII is still limited to lowercase letters, digits, and hyphens (the agentskills.io spec), while non-ASCII letters like Chinese can be used directly as skill names, but spaces, dots, and path separators are not accepted.
- Fixed garbled filenames or whole-package rejection when extracting Chinese-language archives made by Windows compression software: such zips do not set the UTF-8 flag and write filenames as GBK; they are now decoded with a GBK fallback before path validation. Also, quoted frontmatter like `name: "My Skill"` now correctly yields the skill name.

### UI

#### Added

- The findings page gains an "All findings" flat view, set as default, switching with the original "Group by task" view via header tabs: the grouped view requires expanding tasks one by one to see vulnerabilities, which is a detour when you just want to scan a cross-task list. The flat view is one big cross-task table (10/20/50/100 per page) with behavior identical to the grouped view — checkbox export, inline expand for evidence and detailed reports, inline edit of name/category/severity, change handling status, deep-dive, delete. Both views share the stat cards and filter bar; switching does not lose filters, and the current view plus filters are stored locally; polling only hits the current view, inline edits write both caches, so switching never shows stale data.
- The findings page gains a "By asset" view: an asset tree on the left (company → root domain / IP → subdomain → service → endpoint; the company level only appears when assets actually have an owner), and on the right the findings under the selected node's entire subtree, sharing the same table and the same filters as the other two views. The tree only includes assets with findings, with ancestor chains filled in as needed (when a finding hangs only on the deepest endpoint, the layers above are still assembled); node counts are subtree aggregates deduplicated by finding; findings whose assets were deleted or were never linked go into the "Unlinked assets" bucket. Unlike the other two views, the asset view does not poll — it queries on entering the view, changing filters, adding/removing/editing findings in the page, or clicking the tree's refresh button; the left tree is a navigation structure, no need to recompute every 5 seconds. Each tree level shows only the delta relative to the level above (subdomains drop the root domain suffix, services show `https :443`, endpoints show only the path); full values are in hover tooltips and breadcrumbs; when there are too many nodes, whole levels drop the endpoint/service tiers with a notice, and counts still roll up.

#### Fixed

- Fixed conversation records being squeezed and unreadable in session details on mobile: on narrow screens the session list collapses, yielding width to the records themselves.

### Dependencies

#### Changed

- Upgraded norma v0.3.2 → v0.3.3: adds `Config.MaxTokensField`, letting OpenAI Chat Completions' output limit be sent as `max_completion_tokens` instead (reasoning models only accept this key). The two keys are mutually exclusive — only one is sent, default still `max_tokens`.
- Upgraded `golang.org/x/mod` v0.37.0 → v0.40.0, fixing two dependency security alerts.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)
- [@neouks](https://github.com/neouks)
- [@begininvoke](https://github.com/begininvoke)

## [0.3.6] - 2026-08-27

### LLM

#### Fixed

- Fixed the "non-streaming" toggle reverting to "streaming" after saving and reopening (#69): the config list API's DTO was missing the `streaming` field, so the response never returned it, and the frontend read `undefined` and always fell back to the default streaming; the actual write and DB storage were fine — it just could not be read back. The DTO regained the field (without `omitempty`, so `false` must appear in the response too).
- The connection test now verifies the model actually replies, and tests with the configuration's real send/receive mode (#65): previously it only checked whether HTTP succeeded, so a request that went through but got zero model reply (thinking burned the budget / content swallowed by safety policy / the compatibility layer dropping `content`) still reported "connection successful", which was inconsistent with the "no reply" behavior in conversations; and the test always used streaming, so a non-streaming configuration was actually testing a different channel. Now an empty reply is judged a failure outright, success shows the model's reply in the message, and the current streaming toggle is carried into the test, keeping "test passed" consistent with "conversations work".

### Agent

#### Changed

- `list_facts` is now paginated + keyword-filtered, avoiding blowing up the context in one call when there are many facts (#74): returns the latest 20 by default, supports `limit` (cap 100) / `before` cursor / `q` summary keyword, and returns `{facts, total, has_more, next_before}`; overly long per-item summaries are truncated by character count (full text still via `node_detail`). The worker / planner prompts were synced to the pagination semantics. Existing databases get a one-time migration refreshing the new parameter schema into the tool catalog table (`SeedTool` inserts only on first insert, otherwise the tool management page shows "no parameters").

### Tools

#### Added

- The "Tool executions" page gains tool call count statistics (#72): the toolbar's "Statistics" button opens a dialog showing per-tool call counts, shares, and failure counts (sorted by count descending); it reuses the list's task / keyword filters and computes over the whole result set, not the current page, fetching only when the dialog opens.

### Dependencies

#### Changed

- Upgraded norma v0.3.1 → v0.3.2: fixes silently dropped reasoning/refusal in OpenAI-family responses (Responses gains `reasoning_text`), dedup of the three reasoning field names, bounded retry of empty responses (zero content blocks), and gateway 400s caused by compression boundaries cutting tool pairings (also repairing existing orphans already baked into transcripts).

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)

## [0.3.5] - 2026-08-25

### LLM

#### Added

- Each LLM configuration supports a streaming/non-streaming toggle (default streaming): on means streaming SSE; off means true non-streaming (`stream:false`, one complete JSON returned at once), which can bypass some gateways' broken SSE implementations (empty frames, lost thinking-field frames), at the cost of losing realtime progress and realtime token counts during runs. worker / planner / mainagent / chat / goals all take the value dynamically from the currently active configuration; the three Provider wrappers `llmpool` / `llmrec` / task runtime all support non-streaming; `llm_profiles` gains a `streaming` column with an `ALTER` backfill for existing databases (default `true`, old configurations unaffected).
- Support for LLM configurations in the OpenAI Responses API format: each configuration gains a third format `openai-responses` (hitting `POST /v1/responses`), alongside Chat Completions / Anthropic; `BaseURL` normalization, default model `gpt-5`; the `format` constraint of `llm_profiles` adds `openai-responses` with an idempotent migration for existing databases; the frontend format dropdown gains "OpenAI (Responses API)". Depends on the norma v0.3.1 upgrade (includes the `reasoning_content` pass-through fix).
- Record the raw HTTP of LLM requests/responses: captures the real wire body at the HTTP transport layer, preserving tool schemas, `tool_use` blocks, and raw SSE frames invisible in the normalized view; each of norma's internal retry attempts is kept individually; `llm_records` gains `raw_request` / `raw_response` columns with an `ALTER` backfill for existing databases; the records page details panel gains a "Raw" view toggle and request/response copy buttons (with an `execCommand` fallback for insecure contexts).

### Conversations

#### Changed

- Session list multi-select becomes a "Multi-select" mode toggle: the list no longer permanently shows per-row checkboxes (cleaner look); the header becomes a "N total + Multi-select" button; clicking "Multi-select" enters selection mode (checkboxes, select all, batch delete), "Done" exits and clears the selection, and batch delete exits automatically when all succeed (stays in selection mode on failures for easy retry); single-item rename / pin / delete still go through the per-row ⋯ menu.

### UI

#### Changed

- Enhanced task management, session operations, and traffic viewing experience (#57): task list column sort preferences are now persisted, inline rename is triggered directly by an icon (no longer via a menu), and drawer (sheet) interactions and traffic viewing details were polished.

#### Fixed

- Worker asset labels now show only domains and IPs, and empty-label cases are handled correctly.

### Agent

#### Added

- The planner's goal judgment gains a "quantitative acceptance check": when a goal contains quantifiable acceptance criteria (asset test coverage reaches X%, N flags obtained, a certain permission gained), the measured values in `graph_overview` (`coverage.pct`, findings count, etc.) must be checked before `prove_goal`; if the measured values fall short, `prove_goal` is forbidden and intents are dispatched to close the gap instead — it may not be marked met early on grounds of "the main part is done / roughly achieved". Fixed the problem where a goal requiring 100% coverage was judged complete at a measured 40%.

#### Changed

- Rewrote the criteria for "0 intents this round" in the planner prompt: the original text described 0 intents as "the most common, most important principle", which made the planner fold too early when goals were unmet and untested surface remained in scope. Now 0 intents should only be produced in two concrete situations — ① every direction thought of is already covered by open/running/recent_done intents; ② the next step depends on the output of a currently running work that has not appeared yet (wait for it to finish and plan on the next wake-up after the graph updates). A reverse constraint was added: when there genuinely are uncovered new directions independent of running works, or the goal is unmet with untested surface remaining, do not fold just because "0 intents is common".
- Strengthened the "evidence bar for negative conclusions" in the worker prompt: for negative conclusions like "not injectable / port closed / no login entry" that could make the planner abandon an entire direction, reasonable methods within the intent must be exhausted before concluding (switch encoding/parameter/path/method); if methods are unfinished or evidence is weak, always mark `confidence=inferred`, avoiding welding a whole route shut with a rash `observed` negative (wrong negatives early in a task especially derail direction and are hard to self-heal).
- The above planner / worker default prompt changes are appended as new versions and switched to current via one-time migrations (`reseedPlannerPrompt` / `reseedWorkerPrompt`, each guarded by a settings flag); old versions are kept in version history, and users who customized prompts can restore them from the version records.

### Operations

#### Added

- Added `reset-password.sh` to reset the admin (username fixed as `ARTEX`) password: supports both local / docker deployments; connection info can be specified explicitly or read automatically from `--dsn`/`$ARTEX_PG_DSN`/`config.json`; uses `pgcrypto` in the database to generate a bcrypt hash compatible with backend login and writes it back to `settings.auth.password_hash`, no service restart needed after reset. The password is passed via an environment variable, never enters the process argv, and is escaped against injection.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)
- [@neouks](https://github.com/neouks)

## [0.3.4] - 2026-08-24

### UI

#### Added

- After selecting multiple tasks in the task list you can batch-change their category; the target category supports "Uncategorized" to move tasks out of their current category; the whole batch writes in one transaction, and failures can only be tasks deleted after being selected.

#### Changed

- The new-task "Task category" changed from a dropdown to a searchable input: typing filters existing categories, Enter (or clicking "Create" in the dropdown) instantly creates and selects a name not in the database, and the selection shows as a removable tag; still limited to a single category.

### Conversations

#### Fixed

- Fixed messages being blocked with "LLM not configured, cannot chat" when the conversation had an LLM configuration selected but no global active configuration existed. The pre-send check only looked at the global active configuration, while actual execution prefers the conversation-selected configuration — the two resolution logics were inconsistent; they are now unified into one (session/Agent binding first, global as fallback).
- The cannot-chat message is now differentiated by state: no configuration at all suggests "Add a configuration", having configurations but none activated suggests "Activate one or specify one for this session" — no longer always showing "Not configured", making it easier to locate the problem.

### Agent

#### Added

- For tasks whose goals are all met, intents dispatched by the main agent via `add_intent` can be claimed and executed by Workers directly, stopping when done: the Planner does not run in this state (a task with no open goals does not enter planning), avoiding it re-judging goal completion and cancelling freshly dispatched intents; once the frontier is drained the task returns to Completed. Before dispatching an intent, the main agent asks the user, based on the intent content, whether to register it as a formal goal — registering restores the task's normal autonomous planning.

#### Changed

- When `step_ids` of `get_worker_trace` / `get_task_worker_trace` exceed the per-call cap (5), it no longer errors outright — it returns the full content of the first 5 steps and tells you via `returned_step_ids` / `omitted_step_ids` / `notice` which were fetched and which remain, with a hint that "if this is enough, no further fetch is needed". Duplicate and invalid ids in the input are deduplicated and removed before counting.

#### Fixed

- The task list now sorts by task id descending (newest first), replacing the previous sort by creation time. Multiple tasks created in the same instant had identical timestamps and unstable ordering, which — combined with 10-second polling and random map iteration — made them frequently swap positions in the list.

### Assets

#### Fixed

- Fixed company attribution recomputation being broken by a single row of dirty data: when `assets.ip` held a hostname (written by an agent or the asset API), `a.ip::inet` threw `22P02`, making add/edit of company asset scopes and company deletion all fail and roll back. Switched to the safe conversion `try_inet()` — illegal values are skipped instead of aborting the whole statement.
- Unparseable `ip` values are no longer silently skipped: after saving a company scope, it explicitly reports how many assets' `ip` is not a legal IP (with concrete ids and values), reminding that these assets will not be attributed by IP/CIDR rules; the same information is written to the server log, covering paths with no frontend response (company deletion, scopesentry sync, agent writes).
- IP/CIDR matching of the task test scope likewise switched to `try_inet()`, replacing the previous regex guard that only checked the character set (hostnames like `abc.def`, all hex letters, still slipped through and triggered the same error).

#### Changed

- The `ip` field of `ip`, `service`, and `endpoint` assets no longer accepts hostnames: `insert_assets` and the asset API return per-item errors with `index`, and directly give the fix (use `type=subdomain` with `domain`, or resolve A/AAAA records first), so the agent can correct and reinsert on its own. Other assets in the same batch are unaffected and stored as usual.

### Contributors

- [@neouks](https://github.com/neouks)

## [0.3.3] - 2026-08-23

### Worker

#### Added

- Running Workers support per-item pause, resume, and cancel; pausing keeps intents, facts, and vulnerabilities, while cancelling transactionally cleans up the current intent and its direct products after execution exits.
- Added the `paused` intent state, execution fences, and named termination reasons, preventing late blackboard writes after pause, cancel, or task deletion.
- Added an optional task concurrency cap; new, resumed, vulnerability deep-dive, and queue backfill all go through a unified persisted FIFO admission path.

#### Changed

- The default wall-clock duration of a single Worker run changed from 600 to 1200 seconds; after a timed-out task is revived, the clock restarts at the next real execution.
- The task status badge is now uniformly driven by the real execution states of Worker, Planner, and main agent, fixing the problem where it still showed "Idle" while Workers were running.
- The Worker session keeps per-item controls and the current session's token summary; the model name moved to the right of the current session title.

#### Removed

- Removed Worker multi-select, select-all, and batch pause/resume UI, along with the Worker batch control API and Mock contract.
- Removed the Token badge and Tooltip from Worker list rows; the underlying full token ledger and task aggregation API remain.

### LLM

#### Added

- Tasks support ordered LLM configuration chains; when provider quota exhaustion is clearly identified, it automatically switches to the next configuration, persisting the current configuration, exhaustion state, and error summary.
- Running and paused tasks support editing the full configuration chain, reordering, and manually switching the current configuration, effective from the next LLM call.
- Automatic switches, manual switches, and full-chain exhaustion are written as structured system activities and surfaced via the task activity stream as dedupable alerts.
- Added a task-role model resolution API, uniformly resolving which configuration and model the Main Agent, Planner, and Worker use for their next call.
- Added an optional global LLM Pool, supporting call ordering, per-model failure fallback, health states, cooldown recovery, and manual reset.
- Added an always-on LLM usage ledger, aggregating input, output, and cached tokens by task, session, model, and configuration.

#### Changed

- Goal decomposition, Planner, Worker, and main agent share the task-level LLM runtime (resolution priority below).
- Failover only responds to explicit quota, balance, or billing errors; ordinary rate limiting, auth, network, server, and context errors do not cause erroneous switching.
- The LLM configuration page is now a configuration card list with a right-side drawer editor, providing Pool polling order, priorities, exclusions, health states, and recovery operations.
- Chain-exhaustion messages wrap on narrow screens; the current model changed from a session list icon to a text label next to the current session title with a full Tooltip.
- The LLM resolution order for roles within a task is now "Agent binding → task configuration chain → global": roles with an explicitly bound model always run on that model, unbound roles fall to the task chain, and only when the task chain is empty do they fall to global.
- An empty outbound proxy now means direct connection, no longer falling back to the `HTTP_PROXY`/`HTTPS_PROXY` environment variables (an explicit `ARTEX_LLM_PROXY` is unaffected); proxy input supports `socks5://user:pass@host:port` with credentials.

#### Fixed

- Transient streaming failures before commit (before any output was produced) now safely back off and retry on the same provider, significantly reducing cases of "interrupted after only one or two tools, no summary, final state `model_error`"; quota exhaustion, over-long context, and deterministic 4xx errors are not retried and are still handled by failover and compaction recovery respectively.

#### Removed

- Removed the LLM icon-style marker in the session list, avoiding confusion with Worker status icons.

### UI

#### Added

- Tasks support creating, renaming, deleting, and filtering by global categories; new tasks can pick a category directly.
- Added global task template CRUD and a right-side management drawer; new tasks can load preset descriptions and goals, or save the current content as a template.
- New tasks support linking multiple source tasks and multiple company asset scopes; company scopes auto-recognize domains, URLs, IPs, CIDRs, ICPs, and company keywords from a single multi-line text box.
- Task test assets support realtime add and delete, recording sources such as manual, company, inherited, or agent-discovered; the Worker session title shows the current test assets and a source summary.
- The findings page groups by task with independent per-group pagination, and supports filling in a description for a vulnerability and creating a high-priority deep-dive intent.
- Conversations support rename, pin, unpin, and delete; the task list supports batch pause and resume of the current page.
- Traffic details and tool execution details are now right-side drawers; HTTP messages fill in the `Host` header and highlight the request line, status code, headers, JSON, and markup bodies.
- The task list actions column gains "Details" and "Pause/Resume" buttons; the conversation send keybinding is configurable in system settings (`Enter` / `Cmd+Enter`, etc.), and the web search area gains a proxy input box.
- The badge right of the session title now shows the LLM configuration name, with the model ID moved to the hover Tooltip; tasks can have an optional name, and the task list gains a name column and search (falling back to the description when empty).
- The skills page adds usage counts, last-used times, and missing-dependency stats, making it easier to locate skills that are not effective or not installed.

#### Changed

- Task titles are now focusable details links; task assets, company assets, finding task groups, and in-group vulnerabilities use real server-side pagination, stable ordering, and exact totals.
- Adding a company now uses a right-side drawer; scope entry is unified into multi-line text with realtime recognition, validation, and type preview.
- The main agent input box supports auto-growing, `Enter` to send, `Shift+Enter` for newline, and avoids accidental sends during IME composition.
- Agent preview, task reports, and related details uniformly use the shared Markdown renderer; delete confirmations, long errors, and mobile drawer widths were uniformly fixed.
- The task template selector displays and searches by template name and submits by template ID; restored the system's original font sizes, and the app version uniformly displays as `0.3.3`.
- Task total and current session tokens now only highlight input, cache-read, and output values; the send button uses a simpler up-arrow icon.
- The task overview's test scope shows company names instead of IDs.

#### Fixed

- Plain text containing dots is no longer misjudged as an ICP registration number.
- Fixed duplicate keys rendered in the Agent editor's variable list caused by variable catalog entries colliding with global runtime variables (like `{{.Now}}`).

#### Removed

- Removed the standalone "Enter" button on task cards — clicking the task title now uniformly opens details.
- Removed the dashboard "New task" button, the Logo URL input when adding a company, and the vulnerability count Badges at the top of the findings page and in task groups.
- Reverted the global 10% font-size increase, and removed the Worker checkbox, model icons, and row-level token stats from the session list.

### Agent

#### Added

- New tasks can directly link multiple existing tasks, read-only inheriting the direct source tasks' goals, facts, vulnerabilities, completed intents, asset scopes, and blackboard context in realtime.
- Blackboard read tools support on-demand queries of source tasks' nodes, facts, vulnerabilities, and execution traces; inherited nodes carry a source marker and all write tools refuse to modify them.
- Company scope tools support domains, URLs, IPs, CIDRs, ICPs, and company keywords; keywords only serve as scope hints for the agent and do not participate in automatic asset attribution.
- The vulnerability deep-dive action creates a high-priority manual Worker intent in the original task, with an asset anchor and a `derived_from` edge.
- The overview gains a "Goal management" card, supporting manual view, add, edit, and delete of goals; adding or editing notifies the Planner and revives the task, while deleting hard-deletes the goal node (cascading to edges and anchors) without reviving.
- The main agent gets the `steer_work` tool by default, injecting corrective instructions into running Workers in realtime without interrupting or losing progress (still validating that the intent belongs to this task).

#### Changed

- Source task intents do not enter the new task's frontier; new tasks keep using independent exploration, execution queues, working directories, and conversation history.
- Deleting a running intent no longer destroys data: it now stops to `stopped`, requires a deletion reason, attaches the reason to the intent as a fact and writes it into the payload, and the planner is notified via a `cancelled` trigger (intent content and reason preserved).
- The main agent conversation is now driven by the server-side activity stream, with input recoverable after send failures; opening a session auto-scrolls to the bottom and keeps the last reply visible after details lazy-load.
- Pausing a task terminates current Main Agent, Planner, and Worker calls, but does not prevent the user from actively starting a new main agent orchestration session during the pause.
- Cancel, close, and stream interruption uniformly preserve the real termination reason, generated content, round count, elapsed time, tokens, and unreturned tool calls.

#### Removed

- Removed optimistic client-side message echo in the main agent, avoiding duplicate messages and cross-session stream mixing under pause, failure, or concurrent activity.

### Constraints

#### Added

- The goal decomposition phase now extracts operation constraints (allow/deny) before decomposing goals, and the main agent can add more at runtime; constraints are injected into Planner and Worker system prompts at the highest priority, and after de-biasing, diversity and surface-expansion exploration explicitly obey the constraints.
- The overview gains a "Constraint management" card and add/edit/delete APIs; constraint injection scope can be toggled separately for Planner / Worker (both on by default, read every round, effective immediately). The new table `task_constraints` uses `CREATE TABLE IF NOT EXISTS`, so existing databases get it automatically.

### Interception

#### Added

- Command interception adds a model fallback approval beyond regex/string rules: when no rule matches, the model makes an `ALLOW`/`ASK`/`DENY` semantic judgment; the failure fallback action and approval timeout action are configurable; the interception page splits into "Interception rules / Model configuration" tabs, and model judgments are marked with a `[Model]` prefix and a reason.

#### Fixed

- Hardened verdict output parsing, preventing a correct `DENY` verdict from being mistaken for an allow.

### Traffic

#### Changed

- Traffic recording now stores whole exchanges in SQLite (large bodies spill into hash-deduplicated blob buckets), with a trigram full-text index over text bodies supporting arbitrary substring and Chinese search; deletion degenerated to a single SQL transaction — from hours down to milliseconds, and recording no longer stalls during it. Added streaming download of large bodies and a full-text parameter for `traffic_search`; old file-tree data needs no migration and remains readable, searchable, and deletable.

### Tasks and assets

#### Added

- Task creation gains an "asset coverage feature" toggle (default on): when off, coverage is neither computed nor displayed, the situation graph shows only assets, `task_scope` is not auto-accumulated, and related tools are removed from Planner / main agent; company linking is unaffected by this toggle.
- `insert_assets` gains a per-asset `related` flag (default `true`): only effective when coverage is on; `false` puts the asset only into the shared asset database, not counting toward this task's coverage (e.g. incidentally discovered adjacent sites or unrelated assets).
- Company scopes and task test assets uniformly support recognizing domain, URL, IP, CIDR, ICP, and keyword text; domains/IPs can create or reuse global assets, while CIDRs/ICPs/keywords are kept as task scope context.

### Build

- `build.sh --release` builds Linux amd64/arm64, macOS amd64/arm64, and Windows amd64 in one go, generating zip release packages with `skills/`, a config example, and the README.
- Uses the Go linker to strip debug info and generate zip release packages; UPX is now explicitly opt-in, avoiding segfaults at startup of its self-extracting ELF on some Linux environments.
- The Release workflow runs a startup smoke test on the Linux amd64 binary and ships `SHA256SUMS` with the release packages.

### Contributors

- [@neouks](https://github.com/neouks)

## [0.3.2] - 2026-08-20

### Added

- New tasks can link multiple existing tasks, inheriting the direct source tasks' facts, vulnerabilities, completed intents, asset scopes, and blackboard context in realtime and read-only; new tasks still use independent execution queues, working directories, and session history.
- Tasks support ordered LLM configuration chains. When provider quota exhaustion is clearly identified, it automatically switches to the next configuration, persisting the current configuration, exhaustion state, and structured audit activities.
- Running and paused tasks support editing the LLM configuration chain, reordering, and manually switching the current configuration; automatic switches, manual switches, and full-chain exhaustion are surfaced on the task details page.
- Running Workers support pause, resume, and cancel. Pausing keeps blackboard data; cancelling transactionally cleans up the intent and its directly produced facts, vulnerabilities, and execution records after the Worker stops writing.
- Deleting a task can optionally also clean up linked assets, traffic, vulnerabilities, and task files on disk, with deletion barriers, concurrency protection, and auditable deletion stats added.
- Added an optional task concurrency cap; new tasks beyond the cap queue in FIFO order and start automatically once a running slot frees up.
- Added task asset pagination, company asset pagination, task category statistics, and paged intent Mock contracts.
- Added the `build.sh` single-binary build script, supporting static frontend export, asset embedding, cross-platform targets, and build version injection.

### Changed

- Task-level explicit LLM configuration chains coexist with the existing global LLM Pool; explicit chains keep the strict quota failover semantics, and without an explicit chain the Agent binding and global configuration rules apply.
- The main agent input box supports auto-growing multi-line input, `Enter` to send, `Shift+Enter` for newline, and avoids accidental sends during IME composition.
- Planner, Worker, and main agent share the task-level LLM runtime; the task chain uses the smallest context window among candidate models as the safe compression threshold.
- The task details page shows running, idle, and paused states based on real LLM call states; source tasks' facts, vulnerabilities, intents, asset references, and graph nodes are uniformly marked with their source and kept read-only.
- Agent preview, task reports, and related detail views uniformly use the shared Markdown rendering component.
- LLM model configuration uses card and drawer interactions, and the model list scrolls independently inside the drawer.
- Task pause no longer blocks main agent conversations: main agent orchestration sessions are independent of task pause, and new messages can still be sent while paused (pause only terminates the currently running round).
- The default wall-clock duration of a single Worker run changed from 600 to 1200 seconds.

### Fixed

- Removed optimistic echo from the main agent console in favor of pure server-side data rendering, fixing message disorder and content from other sessions mixing in under pause or send-failure scenarios.
- Opening a main agent session now scrolls to the bottom by default and fully shows the last reply: after the last reply's full content lazy-loads and expands, it auto-sticks to the bottom and is no longer pushed off screen.
- Fixed the main agent session continuing to run after the task was paused, and the orchestrating agent not synchronously stopping the main agent when pausing a task.
- Fixed the task status badge and action button states being out of sync while the task was done or the Planner, Worker, or main agent was actually running.
- Fixed late blackboard writes or leftover files that could occur between Worker cancellation, task deletion, and concurrent writes.
- Fixed broken Markdown preview, long-text overflow in delete confirmations, mobile width, and some misaligned task details buttons.
- Added named termination reasons to all agent cancellation paths; activity details can show the canceller, final state, round count, elapsed time, token usage, and unreturned tool calls.
- Fixed a race where the parent context could preemptively overwrite the named `shutdown` reason during backend shutdown, and garbled text caused by byte-wise truncation of Chinese activity summaries.
- Fixed cancellation events with partial streaming output losing the real termination reason, while preserving content generated before cancellation.

### Contributors

- [@Autumn-27](https://github.com/Autumn-27)
- [@neouks](https://github.com/neouks)

[Unreleased]: https://github.com/BaaRai/ARTEX/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/BaaRai/ARTEX/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/BaaRai/ARTEX/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/BaaRai/ARTEX/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/BaaRai/ARTEX/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/BaaRai/ARTEX/compare/v0.3.15...v0.4.0
[0.3.10]: https://github.com/Autumn-27/ARTEX/compare/v0.3.9...v0.3.10
[0.3.9]: https://github.com/Autumn-27/ARTEX/compare/v0.3.8...v0.3.9
[0.3.8]: https://github.com/Autumn-27/ARTEX/compare/v0.3.7...v0.3.8
[0.3.7]: https://github.com/Autumn-27/ARTEX/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/Autumn-27/ARTEX/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/Autumn-27/ARTEX/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/Autumn-27/ARTEX/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/Autumn-27/ARTEX/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/Autumn-27/ARTEX/compare/v0.3.1...v0.3.2
