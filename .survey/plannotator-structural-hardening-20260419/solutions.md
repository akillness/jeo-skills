# Solution Landscape: plannotator structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| plannotator | Browser-based review gate for agent plans, markdown artifacts, and git diffs | Distinct pre-code visual approval loop; inline annotations; approve/request-changes semantics; multi-runtime story across Claude, Gemini, Codex, and OpenCode | Separate UI + hook/setup friction; some runtimes remain manual or partial; not the default place most teams already review | Best distinct value is **plan-first** and **artifact-targeted** review, not generic code-review policy |
| GitHub-native agent PR workflow | Agent makes a branch/PR; humans review via protected branches, CODEOWNERS, and PR reviews | Native audit trail and org policy; already where many teams operate | Starts after code exists; no dedicated visual plan-review surface | Dominant adjacent default for teams using GitHub |
| CodeRabbit | AI overlay on PR/IDE/CLI review surfaces with planning handoff and pre-merge checks | Enriches existing review loops without new process surface | Still PR-first, not a purpose-built pre-execution plan gate | Competitive pressure is downstream review enrichment, not direct plan-gate replacement |
| Reviewable | Rich diff review layered on GitHub PRs | Strong diff ergonomics and review-state tracking | Not agent-specific; no plan-stage review contract | Benchmark for diff-review UX more than plan review |
| Gerrit | Formal patch-set review with explicit labels and submit requirements | Strong explicit approval model | Heavyweight and forge-specific | Useful as a contrast for formal post-code approval gates |
| Claude Code hooks/settings | Runtime-level approval, permissions, and hook mechanism | Strongest general gate mechanism before actions run | Not a review product by itself | Complements `plannotator`; does not replace it |
| OpenHands resolver workflow | PR-native open-source review automation around issue/PR comments and review events | Strong open-source evidence for reviewer artifacts and PR-driven loops | Review happens after branch/PR exists | Shows where open-source agent workflows usually land without a plan-review UI |

## Categories
- **Plan-first visual approval:** `plannotator`
- **PR-first approval gates:** GitHub-native PR review, Reviewable, Gerrit, OpenHands resolver
- **AI overlays on PR-native review:** CodeRabbit
- **Hook/permission infrastructure rather than a review surface:** Claude Code hooks/settings

## What People Actually Use
Most surveyed alternatives treat the **pull request** or **change list** as the first serious human checkpoint. In practice, that means teams often accept plan generation in chat/CLI and only insist on review once the agent has produced code. `plannotator` is unusual because it tries to make the plan or artifact itself reviewable in a dedicated browser UI before implementation proceeds.

## Frequency Ranking
1. **PR-first review on existing forges** — GitHub-native workflow, Reviewable, Gerrit, OpenHands resolver
2. **AI overlays on PR review** — CodeRabbit
3. **Hook/permission mechanisms** — Claude Code hooks/settings
4. **Dedicated pre-code visual approval** — plannotator

## Key Gaps
- There is still no broadly dominant **portable pre-code plan-review** product; the market mostly falls back to PR review.
- Platform support is uneven: some runtimes have native or hookable plan review, others still need manual review commands or partial setup.
- Spec/markdown review wants stronger approve/no-op semantics, not just annotation plus close.
- Downstream handoff from plan review into PR-native review systems is under-specified.

## Contradictions
- Market reality says the safest checkpoint is the PR, but `plannotator`’s strongest value is the earlier checkpoint before code exists.
- Hook-capable runtimes make visual plan review plausible, yet users still ask for manual invocation because automatic interception can feel intrusive.
- Diff review is getting richer upstream, which risks pulling `plannotator` toward generic code review unless the skill keeps the pre-code gate and artifact-specific boundaries explicit.

## Key Insight
`plannotator` does not need to beat GitHub, Reviewable, or Gerrit at broad post-code review. It needs to stay crisp about one narrower job: **human approval of a concrete plan, markdown artifact, or targeted diff in a visual UI before the workflow silently rolls forward**. That means the skill should choose the review packet first, explain when the runtime supports native interception versus manual review, and route broad PR policy or downstream merge governance back to the tools that already own it.

## Curated Sources
- `plannotator` README: https://github.com/backnotprop/plannotator/blob/main/README.md
- `plannotator` Claude hook docs: https://github.com/backnotprop/plannotator/blob/main/apps/hook/README.md
- `plannotator` Codex docs: https://github.com/backnotprop/plannotator/blob/main/apps/codex/README.md
- GitHub Copilot agent workflow: https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/research-plan-iterate
- Protected branches: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- CODEOWNERS: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- CodeRabbit docs: https://docs.coderabbit.ai/
- Reviewable docs: https://docs.reviewable.io/
- Gerrit overview: https://gerrit-review.googlesource.com/Documentation/intro-quick.html
- OpenHands resolver workflow: https://raw.githubusercontent.com/All-Hands-AI/OpenHands/main/.github/workflows/openhands-resolver.yml
