# Solution Landscape: testing-strategies gate-truth ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GitHub protected branches | Merge-gate enforcement via required checks, reviews, merge queue, deployments | Canonical merge-control surface; makes blocking requirements explicit | Merge controls are not a full validation strategy; ambiguous job names can break signal | Primary source: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches |
| Playwright best practices | Browser test guidance focused on user-visible behavior and isolation | Strong support for small truthful browser coverage and isolation | Not a full merge/release policy framework | Primary source: https://playwright.dev/docs/best-practices |
| Selenium test practices | Browser automation guidelines / recommendations | Reinforces that there is no one universal best-practice recipe | More guidance than decision framework | Primary source: https://www.selenium.dev/documentation/test_practices/ |
| Fowler practical test pyramid | Layer-selection framework for balancing unit, integration, contract, UI, exploratory tests | Durable language for smallest-convincing-layer thinking | Easy to overquote as doctrine without gate-specific policy | Primary source: https://martinfowler.com/articles/practical-test-pyramid.html |
| Google Testing Blog: No more end-to-end tests | Anti-pattern case study for end-to-end-heavy strategies | Concrete operational failure modes: hidden bugs, flake, partner failures, slow feedback | Historical blog post, not a modern branch-protection manual | Primary source: https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html |
| Steamworks release checklists | Platform-specific release readiness and launch control | Makes store/game-build release gates explicit | Steam-specific; not a general merge-gate model | Primary source: https://partner.steamgames.com/doc/store/releasing |
| Microsoft GDK packaging workflow | Platform-specific packaging and publishing readiness | Makes console packaging prerequisites concrete | Packaging flow, not day-to-day PR policy | Primary source: https://learn.microsoft.com/en-us/gaming/gdk/docs/features/common/packaging/overviews/packaging-getting-started-for-console |
| Bitrise / Trunk / community flake advice | Quarantine, de-block, and move unstable suites to better gates | Matches real CI pain language and gate re-shaping behavior | Indexed-snippet evidence only in this run | Browser-rendered indexed snippet sources via Yahoo Japan search |

## Categories
- **Merge-gate controls:** GitHub protected branches, merge queue, required status checks
- **Layer-selection guidance:** Fowler test pyramid, Playwright best practices, Selenium test practices
- **Failure-pattern evidence:** Google Testing Blog case study, indexed flaky-suite/community snippets
- **Platform release checklists:** Steamworks release process, Microsoft GDK packaging workflow

## What People Actually Use
In practice, teams combine multiple layers instead of relying on one universal testing doctrine:
- protected-branch checks for merge control,
- focused browser/integration coverage for changed critical paths,
- scheduled or quarantined placement for expensive/flaky breadth,
- separate release/platform checklists when launch or packaging risk remains.

That mix maps directly to the repo's need: `testing-strategies` should help choose the truthful gate and confidence owner, then route merge controls, implementation, release execution, or platform launch work outward.

## Frequency Ranking
1. Merge-gate enforcement (`required status checks`, protected branches, merge controls)
2. User-visible / isolated test guidance (Playwright, Selenium)
3. Anti-E2E-overuse guidance (Google Testing Blog, Fowler practical pyramid)
4. Explicit release / platform checklist guidance (Steamworks, Microsoft GDK)
5. Flake quarantine / scheduled-run workarounds (Yahoo indexed snippets from Bitrise / Trunk / community posts)

## Key Gaps
- No primary source gives one portable brief that cleanly distinguishes PR blockers, release-only proof, scheduled breadth, and platform launch handoffs across software and game delivery.
- Merge tooling makes blocking policy visible, but it does not decide what the right evidence is.
- Release/platform docs are strong at checklist detail, weak at helping teams decide when those checklists become the next owner rather than more PR coverage.

## Contradictions
- Marketed or intuitive instinct: more end-to-end realism means more confidence.
- Observed reality: end-to-end-heavy strategies frequently create delayed feedback, hidden bugs, and flaky merge blockers unless the gate is narrowed and isolated.
- Merge-control tooling can look like a strategy, but it only enforces the policy you already chose.

## Key Insight
The best bounded next ratchet for `testing-strategies` is not another test-type packet or a new sibling skill. It is a sharper gate-truth contract: make the user name which gate is being decided, keep protected-branch checks and browser guidance as merge-control inputs, and route release/platform checklist work explicitly to deployment or game-launch owners when merge confidence is no longer the real question.
