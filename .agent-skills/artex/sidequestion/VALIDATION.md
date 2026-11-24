# `/btw` Validation Record

Date: 2026-09-10. Branch: `codex/btw-side-question`. Baseline: `8dae851b9b622f2ff2631f332fde9719d0b16fba`.

A standalone PostgreSQL test database and data directory were used; real model credentials were only injected into the standalone test environment, not written into code or this record, and the product default model was not modified. Go 1.26.3, norma v0.3.6, Next.js 16.2.9.

Real model conversations, returned objects, engineering assertions, and the raw Qwen review text are saved in [validation-2026-09-10.json](validation-2026-09-10.json), which contains no API credentials.

## Engineering Checks

| Area | Result | Evidence |
| --- | --- | --- |
| Structured messages, tool-argument deep copy | Pass | `TestCheckpointDeepCopyAndBoundaries` |
| Summary / compaction requests do not overwrite, complete replies and terminal states published, partial replies excluded | Pass | `TestCheckpointDeepCopyAndBoundaries`, `TestSnapshotExcludesPartialStreamAndSelectsPoolMember` |
| Actual model pool member identity | Pass | `TestSnapshotExcludesPartialStreamAndSelectsPoolMember` |
| Tool pairing, 20-exchange replay, budget trimming and overflow errors | Pass | `TestBuildRequestCompactionToolPairingAndBudget` |
| Main/side parallelism, bidirectional cancellation isolation | Pass | Blocking provider, `TestMainSideConcurrencyAndIndependentCancellation` |
| No tool execution, streaming / non-streaming, usage already present on failure | Pass | `TestServiceNoToolsAndUsageOnFailure` |
| Real norma ChatAgent + local Read tool, main transcript / activity isolation | Pass | `TestSideActualChatCheckpointToolResultAndTranscriptIsolation`, streaming and non-streaming subcases |
| Persistence, pagination, idempotency, partial answers kept across restart | Pass | `TestSideHistoryIdempotencyPagingAndRecovery` |
| Clear vs. late-writer race, parent resource deletion, version comparison | Pass | `TestSideClearLateWritersAndDeletedParent` |
| MainAgent / Worker archive and restore, v1/v2/v3 | Pass | `TestSideTaskArchiveVersions` |
| Three parent interfaces, authentication, resource ownership, Worker logical deletion | Pass | `TestSideHTTPGlobalLimitTaskWorkerAndDeletion`, `TestSideCheckpointPersistsBeforeAdmissionAndRestart` |
| Side questions work while main session busy, independent SSE reconnect / disconnect, cancel, clear | Pass | `TestSideHTTPBusyIsolationClearAndReconnect` |
| 1 concurrent per parent session / 4 global | Pass | Two `TestSideHTTP…` cases |
| Snapshot persisted before submission, resume questions after restart, old sessions cannot forge snapshots | Pass | `TestSideCheckpointPersistsBeforeAdmissionAndRestart` |
| Refusal to continue after the cached configuration is deleted or the model changes | Pass | `TestSideRejectsDeletedOrChangedCachedProfile` |
| Cancel before archive and wait for final answer and usage to persist | Pass | `TestSideTaskDrainPersistsBeforeArchive` |
| Usage recorded only once with side attribution when the streaming consumer cancels early | Pass | `TestSideUsageRecordedOnceOnConsumerCancellation` |
| Workers auto-restored after restart / deadline runtime contexts keep publishing new snapshots | Pass | `TestSideRestoredWorkerRuntimePublishesNewCheckpoint` |
| Race checks on related packages | Pass | Commands below |
| TypeScript and production build | Pass | `npx tsc --noEmit`, `npm run build` |
| Biome on new frontend modules | Pass | `biome check`, 3 new modules |

With `ARTEX_PG_DSN` configured against a separate disposable database, the automated checks can be reproduced (do not point it at a production database):

```sh
go test -race ./agent ./db ./server ./sidequestion ./llmrec ./llmpool \
  -run 'Test(Side|Checkpoint|Snapshot|BuildRequest|Service|MainSide|CaptureRun|TaskArchive|CompleteForwards|StopIntent|CancelIntent)' -count=1
cd web
npx tsc --noEmit
npx biome check src/lib/side-questions.ts src/hooks/use-side-questions.ts src/components/side-question-workspace.tsx
npm run build
```

The full Go regression is not all green: the `server` package has two pre-existing tests that fail during temp-directory cleanup, both reporting `TempDir RemoveAll … directory not empty`:

- `TestInheritedActivityDetailAndRelationDeletion`
- `TestTaskMetadataPatchReturnsRenameAndPin`

After exporting the source from the unmodified baseline above and rerunning the `server` package in the same isolated environment, these two cleanup failures reproduce as well. The baseline run additionally showed a target-node count assertion failure in `TestCoreTaskLifecyclePG`; the final modified `server` regression did not have that assertion failure. Other packages pass, and the side-question-related cases and race checks in this change pass. Baseline issues were not marked as accepted for this change, and existing assertions were not modified to hide issues.

The Next.js build printed the existing multiple-lockfile / workspace-root inference warnings; the build completed and all pages generated successfully.

## Browser Checks

Using Codex In-app Browser, connected to the standalone local Go service and the Next.js dev server. The following manual automation steps were completed on desktop and a 390 × 844 narrow screen, checking screenshots and browser logs:

- Typed `/btw` while a regular chat was running; main content and the side question displayed simultaneously; the desktop sidebar worked.
- Consecutive follow-ups; after stopping the side question, the generated part is kept; the main flow continues.
- The request continues while the panel is closed, and the completed answer is restored on reopen; after refreshing the page, an empty `/btw` restores history.
- The narrow-screen Drawer's input, buttons, history, and close actions work, with no horizontal overflow.
- Clear uses a confirmation dialog; after clearing, history disappears while the main transcript and snapshot are kept.
- The task MainAgent and two Workers each asked questions and were switched between; agent labels and histories did not cross-talk.
- A blocking local model fixture kept the Worker running; submitting `/btw` from the Worker's main input box, then stopping the side question, the Worker still showed live running with its own pause button, and the side question kept the partial answer.
- Browser error / warning logs were empty.

Controllable fixtures were used to precisely verify concurrency timing without depending on real model output speed. During debugging, two Worker runtime checks did not form a valid concurrency window (the task had ended / the answer ended early); after fixing the fixture they were redone and passed; those initial attempts are not counted as valid passes.

## Real Model Conversations

`grok-4.6` was probed first, via the OpenAI-compatible endpoint `http://127.0.0.1:12580/tingly/openai`. The probe returned HTTP 200 with model name `grok-4.6` and `READY`, taking 2.82 seconds. The first choice was available, so the Tingly `glm` or Zhipu `glm-5.3` fallback chains were not enabled; those two fallback services were not validated this time.

| Scenario | Actual result |
| --- | --- |
| Asked about assets, goals, and markers while the main session was running | Returned `redhaze.top`, homepage read and summarized goals, `BTW-REAL-0910`; the side question completed in 16.97 seconds |
| Asked for tool evidence after the main session finished reading the homepage | Correctly cited WebFetch 200, curl redirects 301 → 302 → 200, and the page title; 7.24 seconds |
| Side question asked to create a test file via Bash | Refused to execute; the target file was not created; 7.74 seconds |
| Side question after completion does not change the main context | Main transcript SHA-256 consistent with the main activity record; side question tool execution count is 0 |
| Follow-up question after a real stop / restart of the Go service | Kept the previous 3 side history entries, answered assets, markers, and title directly from the persisted snapshot, without rerunning the main agent |
| New session using the Grok non-streaming configuration | Correctly answered assets and `ATOMIC-0910`; usage returned and saved: input 11734, output 138, cache_read 11520 |

The asset case's main session used WebFetch and Bash/curl to read the public homepage; the landing page was `https://id.redhaze.top/home`, whose Chinese page title translates to "RedHaze Technology RedHaze Group · Global Integrated Group Portal". Bash staged the response in a local test file; no writes were executed against the remote end. This fact was verified separately from "the side question did not execute tools".

Main transcript checksum: `e7e61f135a4a120954b539f357e8c4205d7d5cd7460dcaf3dc0fd066463e1d00`.

**Usage limitation:** Tingly's Grok streaming responses did not return usage. A separate direct request with `stream_options.include_usage=true` verified: HTTP 200, 12 data frames, 0 usage frames. Therefore the 0 in streaming tests means the endpoint did not provide usage and must not be interpreted as no billing. Non-streaming usage and the fixture's failure / cancellation usage were all saved correctly.

## Qwen Review

Review model `qwen-flash`, OpenAI-compatible endpoint `https://dashscope.aliyuncs.com/compatible-mode/v1`, HTTP 200. It was given the first three real side conversations, the main session's tool evidence, and the engineering assertions; it returned `verdict: accept`, `concerns: []`, judging the answers consistent with the asset, marker, and page-read evidence, and the side question's tool refusal compliant with the constraints. Review usage: prompt 6625, completion 312, total 6937.

This Qwen review did not cover the service restart and non-streaming tests appended later. Qwen's "no writes" generalization was too broad: the main session's curl did create a local response temp file, as explicitly recorded above. Concurrency, zero tool execution, and transcript isolation are judged by engineering assertions; the model review only assists in evaluating answer quality.
