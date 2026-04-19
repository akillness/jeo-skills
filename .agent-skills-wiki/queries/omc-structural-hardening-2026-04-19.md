---
title: OMC Structural Hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, consolidation, trigger-design, skill-quality, docs]
sources: [.survey/omc-structural-hardening-20260419/triage.md, .survey/omc-structural-hardening-20260419/context.md, .survey/omc-structural-hardening-20260419/solutions.md, .survey/omc-structural-hardening-20260419/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# OMC Structural Hardening 2026-04-19

## Question
What is the best bounded next improvement for the repo's `omc` skill after the surrounding orchestration lane already clarified `jeo`, `ralph`, `ohmg`, `omx`, and `ralphmode` boundaries?

## Decision
Harden `omc` in place instead of adding another orchestration wrapper. The durable move is to make `omc` a **routing-first Claude-first runtime skill**: choose plugin setup, in-session runtime, terminal runtime, recovery/update, or boundary route-out first; make the plugin-vs-CLI split explicit (`/team` vs `omc team`); and push slower-changing operator detail into references.

## Why this won
1. The survey showed OMC has a persistent **two-surface problem**: plugin slash skills and the `omc` shell CLI are both real, but users routinely get confused when docs flatten them into one command family.
2. Upstream issues cluster around **setup duplication, plugin-dir confusion, worktree/state collisions, and brittle resume/HUD behavior**, not around a missing new wrapper category.
3. The repo graph still prefers **dense-anchor cleanup over more wrappers**, and `omc` remained one of the notable oversized front doors in the orchestration lane.
4. The surrounding cluster already has clean owners for adjacent jobs: `jeo` for long-loop orchestration, `ralphmode` for permissions, `plannotator` for review gates, browser-review skills for web verification, and `omx` / `ohmg` for other runtimes.

## Accepted changes
- Rewrite `omc/SKILL.md` around five intake packets: plugin setup, in-session runtime, terminal runtime, recovery/update, and boundary route-out.
- Add `references/intake-packets-and-route-outs.md` so the front door stays smaller while volatile operator detail still has a home.
- Refresh `SKILL.toon` and `evals/evals.json` for plugin-vs-CLI, recovery, and route-out cases.
- Update `docs/omc/README.md` so it stops using stale `/omc:*` examples and matches the current plugin/CLI split.
- Sync README / README.ko / setup prompt / manifest discovery wording to advertise OMC as a truthful runtime router instead of a giant command catalog.

## Rejected changes
- Adding another Claude-first orchestration wrapper just to explain plugin-vs-CLI differences.
- Pretending `/team` and `omc team` are interchangeable.
- Leaving stale `/omc:team` / `/omc:omc-setup` examples in the repo when upstream surfaces now distinguish `/team`, `setup omc`, `/oh-my-claudecode:omc-setup`, and `omc team`.
- Letting `omc` absorb `jeo`, `ralphmode`, browser-review, or non-Claude runtime ownership.

## Verification notes
- `omc/SKILL.md` was reduced from 272 to 264 lines while gaining a clearer packet-first trigger surface.
- Validation passed with `validate_skill.sh`, JSON checks, and `validate_catalog_sync.py`.
- Graph refresh confirms the new structural note: the stable contract is the plugin-vs-CLI routing split plus explicit route-outs, not a copied upstream command encyclopedia.

## Related pages
- [[core-orchestration-platform-cluster]]
- [[skill-support-coverage]]
- [[jeo-structural-hardening-2026-04-16]]
- [[survey-structural-hardening-2026-04-18]]
