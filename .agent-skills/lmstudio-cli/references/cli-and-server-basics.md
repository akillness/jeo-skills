# CLI and Server Basics for LM Studio

## What upstream documents clearly
- `lms` ships with LM Studio itself; if LM Studio is installed, start with `lms --help`.
- The CLI docs expose separate command families for local models, server control, daemon control, LM Link, runtime management, and publishing.
- `lms server status` is the first deterministic check for local server state, and `--json --quiet` gives machine-readable output.

Primary sources:
- https://lmstudio.ai/docs/cli
- https://lmstudio.ai/docs/cli/serve/server-status

## Minimal verification ladder
1. `command -v lms`
2. `lms --help`
3. `lms server status --json --quiet`
4. `lms ps --json` or `lms ls --llm`

If step 1 fails, stop pretending you have local CLI control and switch to remote endpoint verification only when the host is authorized.

## Why this matters
A lot of user confusion comes from mixing three separate questions:
- is the LM Studio app/CLI installed here?
- is the local server running?
- does another machine expose an endpoint I can call?

The skill should force those apart instead of treating them as one opaque "LM Studio is broken" problem.

## Useful commands
```bash
command -v lms
lms --help
lms server status
lms server status --json --quiet
lms ls --llm
lms ps --json
```

## Failure notes from upstream issue traffic
The upstream issue tracker still shows friction around server-mode onboarding and headless startup, so first-pass troubleshooting should stay boring and deterministic rather than jumping straight to downstream-client config:
- server-mode setup can feel overwhelming for new users — https://github.com/lmstudio-ai/lms/issues/196
- headless Linux startup can fail in ways that look like stale local state — https://github.com/lmstudio-ai/lms/issues/210
