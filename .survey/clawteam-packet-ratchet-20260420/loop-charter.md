# Loop Charter

## Goal
Improve `clawteam` only if a packet-first rewrite makes the skill more reusable, more truthful to current upstream ClawTeam workflows, and easier to trigger without expanding its scope.

## Current Baseline
Current best version: `.agent-skills/clawteam/SKILL.md` at 300 lines with support references and evals from the 2026-04-19 structural hardening pass.
Current quality: valid and support-complete, but still a large front-door router that may mix intake, command examples, monitoring caveats, and provider setup detail more densely than needed.

## Mutable Artifact
Primary mutable artifact: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/clawteam/SKILL.md`
Supporting artifacts may change only if the primary rewrite wins: `SKILL.toon`, `evals/evals.json`, `references/*`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`, `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, wiki notes, survey outputs, and graphify outputs.

## Fixed Evaluation Harness
- Agent Skills spec compliance via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/clawteam`
- Catalog/discovery sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- JSON validity for changed manifests/evals via `python3 -m json.tool`
- Trigger/clarity rubric:
  - one clear primary intake packet before command detail
  - explicit route-outs to `jeo`, `omc`, `omx`, `ohmg`, `vibe-kanban`, and built-in delegation where appropriate
  - no stale or unverified upstream command claims
  - smaller or clearer front-door than baseline
- Dry-run prompts:
  1. "Use ClawTeam to split a full-stack feature across a leader and two workers."
  2. "Set up a custom provider profile for ClawTeam before we spawn anyone."
  3. "A ClawTeam board looks stuck; help me inspect tasks, inboxes, and team state."
  4. "I just need a general multi-agent coding workflow, not ClawTeam specifically." (should route out)

## Constraints
- Max time for this run: one bounded maintenance pass
- Prefer patching the existing skill over adding any new wrapper skill
- Do not change the evaluation harness mid-run
- Keep changes transferable to future oversized-router ratchets
- Refresh graph outputs only if the change materially alters structural understanding

## Tried Already
- Keep: 2026-04-19 structural hardening established mode routing, support references, evals, and synced discovery surfaces.
- Revert: N/A in this run yet.
- Why: Start from the existing hardened baseline instead of reopening already-solved support coverage work.
