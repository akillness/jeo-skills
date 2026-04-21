---
title: clawteam packet ratchet
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, consolidation, trigger-design, skill-quality, survey, docs]
sources: [.survey/clawteam-packet-ratchet-20260420/triage.md, .survey/clawteam-packet-ratchet-20260420/context.md, .survey/clawteam-packet-ratchet-20260420/solutions.md, .survey/clawteam-packet-ratchet-20260420/platform-map.md, .survey/clawteam-packet-ratchet-20260420/loop-charter.md, graphify-out/GRAPH_REPORT.md, .agent-skills/clawteam/SKILL.md, .agent-skills/clawteam/references/intake-packets-and-route-outs.md, .agent-skills/clawteam/references/operator-modes-and-route-outs.md, .agent-skills/clawteam/evals/evals.json]
---

# clawteam packet ratchet

## Question
What is the best bounded next improvement for `clawteam` after its first structural hardening pass, now that the skill is support-complete but still oversized relative to the rest of the developer-workflow lane?

## Answer
Tighten `clawteam` again in place. The durable move is to make it a packet-first ClawTeam runtime router: start from one operator packet (`manual-team`, `template-launch`, `monitor-recover`, or `profile-setup`), state tmux/worktree/runtime reality earlier, and route generic orchestration or board-governance requests outward before showing commands.

## Why this won
- The refreshed graph still treats discovery docs as dominant and continues to reward smaller front-door contracts over new wrappers.
- Survey evidence showed that real ClawTeam-style usage still depends on tmux, worktrees, manual inspection, loop prompts, and recovery commands; that makes a reality-first packet surface more useful than a larger abstraction-heavy front door.
- Nearby tools repeat the same pain pattern — reliability, visibility, and runtime truthfulness — which argues for sharpening the existing ClawTeam boundary rather than adding another swarm wrapper.
- Repo-local neighboring skills already own broader orchestration (`jeo`, `omc`, `omx`, `ohmg`) and board governance (`vibe-kanban`).

## Accepted changes
- Rewrite `clawteam/SKILL.md` as a packet-first runtime router with an explicit `route-out` packet and stronger wrong-owner checks.
- Add `references/intake-packets-and-route-outs.md` as the fastest packet-selection aid.
- Refresh `SKILL.toon`, `skills.json`, README / README.ko / setup discovery wording, and eval coverage.
- Refresh `graphify-out/` so the structural layer records the sharper boundary.

## Rejected changes
- Adding another generic swarm/orchestration wrapper.
- Re-expanding `clawteam` into a bigger command encyclopedia.
- Treating board governance or generic multi-agent planning as ClawTeam runtime work.
- Hiding tmux/worktree/manual-recovery reality behind a smoother marketing story than the evidence supports.

## Verification
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/clawteam`
- `python3 -m json.tool .agent-skills/clawteam/evals/evals.json`
- `python3 -m json.tool .agent-skills/skills.json`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`

## Result
The durable boundary is now: `clawteam` owns explicit ClawTeam runtime operation and packet selection; broader orchestration, queue governance, and lightweight delegation stay outside it.

## Related pages
- [[developer-workflow-cluster]]
- [[clawteam-structural-hardening-2026-04-19]]
- [[skill-support-coverage]]
- [[graphify-structural-hardening-2026-04-19]]
