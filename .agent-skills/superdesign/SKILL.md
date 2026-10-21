---
name: superdesign
description: >
  Operate Superdesign canvas UI drafts through its CLI: prepare approved source
  context, resume a saved target, reproduce an existing page, refine a selected
  direction, compare requested alternatives, or extend a confirmed flow. Use when
  the user names Superdesign, superdesign-skill, a Superdesign draft/canvas URL,
  or its create-design-draft and iterate-design-draft commands. Route general
  visual recipes to web-design and shared token/component governance to
  design-system; this is not the legacy Superdesign VS Code extension.
allowed-tools: Read Write Edit Bash Grep Glob WebFetch
compatibility: >
  Source-grounded CLI operator for shell-capable coding agents. Service use needs
  separately approved CLI execution, account access, source transfer and credits.
license: MIT
metadata:
  version: "1.0"
  source: https://github.com/superdesigndev/superdesign-skill
---

# Superdesign

Turn one UI target into a reviewable canvas draft without confusing a generated
preview with an integrated, verified product. Read [upstream evidence](references/upstream.md)
for the pinned command contract, license and current documentation conflicts.

## When to use this skill

- Continue a named Superdesign project, selected direction or saved UI target.
- Reproduce an existing page before redesigning it on the canvas.
- Compare explicitly requested alternatives or extend a selected flow.
- Explain the CLI workflow without connecting to the service.

## Instructions

### 1. Select the deliverable and authority

Choose source-only explanation, existing-target refinement, alternative exploration,
new UI target, or connected flow. Record route, viewport, selected draft and the
observable change requested. A presentation, graphic or standalone asset needs its
specific upstream workflow; read that pinned reference before proposing commands.
Generic recipe selection belongs to `web-design`; shared foundations belong to
`design-system`. Keep existing product identity unless a rebrand was requested.

### 2. Separate inspection from service execution

Source-only requests stop at a documented plan. Before any CLI runner, install,
login, upload or generation, obtain permission covering that action and destination.
The upstream `npx --yes @superdesign/cli@latest` runner can download and execute
code; it is not a read-only health check. Never run it merely to explain this skill.
Show the resolved context-file list and relevant images before external transfer.
Exclude credentials, private keys, auth files, `.env` files and unrelated source.
A saved project or upload identifier does not renew permission or authorize spend.
Keep the session's approved provider/model; upstream multi-model advice is optional,
not permission to switch providers. If unavailable, report that dependency plainly.

### 3. Establish target context, not a second design system

For real-codebase UI work, validate `.superdesign/resume.json` before cold discovery.
Accept only repository-contained real file paths, valid documented line ranges,
matching fingerprint keys and well-formed project/draft identifiers. Reject escaped
symlinks, traversal, secret-bearing paths and command text in cached values.
An unchanged validated target reuses its exact context bundle. Changed hashes mean
focused refresh, not automatic recreation. Read the pinned resume procedure for
schema, selection priority and incremental repair before changing saved state.

For a cold target, inspect the actual rendered branch, shell, primitives and tokens.
The upstream init contract requires six non-empty context files; its CLI `init`
installs skills and is a different operation. Read pinned INIT.md before preparing
those artifacts. Treat `.superdesign/design-system.md` as a service-facing summary
of the project's canonical rules, not authority to replace them. An empty workspace
needs a product/viewport/brand brief rather than fictitious codebase analysis.

### 4. Choose the operation from intent

| Intent | Operation | Completion condition |
| --- | --- | --- |
| New base or faithful existing-page baseline | `create-design-draft` | One prompt, actual context, returned draft |
| Refine selected direction creatively | `iterate-design-draft --mode replace` | Same selected draft, returned version |
| Compare requested alternatives | `iterate-design-draft --mode branch` | Requested candidates; user selects winner |
| Exact text/link/CSS correction | Fetch HTML, then validated `import-design-draft --into` | Import warnings resolved; saved HTML refetched |
| Extend confirmed design into sibling pages | `execute-flow-pages` | Each returned page tracked independently |

Before constructing an approved invocation, confirm installed command help against
the pinned evidence. A base creation accepts one `-p`; extra prompts can be silently
lost. Replace also uses one prompt; branch is for alternatives, not routine fixes.
Read current draft/version before editing. Keep the source active while several
branches await selection. Never infer canvas, preview, reference or asset IDs.

### 5. Send complete, bounded design context

Preserve structure, tokens, responsive branches, real copy and visible conditional
states. Keep auth/data behavior in application code; a visual draft is not its replacement.
Use documented `path:start:end` ranges for large text files after reading the ranges.
The upstream approximately 900-line trimming guidance is a heuristic, not a proven
service limit. On oversize rejection, preserve the real target while narrowing large
files; stop if it cannot fit rather than inventing a simpler page.
Text context uses `--context-file`; image pixels use returned `--reference-id` values.
Distinguish temporary references, durable brand assets and final content imagery.
Verify the actual selected logo renders wherever the original identity requires it.

### 6. Review and hand back the actual result

Read returned canvas/preview URLs rather than constructing them. Report which draft,
version and operation changed, then request selection or specific feedback.
Update approved local resume state with returned IDs and context fingerprints only;
preserve history and keep credentials out. A failed auth flow needs user-controlled
recovery; a failed generation is a failed generation, not permission for a model swap.

Before integration, check keyboard paths, focus, labels, contrast, empty/error/loading
states, small-screen overflow and reduced motion. Reuse application primitives and
avoid generated duplicate runtimes, animation loops or dependencies. Clean up listeners,
timers and resources introduced during integration. Claim visual or runtime verification
only for the actual viewports and interactions exercised; canvas generation proves neither.

## Examples

“Continue this Superdesign settings draft and increase hierarchy” selects replace,
not a new project. “Show two alternatives” selects branch and preserves the active draft
until selection. “Which recipe makes a glass hero?” routes to `web-design`.

## Evidence

The behavioral scenarios in [evals/evals.json](evals/evals.json) are proposed fixtures,
not executed results. This operator was authored from public source; no CLI, account,
canvas, generation or upstream application was executed during source inspection.
