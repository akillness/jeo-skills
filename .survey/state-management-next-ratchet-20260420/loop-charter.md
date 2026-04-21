# Loop Charter

## Goal
Improve the `state-management` skill so agents reach the right ownership recommendation faster, with less library-tour drift and clearer exclusions/route-outs.

## Current Baseline
`state-management/SKILL.md` is already the canonical ownership-packet skill, but it is still 272 lines and remains dense enough that a user can get too much React-state exposition before the packet choice and anti-pattern boundary are explicit.

## Mutable Artifact
Primary mutable artifact: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/state-management/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec compliance (`name`, trigger-oriented `description`, standard sections, compact size discipline)
- Existing repo boundary for `react-best-practices`, `api-design`, `debugging`, `ui-component-patterns`, `design-system`, and `responsive-design`
- Survey evidence in `.survey/state-management-next-ratchet-20260420/`
- Validation prompts:
  1. “Should this dashboard use Zustand or TanStack Query for project data, filters, and modal state?”
  2. “Theme and auth are passed through five levels. Do we need Redux?”
  3. “Our React Router app stores filters and loader data in Zustand. Is that fine?”
  4. “The state code is buggy and optimistic updates are broken—what skill owns the next step?”
- Pass threshold: clearer packet-first intake, sharper anti-pattern warnings, and no boundary regressions.

## Constraints
- Max time for this iteration: one bounded repo-maintenance pass
- Change one meaningful thing: tighten the front door and decision path, not a broad new expansion
- Keep `state-management` as the canonical skill; do not add a new overlapping state wrapper
- Update compact/discovery/docs surfaces only if the kept change materially changes trigger/discovery wording
- Validate changed skill artifacts before finalizing

## Tried Already
- Keep: 2026-04-13 modernization that moved the skill away from a generic library tour.
- Keep: 2026-04-18 structural hardening that introduced ownership packets and router-native route-outs.
- Revert: creating another React state wrapper or broadening the skill back into a giant store comparison catalog.
- Why: the durable need is faster ownership classification, not more overlapping frontend state skills.
