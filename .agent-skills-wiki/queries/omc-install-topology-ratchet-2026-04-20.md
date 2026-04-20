---
title: OMC Install Topology Ratchet 2026-04-20
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, consolidation, trigger-design, skill-quality, docs]
sources: [.survey/omc-packet-ratchet-20260420/triage.md, .survey/omc-packet-ratchet-20260420/context.md, .survey/omc-packet-ratchet-20260420/solutions.md, .survey/omc-packet-ratchet-20260420/platform-map.md, .agent-skills/omc/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# OMC Install Topology Ratchet 2026-04-20

## Question
What is the best bounded next improvement for the repo's `omc` skill after the plugin-vs-CLI split is already explicit?

## Decision
Harden `omc` in place again instead of adding another orchestration wrapper. The durable next move is to make `omc` identify **install topology first** — marketplace plugin, shell CLI, local `--plugin-dir`, or mixed/unknown overlap — before it suggests runtime commands.

## Why this won
1. The fresh survey showed the biggest remaining operator pain is no longer abstract runtime naming; it is **topology confusion** caused by mixed plugin + CLI installs, local checkout / `--plugin-dir` workflows, and setup drift.
2. Upstream issues and docs show that marketplace install, npm CLI install, and local plugin-dir mode are all real, and users lose time when those are flattened into one generic setup story.
3. The repo graph still points to oversized/high-traffic runtime anchors as the best maintenance targets. `omc` stayed on that watchlist, while support coverage across the catalog is already complete.
4. Adjacent ownership is already clean: `jeo` for long-loop orchestration, `ralphmode` for permission posture, `omx` / `ohmg` for other runtimes, and browser-review skills for verification.

## Accepted changes
- Rewrite `omc/SKILL.md` so it identifies install topology before packet selection.
- Add `references/install-topology-and-recovery.md` and refocus `references/intake-packets-and-route-outs.md` around topology-aware packet routing.
- Expand `evals/evals.json` with a local `--plugin-dir` dry run and a mixed duplicate-install recovery case.
- Sync `SKILL.toon`, `skills.json`, `skills.toon`, `docs/omc/README.md`, README / README.ko, and `setup-all-skills-prompt.md` to reflect the topology-first trigger surface.

## Rejected changes
- Adding another Claude-first orchestration wrapper just to explain plugin-dir or duplicate-install behavior.
- Treating marketplace plugin, shell CLI, and local-checkout flows as equivalent setup paths.
- Re-expanding `omc` into a giant command encyclopedia or cross-platform orchestration manual.
- Pulling long-loop planning, approval posture, or non-Claude runtime ownership back into `omc`.

## Verification notes
- `validate_skill.sh` passed for `.agent-skills/omc` with 0 errors / 0 warnings.
- JSON validation passed for `.agent-skills/omc/evals/evals.json` and `.agent-skills/skills.json`.
- Catalog sync passed with `validate_catalog_sync.py --repo-root .`.
- Graph artifacts were **not** refreshed for this run because the change was a bounded contract ratchet on an existing anchor, not a structural catalog change.

## Related pages
- [[core-orchestration-platform-cluster]]
- [[omc-structural-hardening-2026-04-19]]
- [[jeo-structural-hardening-2026-04-20]]
- [[skill-support-coverage]]
