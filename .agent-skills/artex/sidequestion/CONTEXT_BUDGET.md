# Side Conversations and Context Budget

2026-09-11 fix. The original implementation treated the request JSON's character count directly as tokens and inherited the main task's 32K output reservation, so snapshots with lots of HTML, JS, and tool results would reject normal side questions prematurely.

## Open-Source Implementation Review

- [Grok CLI side context](https://github.com/superagent-ai/grok-cli/blob/fb97af83f06dca873281d60168430f06c8de6324/src/agent/agent.ts#L739): excerpts fragments from recent user and assistant text, with a character budget of about 2000 and at most 400 characters per entry. It does not maintain a continuous side Q&A history on this path.
- [Grok CLI independent request](https://github.com/superagent-ai/grok-cli/blob/fb97af83f06dca873281d60168430f06c8de6324/src/utils/side-question.ts): independent cancellation signal; output capped at 2048 tokens when the model supports it; no tools provided.
- [Grok CLI main session compaction](https://github.com/superagent-ai/grok-cli/blob/fb97af83f06dca873281d60168430f06c8de6324/src/agent/compaction.ts): estimates tokens, keeps recent content, folds new content into the old summary, and handles cross-turn truncation.
- [OpenCode session compaction](https://github.com/anomalyco/opencode/blob/b3f1a96c6dd7adeb28b36dd11add1998fc84d67b/packages/core/src/session/compaction.ts): full-request estimation, output/buffer reservation, recent content plus rolling summary, tool-free summary requests; that implementation defaults to a recent budget of 8000 and a summary output cap of 4096 tokens.
- [OpenCode overflow recovery](https://github.com/anomalyco/opencode/blob/b3f1a96c6dd7adeb28b36dd11add1998fc84d67b/packages/core/src/session/runner/llm.ts): overflow recovery is attempted only when assistant output has not started; the recovered call does not re-enter the same overflow recovery path.

ARTEX borrows the independent output budget, recent content plus rolling summary, and bounded recovery. It keeps norma v0.3.6's structured messages and tool pairing, does not copy Grok's text excerpting, and does not write OpenCode's main-session compaction events into the ARTEX main transcript.

## Request Budget and Execution

- Messages use norma's per-content-block UTF-8 byte estimate with a 4/3 margin; system prompts, tool schemas, and message framing overhead are also counted. The estimate is not the model's exact token count.
- Side output defaults to at most 8192 tokens and never exceeds the output cap already set in the main configuration. The service environment variable `ARTEX_BTW_MAX_OUTPUT_TOKENS` can set a cap of 256–32768; it does not modify the product default model or main-task parameters.
- The input budget is the context window minus the output cap and a safety margin; unknown windows use the platform default of 200K. The safety margin is 5% of the window, with a minimum of 128 and a maximum of 8192 tokens.
- Successful Q&A exchanges load in ascending ordinal order, at most 20 per batch. At most 20 exchanges are kept verbatim, with a token budget of at most 1/4 of the input budget and no more than 16K.
- Overflow exchanges are folded into a rolling summary. The summary carries historical provenance and context time; historical assistant answers are not equivalent to new tool evidence, and the latest main snapshot takes precedence in case of conflict.
- When the main context is still too long, only the older messages in the copy are summarized, keeping at most 8K tokens of recent content; the cut point never splits a tool call from its result. An oversized single group enters the summary as a whole.
- Summary input is chunked UTF-8-safely according to the actual remaining window, with an output cap of 2048 tokens; empty summaries, truncation, tool calls, or exceeding the summary budget are never written to cache. A single side question makes at most 12 summary calls, under the same 120-second timeout; reaching the cap fails explicitly without looping forever.
- If the model first returns context overflow and has not yet output text or tool calls, retry at most once after further reduction; if the estimated size did not decrease, recovery stops immediately. Other model errors and partial streamed output do not trigger this recovery.
- All obtained usage, including summaries, failed attempts, and usage at cancellation, accumulates onto the same side request. When the provider returns no usage, only zero can be recorded; estimates must not be disguised as actual usage.

## Persistence and UI

`side_question_sessions.memory` stores the old Q&A summary, the covered ordinal, and the main-context summary cached by snapshot identity. `side_question_requests.context_info` stores the preparation phase, the actual number of replayed exchanges, summary usage, and budget estimates.

Summaries are saved only when the original request is still running and the cleanup generation matches; clearing also clears the cache, and late writes do not resurrect cleared data. A new snapshot does not reuse an old snapshot's summary. Summary fields are archived with v3 task archives; when restoring an old v3 archive missing the fields, empty objects are filled in; v1/v2 remain compatible.

POST accepts and returns the request first; preparation and compression run in the background without holding the admission lock or a database transaction. SSE/history show the preparing, organizing Q&A, compressing copy, and answering phases; a compression failure is saved as the failed terminal state of that side request. The frontend keeps the error and restores the draft of the failed question instead of covering the input box with a floating notification; history polling no longer wipes the submit error.

## Validation Record

- Replay of 19/20/21/50 exchanges, retention of pre-20-exchange old conclusions, summary-cache reuse across restart: automated tests pass.
- Overlong Chinese answers and code contexts, chunked request budgets, tool pairing, snapshot immutability, new-snapshot cache invalidation: automated tests pass.
- Summary failure/cancellation/truncation/oversize/tool return, clear race, call cap, single overflow recovery and no retry of partial streams: automated tests pass.
- Standalone PostgreSQL pagination, restart, v1/v2/v3 archives, summary cache and budget metadata archive restore, old v3 missing new fields, 20 parent sessions sharing four concurrency slots: pass.
- Go candidate service build, frontend TypeScript check, Biome check of modified components, and Next.js production build in a separate directory: pass.
- The built-in browser used standalone UI fixtures to verify at 1280×720 and 390×844 the organizing phase, summary scope notice, draft restore after failure, no floating error notifications, no horizontal overflow, and no console errors. Temporary fixtures were removed.
- Read-only replay of this machine's existing Worker snapshots passed the new budget checks; for example, Worker #3's 293085-character snapshot is no longer wrongly rejected by local character counting. This item made no external model calls.
- The real conversation test that would have sent private Worker snapshots to Grok this time was rejected by the auto-approval review, was not executed, and does not count as a pass.
- 2026-09-11 00:37: restarted the local backend at the user's request, keeping the original database, data directory, and login configuration. The running file and the candidate binary have identical SHA-256; `/api/health` returns OK from both the backend and the frontend proxy.

Validation commands (standalone test database only):

```sh
go test -race ./sidequestion ./db ./server -run 'TestSide|TestCheckpoint|TestSnapshot|TestBuildRequest|TestService|TestMainSide|TestTaskArchive' -count=1
go build ./cmd/artex
npx tsc --noEmit
npm run build -- --webpack
```

The frontend production build used a standalone copy to avoid overwriting the `.next` of the current preview. The candidate service is at `/private/tmp/artex-btw-budget-candidate`, copied to `/private/tmp/artex-btw-preview/artex` and started; the original binary is backed up as `artex.before-context-budget` in the same directory.
