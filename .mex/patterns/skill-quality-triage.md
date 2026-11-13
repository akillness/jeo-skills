---
name: skill-quality-triage
description: Interpret static quality-check findings before importing or rewriting third-party skill collections.
triggers:
  - quality-check
  - skill collection review
  - improve skill scores
edges:
  - target: ../context/decisions.md
    condition: when choosing an operator package versus upstream workflow imports
grounds_to: []
last_updated: 2026-11-13
---

# Static quality review without score chasing

## Context

Load `skill-standardization` and the named evaluator's guide. Read the primary
specification and pinned source, not just the aggregate score. The worked example
is [Donchitos Game Studios research](../../.agent-skills/donchitos-game-studios/references/research.md).

## Steps

1. Freeze source/evaluator pins, commands, thresholds and report/publication state.
2. Distinguish canonical workflows from aliases and project-bound dependencies.
3. Compare each rule with the specification: recommendations are not requirements.
4. Keep taxonomy only in skills.json; select one named-project operator when the
   upstream workflows rely on sibling hooks/configuration/scripts.
5. Reuse the existing selected-file helper contract; document its limits and test
   missing/mismatched files, unsafe traversal, malformed manifests and no execution.
6. Add trigger/near-miss/error cases, regenerate catalog projections and review
   README/setup scope. Separate authored cases from executed model evaluations.
7. Only claim behavioral improvement after fresh-context paired runs; preserve
   missing evidence and obtain provider/sandbox/publication approvals separately.

## Gotchas

- Short compatibility wrappers need forwarding/argument tests, not padded bodies.
- The pinned evaluator rejects reserved `claude` in names independently of score;
  a source-specific local name can preserve compatibility without disabling gates.
- JSON provenance in references and a 665-character targeted description can be
  valid by repository/spec rules while retaining evaluator warnings. Report them.
- A source match never proves Git HEAD or a complete dependency closure.

## Verify

Run focused unittest discovery, skill validation, catalog/projection checks,
frontmatter `--check`, layout `--dry-run`, a selected-source comparison and an
isolated-HOME local-source installation. Preserve unrelated checkout work by using
an isolated worktree. Do not turn a passing static lane into publication eligibility.

## Update scaffold

Record the actual package/evidence in ROUTER.md and decisions.md. Log material
rationale under the checkout logging policy; never invent code graph groundings
when the graph is stale or a new symbol is not indexed.
