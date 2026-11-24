# LLM Context Size Telemetry (P3.5 Phase A)

Size-only per-call telemetry runs for every `llmrec` `Stream` and `Complete` call. It is **on by default**; `ARTEX_CONTEXT_TELEMETRY=0|false|off|no` disables it explicitly, and then no request sizing runs and no rows are written to PostgreSQL.

This phase measures context composition without changing any prompt, compaction policy, or model behavior, so Phases B (`ARTEX_BOUNDED_CONTEXT`) and C (`ARTEX_CACHE_PREFIX` / `ARTEX_COMPACTION_MEMO`) can be evaluated against real numbers first.

---

## Configuration

| Environment variable | Values | Default |
|---|---|---|
| `ARTEX_CONTEXT_TELEMETRY` | `0`, `false`, `off`, `no` disable it (case-insensitive); anything else, or unset, keeps it on | on |

Telemetry runs independently of `llm_record` (`recordBodies`): it stays on even when full request/response body recording is disabled, and stores **no prompt, tool, or message content** — only byte lengths, counts, token usage, and metadata.

### Stopping, retention, and write cost

While telemetry is on (the default), each LLM call incurs one lightweight `INSERT` into `llm_context` (~200 bytes/row plus index entries, no bodies), so the table grows by one row per completion call. Set `ARTEX_CONTEXT_TELEMETRY=0` (and restart) once the measurement campaign is finished to stop all writes and sizing work, or purge old rows periodically:

```sql
DELETE FROM llm_context WHERE ts < now() - interval '30 days';
```

---

## Measurement Semantics (`llmrec.MeasureContext`)

Every enabled `Stream` and `Complete` call measures the assembled `llm.CompletionRequest` right before it is handed to the inner provider, and persists one row to `llm_context` (migration `0009_llm_context.sql`) on completion or error:

- **`system_static_bytes` & `system_dynamic_bytes`**:
  - `norma`'s `CompletionRequest.System` is a slice of segments that `llm.joinSystem` trims (`strings.TrimSpace`), drops when empty, and joins with blank lines (`"\n\n"`). `MeasureContext` applies the exact same trim, drop-empty, and `"\n\n"` join rules per slice.
  - When `DynamicBoundary > 0`, `System` is split at `b = min(DynamicBoundary, len(System))`: `System[:b]` is measured into `system_static_bytes` and `System[b:]` into `system_dynamic_bytes`.
  - When `DynamicBoundary <= 0`, there is no provider-visible cache split, so the entire `System` slice is measured as one block in `system_static_bytes` and `system_dynamic_bytes` is `0`.
  - **Why this choice**: `agent/deferred.go` returns `boundary = 0` when no global deferred-MCP block exists and `boundary = len(system)` when one does. Placing the single unsplit block in `system_static_bytes` ensures `system_static_bytes + system_dynamic_bytes` always equals total system bytes and `system_dynamic_bytes > 0` strictly signals a dynamic suffix placed after a cache breakpoint.
- **`tool_count` & `tools_bytes`**: `len(req.Tools)` and `len(json.Marshal(req.Tools))` (`0` when no tools). Go's `encoding/json` sorts map keys deterministically.
- **`message_count`, `messages_user_bytes`, `messages_assistant_bytes`, `messages_other_bytes`, `last_message_bytes`**: each `llm.Message` is measured by `len(json.Marshal(msg))` and accumulated by role (`user`, `assistant`, or other); `last_message_bytes` is the serialized byte size of the final message.
- **`tool_result_bytes`**: serialized byte length of `tool_result` content blocks inside messages. Reported as an **informational subset** of `messages_user_bytes` (not added to the partition denominator, avoiding double counting).

### Pro-rata token attribution

Rather than shipping per-provider tokenizers, each section's share of real `input_tokens` is computed per call by byte proportion:

```text
total_bytes(call) = system_static_bytes + system_dynamic_bytes + tools_bytes
                  + messages_user_bytes + messages_assistant_bytes + messages_other_bytes

share(section) = SUM(input_tokens * (section_bytes / total_bytes))
               / SUM(input_tokens)          -- over calls with total_bytes > 0 and input_tokens > 0
```

The six partition shares sum to `1.0`. `cache_read_ratio = SUM(cache_read) / NULLIF(SUM(input_tokens), 0)` (in ARTEX/Norma, `input_tokens` already includes cached tokens).

---

## Querying & Aggregation

### HTTP endpoint (admin JWT required, no UI in Phase A)

```text
GET /api/llm/context/summary?days=30&top=20&task=<optional-task-id>
```

Returns `enabled`, `by_worker_model` (calls, totals, `cache_read_ratio`, `input_p50`/`p90`/`p99`/`max`, avg tool/message/last-message size, and pro-rata `shares`), and `top_tasks` ordered by total `input_tokens`.

### Standalone SQL query (`psql`)

```sql
WITH base AS (
    SELECT *,
           (system_static_bytes + system_dynamic_bytes + tools_bytes
            + messages_user_bytes + messages_assistant_bytes + messages_other_bytes) AS total_bytes
    FROM llm_context
    WHERE ts >= now() - interval '30 days'
)
SELECT COALESCE(NULLIF(worker,''), '(unknown)') AS worker,
       COALESCE(NULLIF(model,''), '(unknown)')  AS model,
       COUNT(*)                                  AS calls,
       SUM(input_tokens)                         AS input_tokens,
       ROUND((SUM(cache_read)::numeric / NULLIF(SUM(input_tokens), 0))::numeric, 3) AS cache_read_ratio,
       PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY input_tokens) AS p50_input,
       PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY input_tokens) AS p90_input,
       PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY input_tokens) AS p99_input,
       ROUND((SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens * (system_static_bytes::double precision / total_bytes) ELSE 0 END)
             / NULLIF(SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0))::numeric, 3) AS share_sys_static,
       ROUND((SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens * (system_dynamic_bytes::double precision / total_bytes) ELSE 0 END)
             / NULLIF(SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0))::numeric, 3) AS share_sys_dynamic,
       ROUND((SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens * (tools_bytes::double precision / total_bytes) ELSE 0 END)
             / NULLIF(SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0))::numeric, 3) AS share_tools,
       ROUND((SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens * (messages_user_bytes::double precision / total_bytes) ELSE 0 END)
             / NULLIF(SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0))::numeric, 3) AS share_user,
       ROUND((SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens * (tool_result_bytes::double precision / total_bytes) ELSE 0 END)
             / NULLIF(SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0))::numeric, 3) AS share_tool_result_subset,
       ROUND((SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens * (messages_assistant_bytes::double precision / total_bytes) ELSE 0 END)
             / NULLIF(SUM(CASE WHEN total_bytes > 0 AND input_tokens > 0 THEN input_tokens::double precision ELSE 0 END), 0))::numeric, 3) AS share_assistant
FROM base
GROUP BY 1, 2
ORDER BY input_tokens DESC;
```

---

## Phase A Baseline Report & Recommendation on Phases B and C

> **Measurement scope note**: No live production LLM run was executed in this local verification environment. The figures below come from the reproducible representative fixture in `db/llm_context_test.go` (`TestLLMContextRepresentativeFixtureReport`), parameterized from ARTEX's actual `plannerSystem` (~12.5 KiB), `workerSystem` (~11 KiB), tool schema sets (14–16 tools, ~9–10.5 KiB), 5 planner rounds (2 turns each), and 2 worker intents (10 turns each with 3.5–8.5 KiB Bash/tool outputs), combined with a static audit of `agent/planner.go`, `agent/worker.go`, `agent/prompt.go`, and `agent/deferred.go`. Operators should capture 3–5 real tasks with `ARTEX_CONTEXT_TELEMETRY=1` before flipping Phases B or C on by default.

### Representative Fixture Breakdown

| Lane / Model | Calls | Total Input | p50 / p90 / Max | Cache Read Ratio | `sys_static` | `sys_dynamic` | `tools` | `user` (`tool_result` subset) | `assistant` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `worker` / `claude-sonnet-4` | 20 | 299,000 | 15,075 / 21,535 / 22,525 | 84.9% | 18.4% | 0.0% | 17.6% | 57.3% (`46.4%`) | 6.8% |
| `planner` / `claude-sonnet-4` | 10 | 79,060 | 7,906 / 8,971 / 9,387 | 48.5% | 39.5% | 0.0% | 29.1% | 29.2% (`0.7%`) | 2.2% |

### Explicit Recommendations

#### Phase B — Bounded Context (`ARTEX_BOUNDED_CONTEXT`)
- **Recommendation: Proceed (opt-in first), highest ROI on deep `worker` runs.**
- **Expected gain**: In the representative worker trajectory, `messages_user` accounts for **57.3%** of total input tokens, with **`tool_result` outputs alone representing 46.4%** (and growing quadratically across turns on long Bash/scanner sessions). Bounding/compacting old tool outputs on workers (keeping recent turns verbatim and summarizing/truncating stale `tool_result` payloads) targets the largest single token sink (realistic 25–45% input-token reduction on 10–30 turn workers, and lower p90/p99 latency).
- **Risk**: Aggressive trimming of earlier tool outputs can drop credentials, endpoints, or exact error lines needed for exploit chaining or evidence binding, and mutating earlier messages inside a live multi-turn session **invalidates the prompt cache prefix** (turning cheap `cache_read` turns into uncached re-prefills if triggered too frequently). Bound only at explicit compaction boundaries or spill large `tool_result` bodies at insertion time before they enter the cached prefix.

#### Phase C — Cache Prefix Stabilization (`ARTEX_CACHE_PREFIX` / `ARTEX_COMPACTION_MEMO`)
- **Recommendation: Proceed with a surgical `worker` prefix split (`ARTEX_CACHE_PREFIX`); verify `planner` cross-round cache behavior and `ARTEX_COMPACTION_MEMO` with live `ARTEX_CONTEXT_TELEMETRY=1` data before changing them.**
- **Actual system-prompt volatility by lane (built-in prompts)**:

  `system_dynamic` is **0.0%** across all lanes today because `agent/deferred.go` sets `DynamicBoundary = 0` (no global deferred MCP) or `len(system)` (everything before the boundary). Auditing the built-in templates and assembly in `agent/worker.go` and `agent/planner.go` shows what actually varies:

  | Lane | Stable per task | Volatile per intent / round |
  |---|---|---|
  | `worker` | Base `workerDefaultTmpl` (`ProxyAddr`, `DataDir`), `untrustedContentTail`, `workerTrafficBlock`, `noiseProfileBlock`, `frameLessonsBlock` (task-level), `constraintBlock` (task-level, stable unless operator edits constraints), `def.FindingGuidance`, `<available-deferred-tools>` | `workerArtifactSpec(runDir)` (`tasks/<id>/i<intentID>`), `renderIntentTask(intent)`, intent target-assets JSON block, closing launch instruction |
  | `planner` | `plannerSystem` (`goal`, `dataDir`, `workDir`/`taskDir`, `untrustedDataRules`, `artifactSpec(taskDir)`, `noiseProfileBlock`), `frameLessonsBlock`, `def.FindingGuidance`, `<available-deferred-tools>` | `constraintBlock(ts)` is recomputed each round (stable unless operator changes constraints; situational graph overview already lives in the user turn) |
  | Custom prompts only | — | `{{.Now}}` (`agent/prompt.go:46`, 1-second resolution). Built-in templates do **not** reference `{{.Now}}` (Go's `text/template` ignores the unused `Now` field); it only affects operator-customized prompts that explicitly use `{{.Now}}`. |

- **Expected gain**:
  - **`worker` turn-1 cache reuse (real, code-backed)**: Today `workerArtifactSpec(runDir)` is concatenated into the single `sysBody` before `noiseProfileBlock`, lessons, constraints, `renderIntentTask(intent)`, and the target-assets block, so every sibling worker spawn busts the prompt cache from `runDir` onward. The minimal `ARTEX_CACHE_PREFIX=1` split shipped in Phase C places the prefix before `workerArtifactSpec(runDir)` (`body` + `untrustedContentTail` + `workerTrafficBlock`) **before** `DynamicBoundary = 1` (`system_static`) and leaves everything from `workerArtifactSpec(runDir)` onward (`workerArtifactSpec(runDir)` + `noiseProfileBlock` + lessons + constraints + `renderIntentTask(intent)` + target assets JSON + closing launch line + `def.FindingGuidance` + `<available-deferred-tools>`) **after** `DynamicBoundary = 1` (`system_dynamic`) in its exact original order. This keeps the visible joined prompt byte-identical and keeps the intent protected from compaction inside `System` while allowing sibling workers in the same task to share the cached `system_static + tools` prefix on turn 1 (in the fixture, `system + tools` is 36.0% of aggregate worker input and ~76.8% of turn-1 input, 21.5 KiB / 28.0 KiB, though the fixture does not isolate the per-intent suffix; measure the exact shareable prefix live). Moving the remaining task-stable blocks (`noiseProfileBlock`, lessons, constraints, `def.FindingGuidance`, `<available-deferred-tools>`) before the boundary would require reordering sections relative to `workerArtifactSpec(runDir)` and is left as a potential future optimization outside this PR.
  - **`planner` cross-round cache ratio (unverified hypothesis)**: The fixture above assumed a turn-1 cache miss on every planner round (yielding 48.5%), which is **not** demonstrated by the built-in code because `plannerSystem` is stable per task. Real cross-round misses could still happen from provider cache TTL expiry between rounds, constraint edits, or tool-RAG tool-list churn — treat any planner cache gain as a hypothesis to measure with `ARTEX_CONTEXT_TELEMETRY=1` on real tasks rather than a proven savings.
- **Risk**: Low for the `worker` `ARTEX_CACHE_PREFIX` split (pure boundary split using `norma`'s existing `DynamicBoundary` contract, with zero text reordering; custom prompts using `{{.Now}}` stay an explicit edge case). Medium for `ARTEX_COMPACTION_MEMO` (injecting compaction memos alters model reasoning continuity and only pays off on tasks that repeatedly trigger compaction — verify with live `ARTEX_CONTEXT_TELEMETRY=1` data first).

---

## Phase C: Worker Cache Prefix Split (`ARTEX_CACHE_PREFIX=1`)

`ARTEX_CACHE_PREFIX=1` (accepts `1`, `true`, `on`, `yes`, case-insensitive; **off by default**) enables a minimal, zero-reordering system-prompt split for the **`worker`** lane only so sibling workers in the same task share a cacheable static prefix without changing the text visible to the model:

- **Static segment (`System[0]`, before `DynamicBoundary = 1`)**: `body + untrustedContentTail + workerTrafficBlock`.
- **Dynamic segment (`System[1]`, after `DynamicBoundary = 1`)**: `workerArtifactSpec(runDir) + noiseProfileBlock + lessons + constraints + renderIntentTask(intent) + target assets + launch instruction + FindingGuidance + <available-deferred-tools>` (in exact original order). The leading `"\n\n"` from `workerArtifactSpec` is absorbed because providers join segments with `"\n\n"`, keeping `strings.Join(System, "\n\n")` byte-identical to the legacy unsplit prompt.
- **Unchanged**: When `ARTEX_CACHE_PREFIX` is unset/false, worker segments and `DynamicBoundary` are byte-identical to the legacy layout. `planner`, `mainagent`, `chat`, and `goals` are completely unchanged regardless of the flag.
- **Custom prompts caveat**: The split covers only the built-in suffix starting at `workerArtifactSpec(runDir)`. If an operator customizes the `worker` prompt in the database to include `{{.Now}}` (1-second resolution), that timestamp remains inside `System[0]` and will keep the static prefix volatile across spawns.
- **Measuring live impact**: Enable both `ARTEX_CONTEXT_TELEMETRY=1` and `ARTEX_CACHE_PREFIX=1` on real tasks and compare `system_static` / `system_dynamic` shares and `cache_read_ratio` via `GET /api/llm/context/summary`.
