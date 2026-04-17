# Context: code-review structural hardening

## Workflow Context
The repo's current graph refresh identifies `code-review` as one of the highest-degree nodes in the skill graph (degree 25), which means it is a frequent routing surface inside the code-quality cluster. In the current cluster model, `code-review` owns judgment on whether a specific diff is safe and ready, while neighboring skills own Git mechanics, debugging, test-policy design, or measurement-led tuning. That makes `code-review` a good bounded candidate for the next dense-anchor cleanup pass rather than a candidate for duplication.

Primary-source workflow evidence also points in the same direction. GitHub's pull-request review docs position review around approving, requesting changes, required reviews, and request-for-review flows rather than around general-purpose debugging or implementation work. GitHub's CODEOWNERS docs frame path-based ownership and responsibility assignment as repository policy infrastructure, not as the review judgment itself. GitLab's merge-request approval docs likewise focus on approval rules and approval status. In practice, the hosted platforms own approval mechanics and routing, while reviewer judgment still happens inside a narrower review brief.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Agent maintainer | Route review requests to the right skill, keep cluster boundaries clean, and preserve discovery accuracy | Advanced |
| Individual contributor | Self-review diffs before opening or merging a PR | Intermediate |
| Tech lead / reviewer | Decide approve vs request-changes, call out missing evidence, and escalate risk correctly | Advanced |
| Product/fullstack developer | Review web/backend changes that mix API, UI, config, and rollout risk | Intermediate to advanced |
| Game-programming reviewer | Judge gameplay/runtime diff safety while acknowledging what still needs playtest or engine validation | Intermediate to advanced |

## Current Workarounds
1. Use hosted PR review features directly (`Approve`, `Request changes`, required reviews, approval rules) and keep the actual reasoning informal in comments or chat.
2. Use repository policy surfaces such as `CODEOWNERS`, branch protection, or GitLab approval rules to force reviewer coverage, even though those mechanisms do not explain *what* the reviewer should say.
3. Add CI annotation tools such as reviewdog for automated findings; this helps surface lint/static-analysis output in review threads but does not replace human risk judgment.
4. Add Danger JS or similar CI-time policy bots to enforce review etiquette and missing-artifact checks after CI, while still relying on humans/agents for severity judgments and route-outs.
5. Fall back to generic checklists or oversized review templates, which often blur Git hygiene, debugging, testing strategy, design review, and release policy into one noisy surface.

## Adjacent Problems
- Oversized review surfaces make it harder to route commit cleanup to `git-workflow`, failure isolation to `debugging`, and validation-policy questions to `testing-strategies`.
- Frontend and marketing-site diffs often need preview evidence or screenshots, which is adjacent to but not identical with UI or accessibility review.
- Backend and fullstack diffs often blend schema, auth, config, rollout, and observability concerns, which can tempt the skill to become a generic architecture or debugging wrapper.
- Game-programming diffs can include code that is reviewable plus engine/editor behavior that still requires manual validation.
- Discovery docs can drift if `SKILL.md`, `SKILL.toon`, README, and setup surfaces stop describing the same route-in logic.

## User Voices
- GitHub Docs: pull-request reviews are about collaboration, review requests, and required reviews rather than generic engineering triage. Source: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews
- GitHub Docs: `CODEOWNERS` defines who is responsible for code in a repository, which reinforces that ownership/routing is a separate layer from review judgment. Source: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- GitLab Docs: merge-request approvals center approval rules, approval status, and approval actions. Source: https://docs.gitlab.com/ee/user/project/merge_requests/approvals/
- reviewdog README: positions itself as a code-review helper that keeps a codebase healthy by bringing automated findings into review surfaces, not as the reviewer itself. Source: https://raw.githubusercontent.com/reviewdog/reviewdog/master/README.md
- Danger JS README: describes Danger as CI-time automation for pull-request etiquette and conventions, again complementing rather than replacing reviewer judgment. Source: https://raw.githubusercontent.com/danger/danger-js/main/README.md
