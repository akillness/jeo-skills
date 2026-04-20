# Context: testing-strategies gate-truth ratchet

## Workflow Context
`testing-strategies` sits at the point where teams ask what must block a merge, what can move to scheduled coverage, and what still needs release-only or platform-specific proof. The external evidence keeps reinforcing the same split: broad end-to-end-heavy strategies feel attractive in theory but hide root cause, flake, and environment coupling in practice; browser guidance pushes tests toward user-visible behavior and strong isolation; release platforms still require explicit final-build and packaging checklists that are not the same thing as PR blockers. In the repo graph, this makes `testing-strategies` a stable candidate for another bounded front-door ratchet rather than a candidate for a sibling wrapper skill.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Backend / fullstack developer | Decide what evidence is enough before merge for API, auth, migration, or service changes | Intermediate |
| Tech lead / reviewer | Define which checks must block PRs versus which belong in release or scheduled gates | Advanced |
| Release / DevOps owner | Translate test confidence into protected-branch checks, rollout safety, and deployment handoffs | Advanced |
| Game developer / launch owner | Separate branch confidence from store/platform launch checklists and packaging proof | Intermediate to advanced |

## Current Workarounds
1. Teams default to broad E2E-heavy or nightly-heavy policies because the merge-vs-release distinction is not explicit enough. Limitation: slow feedback, hidden root causes, and noisy blockers.
2. Reviewers use protected-branch required checks as a proxy for total release confidence. Limitation: GitHub required checks are merge controls, not a full release-readiness model.
3. Game/platform teams keep separate launch checklists in Steamworks, Xbox/GDK, or operator docs. Limitation: the validation-policy skill can under-specify when those checklists become the next owner.
4. Flaky browser suites get retried or quarantined ad hoc. Limitation: quarantine policy stays implicit, and scheduled-vs-blocking placement remains fuzzy.

## Adjacent Problems
- Branch protection and merge queue configuration can make a weak policy look official.
- Release confidence often depends on staging smoke, packaging, permissions, or rollout checks that do not belong in the same owner lane as merge-gate policy.
- Accessibility, performance, and stack-specific implementation work still need early route-outs so `testing-strategies` does not absorb remediation work.
- Game delivery adds platform launch constraints that resemble QA work but really belong with launch/runbook skills once policy is decided.

## User Voices
- Google Testing Blog describes an end-to-end-heavy nightly strategy where partner failures, hidden smaller bugs, flake, and next-day feedback delay made the team miss its milestone despite catching real bugs. Source: https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html
- Playwright best practices says to test user-visible behavior, isolate every test, and only test what you control rather than leaning on brittle implementation details or external dependencies. Source: https://playwright.dev/docs/best-practices
- GitHub Docs says branch protection rules can require status checks before merging and warns that duplicate job names can create ambiguous results that block pull requests. Source: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- Steamworks Release Process says launch is mostly in the developer's hands but still needs Valve review, explicit permissions, and complete release checklists for store presence and game build readiness. Source: https://partner.steamgames.com/doc/store/releasing
- Microsoft GDK packaging docs say console packaging for testing/publishing requires product identity, a MicrosoftGame.config, packaging layout generation, and package creation steps. Source: https://learn.microsoft.com/en-us/gaming/gdk/docs/features/common/packaging/overviews/packaging-getting-started-for-console
- Yahoo Japan indexed snippets for `flaky test policy pull request nightly testing strategy` surfaced recurring advice to quarantine flaky tests, move non-essential suites off blocking PR paths, and treat PR blockers as developer-speed constraints rather than generic quality theater. Sources recovered as browser-rendered indexed snippets: https://search.yahoo.co.jp/search?p=flaky+test+policy+pull+request+nightly+testing+strategy (Bitrise, Trunk, Reddit/devops snippet layer)
