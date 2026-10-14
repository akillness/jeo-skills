---
name: jev-runtime-activation
description: Implementation, actual Codex activation, live provider evidence, and remaining integration boundaries.
last_updated: 2026-10-14
---

# Jev runtime activation

The 2026-10-14 user request authorized implementation, application, README updates
and push after the initial audit. The current host was selected as Codex while the
shared runtime also gained optional Claude/Pi-family assist behavior.

## Implemented behavior

- Named profiles accept `--runtime-mode advisory|assist` and
  `--review-mode off|advisory|enforce`; existing defaults remain advisory/off.
- Assist loads selected complete, catalog-listed `SKILL.md` files and source paths
  within the canonical trusted root. Escaped symlinks, unknown/missing paths and
  oversized files are excluded without partial instruction truncation.
- Codex `hooks-install` preserves unrelated groups/indices and idempotently merges
  synchronous UserPromptSubmit/PreToolUse definitions. It does not grant trust.
- Codex prompt hooks inject skill instructions. Action review can add advisory
  findings or explicitly deny unless the result is permit on a validated backend;
  it never emits a host allow decision or executes validation commands.
- Pi-family assist injects a Jev-owned custom message. Its context callback prunes
  only older Jev-owned messages; current instructions and all non-Jev history stay.
- Stream UTF-8 decoding, input/context bounds, private profile/session files and
  explicit-profile isolation cover malformed input, configuration and outages.

## Actual application

Canonical setup refreshed `~/.agents/jev/` from this source, preserving legacy
configuration and existing unrelated hooks. The installed harness now matches the
source; both accept and normalize the old 0.99 probability-sum reproduction.
Private rollback copies are under `~/.agents/jev-backups/20261014-*`.

The actual `codex` profile is ON, backend api, runtime assist, review advisory.
The generated two definitions were reviewed against the installed controller and
enrolled through Codex's config API using the exact hashes returned by hooks/list.
A fresh actual app-server reports both enabled and trusted, with existing groups
left in their original positions. Public operator guidance remains Codex `/hooks`.

Live TypeSafe routing selected `react-best-practices` through served model
`jev-1.13.0` from the 367-skill catalog. Tier remains unvalidated: transport success
does not establish probability calibration or autonomous authorization.

Two fresh actual Codex CLI 0.162.1 sessions, using its normal hooks and trust:

1. With tools forbidden, the model identified the injected installed
   `react-best-practices` instructions and exact source path.
2. With one permitted read-only `pwd`, the model received PreToolUse
   `proposal_only`/unvalidated review context, then executed the command once
   successfully. No model or host permission was switched.

Existing unrelated plugin-hook schema, duplicate inline/file hook and MCP warnings
were visible in these sessions; they did not prevent the demonstrated Jev flow
and were left unchanged.

## Verification and limits

Fresh targeted evidence includes Python Jev+installer 112 passed, Node
install/plugin/profile/runtime/lifecycle/Codex 117 passed plus one opt-in live skip, 20/20 mock self-test,
17 JavaScript syntax checks, catalog367, frontmatter367 and flat-layout checks.
Final exact Node count and publication status are recorded in the release report.
The standard link-enforcement gap remains unchanged.

Codex matching is limited to registered tools. Untrusted/skipped hooks, missing
executables and host timeout/process failure can fail open; host permissions
remain the final boundary. Codex does not expose a hook contract for arbitrary
history deletion or automatic coding-model switching. Claude injects instructions
but has no new automatic pruning/review gate. Pi-family extensions are verified
through callback/SDK tests; actual native model sessions were not exercised here.
No calibration, broad routing-quality benchmark or measured cost reduction is claimed.

Raw credential-free proof: `~/vaults/llm-wiki/raw/sources/audits/2026-10-14-jev-runtime-activation/`.
Operator commands: `../../jev/README.md`. Historical starting point:
`jev-readme-audit.md`.
