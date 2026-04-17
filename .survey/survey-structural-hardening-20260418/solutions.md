# Solution Landscape: survey structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Current `survey` pattern | One large front door that includes triage, 4 lanes, artifact schema, evidence ladder, platform abstraction, and examples | Complete, portable, and explicit about outputs | Heavy to reread, harder to keep aligned with the repo's routing-first maintenance style | Source-backed by `.agent-skills/survey/SKILL.md` and `graphify-out/GRAPH_REPORT.md` |
| Routing-first skill pattern | Keep `SKILL.md` focused on mode choice, artifact contract, and route-outs; move durable detail into `references/` | Matches the repo's dominant hardening pattern and lowers front-door maintenance cost | Requires stronger support docs and tighter sync across compact/discovery surfaces | Seen in `task-planning`, `git-workflow`, `user-guide-writing`, `technical-writing`, `skill-standardization` |
| Support-doc-heavy pattern | Put checklists, templates, and slow-changing platform detail in focused references | Easier to patch without bloating the main skill | Can fragment context if the front door stops naming the right references | Useful once support coverage already exists |
| Platform-native runtime flows | Use Claude / Codex / Gemini settings, approvals, subagents, and hooks to run research | Good for execution/runtime control | Not a portable artifact contract by themselves | Best treated as wrappers around a repo-local survey contract |
| Add another nearby research skill | New skill for survey hardening, evidence recovery, or platform comparison | Superficially isolates one slice of the problem | Reintroduces overlap and duplicates the canonical survey entry point | Explicitly rejected in prior repo-local survey work |

## Categories
- **Canonical repo-local pattern**
  - routing-first front door
  - explicit artifact contract
  - references/evals for slow-changing detail
- **Current heavy survey pattern**
  - 4 lanes plus evidence ladder plus platform abstraction in one file
- **Platform-native runtime pattern**
  - settings/config layering
  - approvals/sandbox controls
  - subagents/hooks where supported
- **Rejected overlap pattern**
  - adding another research-hardening wrapper instead of improving `survey`

## What People Actually Use
Recent repo maintenance passes increasingly use short mode-selecting skills with focused references, while platform-native hooks/config/subagent features handle runtime automation. In practice, maintainers still rely on repo-local markdown instructions, direct retrieval fallbacks, and shared `.survey/{slug}/` artifacts rather than trusting vendor-specific runtime features to define the survey output contract.

## Frequency Ranking
1. Routing-first + references-backed skills in recent repo hardening passes
2. Support-doc-heavy documentation/maintenance skills once support coverage exists
3. Platform-native runtime features for execution details
4. The current all-in-one `survey` front door
5. Adding another nearby research skill

## Key Gaps
- The current `survey` front door still carries more slow-changing platform and recovery detail than adjacent routing-first skills.
- Platform-native config/hook features are richer than when `survey` was last expanded, but that portability story is not yet cleanly separated from the main skill.
- Discovery surfaces still need truthful wording when the survey role becomes narrower and more contract-driven.

## Contradictions
- Marketed portability often sounds like platform-native config should solve the workflow, but actual repo practice still depends on checked-in markdown instructions and explicit artifact templates.
- `survey` already ships support files, yet the main file still behaves more like an operating manual than the smaller routing-first anchors the repo now prefers.

## Key Insight
The bounded win is not a new research skill. It is shrinking `survey` into a routing-first, artifact-contract-first front door while preserving its canonical 4-lane survey role and pushing slower-changing evidence-recovery and platform-portability detail into references. That keeps the portable survey output stable while aligning the skill with the repo's broader dense-anchor cleanup pattern.
