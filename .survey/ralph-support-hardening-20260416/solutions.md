# Solution Landscape: ralph support hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| `ralph` / Ouroboros | Spec-first clarification + immutable seed + persistent completion loop | Only surface in the repo that owns the full Interview → Seed → Execute → Evaluate → Evolve model | Still missing eval coverage; some local support docs/examples point to stale `ralph-ooo` skill paths | Best bounded in-place improvement target |
| `omc` | Claude-first orchestration runtime | Strong runtime automation and multi-agent execution | Runtime wrapper, not the canonical spec-first method | Complement, not replacement |
| `omx` | Codex-first orchestration runtime | Strong Codex-native routing for deep interview / planning / team flows | Runtime wrapper, not the canonical ontology/spec anchor | Complement, not replacement |
| `jeo` | Integrated orchestration shell | Strong plan → execute → verify → cleanup loop with durable state | Broader workflow shell, not the spec-first clarification owner | Should stay above `ralph` in the stack |
| `plannotator` | Visual plan/diff approval gate | Sharp approval boundary | Not for spec creation or persistent execution | Review/approval adjunct |
| `ralphmode` | Permission/settings/rules/hooks layer | Makes unattended `ralph` runs safer and more portable | Does not own runtime behavior or spec-first semantics | Safety/support layer |
| `ohmg` | Gemini / Antigravity portable harness | Helpful platform comparison for persistent orchestration | Not the spec-first loop owner | Comparative platform anchor |

## Categories
- **Canonical spec-first + completion:** `ralph`
- **Runtime-native orchestration overlays:** `omc`, `omx`, `ohmg`
- **Approval / checkpoint layers:** `plannotator`, `ralphmode`
- **Integrated orchestration shell:** `jeo`

## What People Actually Use
People do not rely on a single magic loop. They combine instruction files, shell scripts, hooks, worktrees, approval gates, and CI automation so that long-running agent work can resume safely and stay inside repo policy. That makes support quality, eval coverage, and setup-path accuracy more valuable than adding another overlapping wrapper.

## Frequency Ranking
1. `ralph` — central spec-first surface with strong local and upstream identity, but currently the last live eval holdout in the graph report.
2. `jeo` / `plannotator` — heavy adjacent reuse as orchestration shell and approval gate.
3. `omc` / `omx` — high-visibility runtime comparators that prove the lane is already crowded enough.
4. `ralphmode` / `ohmg` — support/comparison layers, not primary replacements.

## Key Gaps
- No `evals/evals.json` for the live `ralph` skill even though it is a high-visibility orchestration entry.
- Stale local installation/setup examples still mention `.agent-skills/ralph-ooo/...` or `--skill ralph-ooo`, which is residue rather than current repo structure.
- The repo-local support surface should prove the canonical boundary (`ralph` = method/loop) rather than forcing users to infer it from adjacent skills.

## Contradictions
- Marketed autonomy implies persistent completion, but real operators still rely on repo docs, hooks, scripts, and checkpoints to keep long runs safe.
- The current skill description is current, but some setup examples still speak in the legacy `ralph-ooo` directory language, which weakens trust in the support layer.

## Key Insight
The strongest move is not a new orchestration wrapper. It is to finish the last support gap on the canonical spec-first skill: add eval coverage and remove repo-local path/install residue so `ralph` is both structurally complete and easier to activate without translation.

## Curated Sources
- Local: `.agent-skills/ralph/SKILL.md`, `docs/ralph/README.md`, `graphify-out/GRAPH_REPORT.md`, `.agent-skills-wiki/concepts/core-orchestration-platform-cluster.md`
- Upstream Ouroboros: https://github.com/Q00/ouroboros/blob/main/README.md
- Claude Code docs: https://docs.anthropic.com/en/docs/claude-code/common-workflows
- Codex AGENTS guide: https://developers.openai.com/codex/guides/agents-md
