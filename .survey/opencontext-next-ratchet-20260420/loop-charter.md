# Loop Charter

## Goal
Improve the existing `opencontext` skill with one bounded ratchet that makes active project memory more trustworthy in real repo workflows.

## Current Baseline
`opencontext/SKILL.md` already cleanly distinguishes active project memory from wiki/graph/vault/repo-packer layers and supports load/search/store/setup packets. Its likely remaining weakness is that it does not explicitly teach a trust model for precedence, provenance, and branch freshness when multiple memory artifacts disagree.

## Mutable Artifact
- Primary mutable artifact: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/opencontext/SKILL.md`

## Fixed Evaluation Harness
### Representative prompts
1. Persistent repo memory before coding: “We keep losing repo background between agent sessions. I need the next coding agent to load the right docs and store the conclusion after the task.”
2. Memory-layer choice: “Should we use OpenContext, a wiki, Obsidian, or a graph tool for this project?”
3. Setup/integration: “Set up OpenContext in our repo and tell me when to use keyword search vs embeddings.”
4. Repo-packer route-out: “Turn this repository into a single prompt I can paste into a model right now.”
5. Trust/freshness conflict: “`README.md` says one deploy step, `CLAUDE.md` says another, and we just switched to a release branch. What should the next agent trust and what should we store after resolving it?”

### Binary evals
- Packet clarity: names one primary packet/mode for the prompt.
- Boundary clarity: keeps OpenContext as active project memory only and routes wiki/graph/repo-packer requests outward.
- Lifecycle clarity: preserves load → search → store behavior where relevant.
- Trust model clarity: for conflict prompts, explicitly states precedence/provenance/freshness checks instead of hand-waving.
- Branch awareness: warns when branch/repo state can invalidate stored memory.
- Compact output discipline: still returns a small project-memory brief rather than a giant taxonomy dump.

### Validators
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/opencontext`
- `python3 -m json.tool .agent-skills/opencontext/evals/evals.json`
- `python3 -m json.tool .agent-skills/skills.json`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`

## Constraints
- One meaningful ratchet only: trust/freshness/provenance handling for active memory.
- Keep `opencontext` as the same lane owner; do not broaden into wiki/graph/note tooling.
- Supporting files may be updated only after the main `SKILL.md` ratchet holds.
- Sync README / README.ko / setup prompt only if the discovery surface materially changes.
- Stay within one branch and one PR for this run.

## Tried Already
- Keep: earlier modernization and structural-hardening passes that made `opencontext` packet-first and clarified route-outs.
- Revert: adding another memory wrapper or turning `opencontext` into a generic memory-layer explainer.
- Why: the remaining value is dense front-door clarity, not more breadth.