# EGM source and operating boundaries

Source snapshot: [commit 67353fc4374383f69e61a6f375891e9797c82066](https://github.com/google/elephant-goldfish-model/tree/67353fc4374383f69e61a6f375891e9797c82066), especially [README](https://github.com/google/elephant-goldfish-model/blob/67353fc4374383f69e61a6f375891e9797c82066/README.md), [harnesses](https://github.com/google/elephant-goldfish-model/blob/67353fc4374383f69e61a6f375891e9797c82066/docs/harnesses.md), [review](https://github.com/google/elephant-goldfish-model/blob/67353fc4374383f69e61a6f375891e9797c82066/skills/egm-review/SKILL.md), and [test record](https://github.com/google/elephant-goldfish-model/blob/67353fc4374383f69e61a6f375891e9797c82066/TESTING.md). Recheck live documentation before installation; this is evidence, not a version pin enforced by the helper.

## Select the operation

| Upstream skill | Purpose |
| --- | --- |
| `egm-brainstorm` | Explore an idea and produce `concepts_brief.md`; fresh reviewers challenge it. |
| `egm-draft` | Turn a brief or notes into `design_draft.md`, with section feedback. |
| `egm-review` | Review a software design through initial zoom out, comprehension, design critique, intermediate zoom out and implementation readiness. |
| `egm-resolve` | Work through review findings and agree on changes. |
| `egm-review-loop` | Configure reviewers and standards for a review, including non-software documents. |
| `egm-bootstrap` | Create or update documentation for an existing codebase. |
| `egm-drift-report` | Compare checked-in documents with source; the human chooses which to update. |

Use any skill individually. The standard sequence is brainstorm → draft → review → human decision → implementation. Its design/draft workflow targets software specs; bootstrap and drift apply to codebases. Review requires the target file; the reading list is optional. A preset may select interactive stages, uninterrupted full flow, feature spec, implementation plan, or an individual stage. Consult the installed skill for the exact current contract. Upstream review writes reports, requests permission before including links outside the workspace or URLs, and leaves unapproved links out in headless execution. Stage 6 reads the document alone; other stages receive the approved context. Artifact location defaults to working directory or host artifact directory; upstream supports an `EGM artifact directory` setting and has outside-workspace confirmation rules.

## Harness and installation

Installation requires the **whole plugin**, not a copy of `skills/` alone: runtime also reads `agents/` and `resources/document_standards/`. Root `plugin.json` is canonical; host compatibility manifests and docs are part of the full package. Inspect the desired source and destination, permissions, scope, existing plugin and rollback before approval. These are upstream install instructions, not actions this skill performs automatically:

- Claude Code: `claude plugin marketplace add google/elephant-goldfish-model` then `claude plugin install egm@egm`.
- Codex CLI: `codex plugin marketplace add google/elephant-goldfish-model` then `codex plugin add egm@egm`.
- Antigravity CLI: `agy plugin install https://github.com/google/elephant-goldfish-model`.
- ChatGPT/Codex desktop: install the published desktop plugin linked in upstream README; ChatGPT workspace import uses `.agents/plugins` and may require an administrator. Claude Cowork and Antigravity App/IDE extension use their plugin interfaces. Standalone Antigravity IDE lacks the required fresh subagent tool in the reported tests.
- omp and Muse have distinct install procedures; use upstream harness guide and Muse guide instead of assuming CLI parity.

Restart the session as directed upstream and verify actual skill and delegation availability. Claude Code and agy CLI use `/egm:egm-review` style prefixes; Codex selects the EGM skill in its picker. omp uses `/skill:egm-<command>`; ChatGPT workspace imports use `@egm`. Do not guess unverified command forms.

Upstream reports automated install and end-to-end fixtures for Antigravity CLI, Claude Code and Codex; Cowork/ChatGPT Work have cloud trace gaps, omp has no automated end-to-end fixtures, and Muse has a reported 1.4.14 fixture with general-purpose persona fallback. These are upstream reports, not verification of the current environment. Inspect current host tool schemas and `docs/harnesses.md` for changes.

## Isolation and evidence

A fresh Goldfish receives its document, explicitly selected material and persona, not the earlier conversation. With no subagent tool, upstream stops rather than substituting same-context review. With no nested delegation, dispatch reviewers directly; with no registered named reviewer, use a fresh general-purpose subagent instructed to read its persona first. Do not imply this eliminates host instructions: upstream reports Codex and Antigravity instruction files present in reviewer context despite parent-turn isolation; Claude adapters set `omitClaudeMd: true`, a host-specific measure. Verify the actual host behavior separately.

Even a fresh reviewer can receive sensitive documents, linked sources and host instructions; provider and logging boundaries still apply. Report which context was supplied, excluded, or unverified, the exact artifacts and observed result, and whether human sign-off and testing remain outstanding. A preflight pass establishes only static package markers.
