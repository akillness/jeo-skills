# Solution Landscape: code-review modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GitHub / GitLab native review controls | Built-in PR/MR reviews, approvals, CODEOWNERS, branch protection, required checks | Lowest-friction baseline; integrates with existing repos and CI | Easy to confuse policy plumbing with actual review judgment; large diffs still review poorly | The default foundation in most teams |
| reviewdog | CI-to-PR diagnostic annotation | Good bridge between linters/static analysis and review UI; language-agnostic | Needs good signal tuning or it becomes comment noise | Useful as a deterministic pre-review layer |
| Danger JS | Rule-based PR policy automation | Strong for enforcing checklist/meta rules like changelog/tests/PR hygiene | Custom rules require maintenance; can be noisy | Best for policy checks, not deeper reasoning |
| CodeRabbit | AI-assisted PR review and summaries | Fast first-pass review, bug-risk spotting, summary generation | Requires trust calibration; can over-comment; paid tool | Good evidence that AI review now lives inside PR workflows |
| Preview-driven frontend review | Deploy previews, screenshots, videos, visual regression artifacts | Handles behavior/UI states that plain diffs miss | Fragments review context across code + preview tools | More adjacent to UI review than to pure code critique |
| Small-PR / stacked-review discipline | Split large changes into smaller reviewable units | Strongest answer to review-quality decay on large diffs | Requires author discipline and workflow support | Often a practice change more than a tooling change |
| Asset-heavy / changelist review | Perforce / game-style review plus manual validation | Better fit for game / binary-heavy work | Text-centric PR tooling handles it badly | Signals that game review needs explicit boundary notes |

Sources:
- GitHub Docs — About pull request reviews: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews
- GitHub Docs — About code owners: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- GitHub Docs — About protected branches: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- GitLab Docs — Merge request approvals: https://docs.gitlab.com/ee/user/project/merge_requests/approvals/
- reviewdog: https://github.com/reviewdog/reviewdog
- Danger JS: https://danger.systems/js/
- CodeRabbit Pricing / positioning: https://www.coderabbit.ai/pricing
- Vercel pre-production deployments: https://vercel.com/docs/deployments/pre-production

## Categories
- **Native workflow controls:** GitHub/GitLab reviews, approvals, CODEOWNERS, protected branches, merge requirements
- **Rule-based automation:** reviewdog, Danger, CI annotations, policy-comment bots
- **AI-assisted review:** CodeRabbit-style automated summaries and review comments layered onto PRs
- **Preview / artifact-assisted review:** staging links, screenshots, videos, visual regression artifacts
- **Workflow-shaping alternatives:** smaller PRs, stacked diffs, patch/changelist review, manual signoff for binary-heavy work

## What People Actually Use
Most teams still anchor review in native pull requests / merge requests, then layer automation around them. The common pattern is: author self-review + PR description + CI gates + one or more human reviewers. For frontend work, reviewers often need previews or attachments; for backend/platform work, they lean on checks plus targeted review of migrations/auth/risk; for game and asset-heavy work, textual review is only one part of a broader validation step.

## Frequency Ranking
1. Native PR/MR reviews with approvals and checks
2. CI/static-analysis-assisted review signals
3. Rule-based automation (reviewdog / Danger class)
4. AI-assisted review summaries/comments
5. Preview-driven review for frontend / UX-heavy work
6. Specialized asset-heavy / changelist review for game/binary-heavy workflows

## Key Gaps
- The repo's current `code-review` skill is still a broad legacy checklist and does not clearly tell the agent how to choose a review mode, classify review findings, or route away to neighboring skills.
- The current skill underplays workflow reality: approvals, ownership, missing test evidence, preview links, migration risk, and rollout concerns are more central today than generic SOLID/performance bullet lists.
- The skill has no `references/` or `evals/`, so future ratcheting is weak and trigger boundaries are easy to regress.
- The current README positioning ("Comprehensive code review with API contracts") is too vague and drifts toward `api-design` / `testing-strategies` territory.

## Contradictions
- Marketed review tooling often implies that better inline comments solve review quality, but actual practice still depends heavily on small diffs, CI gates, ownership rules, and artifact sharing outside the diff.
- AI review products promise broad coverage, but teams still need humans to decide severity, context, rollout risk, and whether a concern belongs to testing, debugging, UI review, or repo policy.
- Static-analysis and policy bots improve throughput, but they do not replace the judgment step that decides approve / request-changes / escalate.

## Key Insight
The best improvement is not adding another review-adjacent skill. It is modernizing `code-review` into a workflow-aware decision skill: first classify the review surface (PR, local diff, patch stack, asset-heavy/game change), then judge correctness / maintainability / risk, then route adjacent needs to `git-workflow`, `testing-strategies`, `debugging`, `web-design-guidelines`, or repo-management workflows. That preserves a single strong review anchor while matching how real teams actually work.
