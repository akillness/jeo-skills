# Context: lmstudio-cli modernization

## Workflow Context
`lmstudio-cli` sits in the repo's CLI / developer-workflow lane, but the current artifact is still a thin command catalog while nearby high-utility skills have already been upgraded into support-backed anchors. The real workflow is not just "run `lms`"; it is a repeated operator loop:

1. confirm whether `lms` exists locally or whether only a remote LM Studio server is available,
2. verify server health and discover currently available model IDs,
3. decide whether the OpenAI-compatible endpoints (`/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`) are sufficient or whether the native REST API is needed for model-management details,
4. load or inspect models safely,
5. hand the exact endpoint/model wiring to downstream tools that expect an OpenAI-style base URL.

Primary evidence:
- LM Studio docs: `lms` ships with LM Studio and exposes local-model, server, daemon, link, and runtime commands — https://lmstudio.ai/docs/cli
- `lms server status` documents both human-readable and JSON output (`lms server status --json --quiet`) — https://lmstudio.ai/docs/cli/serve/server-status
- OpenAI-compatible endpoint docs show `/v1/models`, `/v1/responses`, `/v1/chat/completions`, `/v1/embeddings`, and `/v1/completions` — https://lmstudio.ai/docs/developer/openai-compat
- LM Studio REST API docs position the native API as the model-management surface — https://lmstudio.ai/docs/developer/rest
- Structural repo evidence: `.agent-skills/lmstudio-cli/` currently lacked `references/`, `evals/`, and `scripts/` before this run, unlike most recently modernized high-utility skills.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| AI-tool operator | Point a local or LAN LM Studio instance at another CLI or agent tool | Intermediate |
| Developer using local inference | Verify server status, inspect models, and smoke-test a localhost endpoint | Beginner to intermediate |
| Security or automation operator | Route Strix or another OpenAI-compatible client at LM Studio without guessing model IDs | Intermediate |
| Headless / remote host user | Manage LM Studio on another machine and recover from server-state or context-loading surprises | Intermediate to advanced |

## Current Workarounds
1. Copy-paste a few `lms` commands from memory and hope the local daemon/server state matches expectations.
   - Limitation: weak when users are on a remote host, a headless machine, or only have HTTP access.
2. Treat LM Studio as "just another OpenAI endpoint" and stop after `/v1/models` works.
   - Limitation: misses native REST/API or CLI paths needed for load state, context length, and exact instance configuration.
3. Use downstream-tool docs (for example Strix/OpenAI-compatible client docs) as the de facto LM Studio setup guide.
   - Limitation: this blurs the boundary between LM Studio operations and downstream-tool provider configuration.
4. Compare against broader local-model runners like Ollama, llama.cpp server, or LocalAI when troubleshooting.
   - Limitation: useful for orientation, but it does not answer the LM Studio-specific CLI / endpoint / loading questions.

## Adjacent Problems
- Headless and remote-host operation is materially harder than a same-machine GUI flow; LM Studio users still ask for simpler server-mode onboarding and better headless ergonomics.
- Model loading is not just discovery; context-length and load-guardrail behavior can become the real blocker in automation.
- Local-vs-remote ambiguity encourages users to overfit to one environment and then fail when a downstream tool only sees an OpenAI-compatible base URL.
- Without route-outs, a skill like `lmstudio-cli` risks becoming a generic local-LLM wrapper and overlapping with unrelated provider, evaluation, or tool-specific skills.

## User Voices
> "LM Studio’s server mode is quite powerful, but its setup can be overwhelming for new users." — https://github.com/lmstudio-ai/lms/issues/196

> "Can't start lms server headless on linux, \"File has not been cleared\"" — https://github.com/lmstudio-ai/lms/issues/210

> "When loading a model in LMS, users must manually specify the context length using the `--context-length` flag... there is no direct way to specify that the model should be loaded with its maximum supported context length." — https://github.com/lmstudio-ai/lms/issues/118

> "Model load guardrail estimate seems wrong, and GUI 'Load anyway' has no CLI / REST equivalent" — https://github.com/lmstudio-ai/lms/issues/499
