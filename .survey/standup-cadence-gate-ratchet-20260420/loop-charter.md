# Loop Charter

## Goal
Improve `standup-meeting` so it tells the truth about cadence before it chooses a meeting format.

## Current Baseline
Current best version (metadata `hardening: 2026-04-19`) selects one standup mode and one coordination packet well, but it still assumes a daily ritual too early and under-specifies when the right answer is a lighter cadence or no recurring standup.

## Mutable Artifact
Primary mutable artifact: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/standup-meeting/SKILL.md`

Supporting surfaces allowed only if the primary change is kept:
- `SKILL.toon`
- `references/`
- `evals/evals.json`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki/log/query artifacts

## Fixed Evaluation Harness
- Agent Skills spec / repo conventions already used in `skill-standardization`
- Existing PM-cluster boundary: `task-planning` owns readiness/decomposition, `task-estimation` owns sizing, `sprint-retrospective` owns process repair
- Validation prompts:
  1. "Our daily standup is mostly independent work updates. Should we keep it daily?"
  2. "Launch week starts tomorrow and marketing, product, and engineering need tighter coordination."
  3. "We are remote across time zones and the standup became a status ritual."
- Pass threshold:
  - The skill must choose one cadence outcome before or alongside mode selection.
  - It must allow `no recurring standup` / lighter cadence when daily is unjustified.
  - It must still route planning, sizing, and retrospective work cleanly.
  - Discovery surfaces stay truthful and compact.

## Constraints
- Bounded ratchet only: cadence gate / cadence truth, not a full PM-cluster rewrite.
- No new overlapping PM skill.
- Keep the skill under control; move stable detail into references when needed.
- Prefer transferable cadence rules that work across software, product/ops, marketing/GTM, and game delivery.

## Tried Already
- Keep: routing-first mode selection, follow-up huddle boundary, small coordination packet
- Revert: adding another PM wrapper or broadening the skill into planning / retrospective / incident-command territory
- Why: the cluster already has strong ownership boundaries; the missing truth is cadence, not another skill
