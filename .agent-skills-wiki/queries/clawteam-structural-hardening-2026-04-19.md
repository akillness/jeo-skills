---
title: clawteam structural hardening
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, consolidation, trigger-design, skill-quality, survey]
sources: [.survey/clawteam-structural-hardening-20260419/triage.md, .survey/clawteam-structural-hardening-20260419/context.md, .survey/clawteam-structural-hardening-20260419/solutions.md, .survey/clawteam-structural-hardening-20260419/platform-map.md, .survey/clawteam-structural-hardening-20260419/loop-charter.md, graphify-out/GRAPH_REPORT.md, .agent-skills/clawteam/SKILL.md, .agent-skills/clawteam/references/operator-modes-and-route-outs.md, .agent-skills/clawteam/references/architecture.md, .agent-skills/clawteam/references/agent-types.md, .agent-skills/clawteam/references/use-cases.md]
---

# clawteam structural hardening

## Question
What is the best bounded next improvement for `clawteam` now that the repo support coverage is complete but the local skill and references still behave like a broad feature tour and lag parts of the upstream CLI?

## Answer
Harden `clawteam` in place instead of adding another swarm/orchestration wrapper. The durable move is to make the ClawTeam-specific operator modes explicit — manual team control, template launch, monitoring/recovery, and provider/runtime profile setup — while pushing slower-changing command families into support references and preserving honest route-outs to `jeo`, `omc`, `omx`, `ohmg`, `vibe-kanban`, and lightweight built-in delegation.

## Why this won
- `graphify-out/GRAPH_REPORT.md` still listed `clawteam` as the largest front-door skill in the repo even after many other dense anchors were shrunk.
- Upstream primary-source retrieval showed the current ClawTeam surface now emphasizes `team spawn-team`, `launch`, `board attach/serve`, `task create/update`, `inbox send`, and `profile` / `preset` workflows more clearly than the local skill did.
- Upstream issues also exposed durable caveats worth preserving in the skill boundary: long-running worker keepalive failures (#148) and incomplete application of parsed agent definitions/configs (#146).
- The developer-workflow lane already has enough adjacent orchestration surfaces; the right fix was a clearer `clawteam` front door, not another multi-agent wrapper.

## Accepted changes
- Rewrite `clawteam/SKILL.md` as a routing-first operator skill with four explicit modes.
- Add `references/operator-modes-and-route-outs.md`.
- Rewrite `references/architecture.md`, `references/agent-types.md`, and `references/use-cases.md` so their examples match the current upstream command families.
- Refresh `evals/evals.json` with manual-team, template-launch, profile-setup, monitor/recover, and route-out cases.
- Refresh `SKILL.toon`, `skills.json`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so the discovery surface matches the new boundary.
- Refresh `graphify-out/` so the structural memory layer records the new `clawteam` shape.

## Rejected changes
- Adding another generic swarm or multi-agent wrapper.
- Pretending `clawteam` is the default answer whenever a user says "multiple agents."
- Keeping stale `send` / `broadcast` / `task add` / `monitor` examples just because they were already in the repo.
- Overselling long-running worker reliability when upstream issue evidence says the keepalive path still has real edge cases.

## Verification
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/clawteam`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`

## Result
The durable boundary is now: `clawteam` owns the ClawTeam CLI operator surface and mode selection; broader plan/execute/QA orchestration, board governance, and lightweight built-in delegation stay outside it.

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[npm-git-install-structural-hardening-2026-04-19]]
- [[jeo-structural-hardening-2026-04-16]]
- [[graphify-structural-hardening-2026-04-19]]
