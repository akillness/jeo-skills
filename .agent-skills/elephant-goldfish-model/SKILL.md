---
name: elephant-goldfish-model
description: >
  Operate google/elephant-goldfish-model (EGM), the design-with-an-elephant and fresh-context Goldfish review plugin. Use when the user names EGM, its brainstorm, draft, review, resolve, review-loop, bootstrap or drift-report skills, or asks about its harness support, whole-plugin installation, reviewer isolation or workflow. Distinguish actual fresh subagents from same-context critique and preserve human approval and installation boundaries.
---

# Elephant-Goldfish Model

## When to use this skill

Use for the specific upstream EGM plugin, not generic multi-agent review. Elephant develops an idea with project and conversation context; Goldfish reviewers independently inspect a document and selected source material without the earlier conversation. The human decides trade-offs and approves the design. EGM is Apache-2.0 and is not an officially supported Google product.

## Instructions

1. **Select one job:** fit/support check, offline checkout preflight, install planning, design workflow, existing-document review, drift/bootstrap, or troubleshooting. For command spelling, host limits, and the seven upstream skills, read [the upstream reference](references/upstream.md). Verify the current upstream version before relying on version-sensitive claims.
2. **Establish the boundary.** Inspect the actual session for fresh subagent capability; product name alone proves nothing. If fresh delegation is unavailable, stop EGM brainstorming/review rather than calling same-context critique a Goldfish review. Directly dispatch individual personas if nesting is unavailable; if named personas are unavailable, a general-purpose fresh subagent reads the relevant upstream `agents/` persona. Parent-turn isolation does not prove host instruction files are excluded.
3. **Check the complete plugin.** With an explicitly provided checkout, run `python3 <installed-skill-root>/scripts/preflight.py --checkout /path/to/checkout --json`, replacing `<installed-skill-root>` with the directory containing this `SKILL.md`. The helper only checks static paths inside that checkout; it does not execute upstream code, inspect credentials, verify provenance, or prove installation or reviewer isolation. A missing marker is a blocker for that checkout, not proof about installed plugins elsewhere. Do not install only `skills/`: reviewers and document standards are runtime dependencies.
4. **Gate effects separately.** Obtain approval before downloading or installing, changing plugin/global configuration, accessing private project content or transmitting it to a model provider, incurring provider cost, or writing artifacts. Establish target document, context files, output directory and review preset first. Upstream review may create reports and asks before including external links or paths; preserve those decisions. Never treat a report as approval to alter source or documents.
5. **Execute only the requested mode** using the installed upstream skill and its current instructions. For design review, collect the target, optional reading list and preset, and respect the stage gates. For arbitrary documents use `egm-review-loop` with suitable reviewers and standards. Tell the user where outputs were written, what was actually exercised, and any unverified isolation or harness support. Review is not testing or human judgment.

## Examples

- “Can EGM review this specification in my Codex session?” Check current delegation and package availability, explain isolation limits, obtain approval for document/model access and report writes, then invoke the installed review skill with the chosen target and preset.
- “I have an EGM checkout; is its plugin bundle present?” Run the read-only preflight above and report missing markers without installing or executing it.
- “Review my PR generally.” Use the normal code-review workflow unless the user specifically wants EGM's document review.

## References

- [Source, workflows, harnesses and install boundaries](references/upstream.md)
- [Upstream repository at the inspected revision](https://github.com/google/elephant-goldfish-model/tree/67353fc4374383f69e61a6f375891e9797c82066)
