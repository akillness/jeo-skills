# Context: testing-strategies modernization

## Workflow Context
Modern teams need testing-strategy guidance when they are deciding **what to test at which layer** rather than just how to write a specific test. The recurring workflow problem is balancing unit, integration, contract, API, UI/E2E, smoke, and manual/exploratory checks so the team gets enough release confidence without creating a slow brittle pipeline. Canonical references keep pointing to the same tradeoff: bias toward cheaper lower-level checks and use UI/end-to-end coverage sparingly because it is slower and costlier to maintain ([Martin Fowler — Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html), [Martin Fowler — Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html), [Google Testing Blog — Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)).

The workflow becomes especially important when:
- a team is choosing the validation plan for a new feature or risky refactor,
- CI is slow or flaky and nobody trusts the suite,
- a service boundary/API contract/database migration needs more than unit coverage,
- release readiness is being tracked across multiple tools and manual checklists,
- code review keeps turning into ad hoc arguments about “wrong test level” or “missing evidence”.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Application developer | Decide what automated coverage to add for each change and keep feedback loops fast | Intermediate–advanced |
| Tech lead / staff engineer | Define cross-repo validation policy, risk tiers, and merge/release expectations | Advanced |
| Reviewer / maintainer | Judge whether the chosen test depth matches change risk during review | Intermediate–advanced |
| Platform / CI owner | Absorb the cost of slow, flaky, or over-broad test suites | Advanced |
| QA / SET / quality engineer | Translate risk, exploratory testing, and release confidence into practical guidance | Intermediate–advanced |
| Engineering manager / PM partner | Need confidence, release visibility, and understandable validation status | Intermediate |

## Current Workarounds
1. **Use framework docs as a strategy substitute** — teams infer policy from Playwright/Selenium/Jest/Cypress guidance instead of having a repo-specific decision model ([Playwright best practices](https://playwright.dev/docs/best-practices), [Selenium test practices](https://www.selenium.dev/documentation/test_practices/)).
2. **Apply slogans like test pyramid / test trophy without a decision rubric** — useful shorthand, but often too shallow for architecture- or risk-specific choices ([Martin Fowler — Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html), [Kent C. Dodds — Write tests. Not too many. Mostly integration.](https://kentcdodds.com/blog/write-tests)).
3. **Copy large-company or enterprise templates** — GitLab-, Google-, or ISTQB-style guidance gets copied whole even when it is heavier than the team needs ([GitLab Testing Guide](https://docs.gitlab.com/development/testing_guide/), [Software Engineering at Google ch. 11](https://abseil.io/resources/swe-book/html/ch11.html), [ISTQB](https://www.istqb.org/)).
4. **Enforce strategy informally in code review** — reviewers repeatedly argue about missing unit tests, too many flaky E2Es, or absent regression coverage because the repository lacks a stable policy.
5. **Track release confidence in docs/sheets/checklists** — real-world workflows still rely on Jira + docs + chat + spreadsheets because formal test-management tools rarely capture risk and release nuance well enough ([PractiTest State of Testing](https://www.practitest.com/state-of-testing/), [TestRail State of Testing](https://www.testrail.com/state-of-testing/), [World Quality Report](https://www.capgemini.com/insights/research-library/world-quality-report/)).

## Adjacent Problems
- **`backend-testing`** — owns concrete API/service/database test implementation, fixture strategy, and stack-specific harnesses.
- **`test-driven-development`** — owns red-green-refactor workflow, not whole-repo validation policy.
- **`debugging`** — owns reproducing and isolating failures once a test or production issue already exists.
- **`code-review`** — owns reviewer judgment on whether a specific PR’s evidence is convincing.
- **Release / deployment / observability workflows** — often compensate for weak pre-release strategy with canaries, feature flags, and rollback-heavy operations.
- **Microservice contract testing** — frequently becomes the concrete answer when teams need confidence without exploding E2E count ([Martin Fowler — Consumer-Driven Contracts](https://martinfowler.com/articles/consumerDrivenContracts.html), [Martin Fowler — Microservice Testing](https://martinfowler.com/articles/microservice-testing/)).

## User Voices
- Google’s testing guidance makes the pain explicit: **“Just Say No to More End-to-End Tests”** because overusing them hurts speed, cost, and flake resistance ([source](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)).
- Martin Fowler’s test-pyramid framing persists because teams keep feeling the same pressure: too many high-level tests create an expensive maintenance burden, while lower-level checks are cheaper and faster ([Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html), [Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)).
- Playwright and Selenium best-practice docs repeatedly stress isolation and determinism, which reflects a common practitioner complaint: browser tests become too brittle to trust if they depend on external systems or shared state ([Playwright](https://playwright.dev/docs/best-practices), [Selenium](https://www.selenium.dev/documentation/test_practices/)).
- Testing-industry reports keep showing that automation does not replace manual/regression coordination; teams still fall back to docs, checklists, chat, and spreadsheets for release confidence and communication ([Ministry of Testing](https://www.ministryoftesting.com/software-testing-trends-report), [PractiTest](https://www.practitest.com/state-of-testing/), [TestRail](https://www.testrail.com/state-of-testing/)).
