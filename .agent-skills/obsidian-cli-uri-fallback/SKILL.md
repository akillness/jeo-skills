---
name: obsidian-cli-uri-fallback
description: >
  Use when Obsidian note automation runs in cron/headless environments and
  obsidian-cli emits URI failure signatures (for example, `Failed to execute
  Obsidian URI`) that may not set a non-zero exit code. Detect false-success
  cases, fallback to deterministic markdown file writes, and record traceable
  fallback paths in run artifacts.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for unattended automation where desktop Obsidian may be unavailable.
  Complements obsidian-cli by hardening failure detection and persistence.
license: MIT
metadata:
  tags: obsidian, cli, fallback, cron, headless, reliability, automation
  version: "1.0.0"
  source: akillness/jeo-skills
---

# obsidian-cli-uri-fallback

Use this skill when Obsidian CLI calls are part of unattended runs and you need reliable note persistence even if URI execution fails silently.

## When to use this skill
- Cron jobs or CI-like runs that attempt `obsidian-cli create/open/...`.
- Desktop app availability is uncertain (headless, remote, or locked session).
- CLI output includes explicit failure signatures while exit code is still zero.
- You need a deterministic fallback path to preserve audit notes.

## Instructions
1. Run the intended `obsidian-cli` command first.
2. Treat **either** non-zero exit **or** known failure-signature text as failure.
   - Minimum signature list:
     - `Failed to execute Obsidian URI`
     - `Cannot find note in vault`
3. On failure, write the note directly to markdown path (`<vault>/.../*.md`) using deterministic naming.
4. Record fallback status in run artifacts:
   - attempted command
   - observed signature
   - fallback file path
5. Continue the workflow without retry loops unless user explicitly requested retries.

## Examples
- `obsidian-cli create "queries/hourly-2026-04-27.md" -c "..."` prints `Failed to execute Obsidian URI` with exit code 0.
  - classify as failure
  - fallback: write `queries/hourly-2026-04-27.md` directly
  - record fallback path in survey/PR artifacts

## Best practices
1. Prefer ASCII-only automation payloads in unattended shells.
2. Keep fallback filenames stable and timestamped.
3. Never claim Obsidian CLI success when failure-signature text is present.
4. Keep fallback evidence alongside run artifacts for reviewer traceability.

## References
- `.agent-skills/obsidian-cli/SKILL.md`
- `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`
