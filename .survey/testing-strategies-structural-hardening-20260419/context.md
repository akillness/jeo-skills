# Context: testing-strategies structural hardening

## Workflow Context
`testing-strategies` sits in the code-quality lane as the policy/orchestration skill that answers “what proof is enough for this change?” before anyone writes tests, approves a PR, or ships a release. The repo cluster notes already separate it from `backend-testing` (implementation), `debugging` (root cause), and `code-review` (judgment on one diff), but the current front door still spends too many lines re-explaining generic strategy concepts instead of quickly classifying the packet in front of the agent.

External workflow evidence keeps converging on the same shape:
- Martin Fowler’s **Test Pyramid** and **The Practical Test Pyramid** keep the center of gravity on choosing the smallest convincing layer mix instead of defaulting to broad end-to-end coverage. Source: https://martinfowler.com/bliki/TestPyramid.html and https://martinfowler.com/articles/practical-test-pyramid.html (`direct page retrieval (unverified SSL context)`).
- Google Testing Blog’s **Just Say No to More End-to-End Tests** reinforces that large end-to-end suites are expensive and brittle, so teams need explicit gate decisions rather than “test more” slogans. Source: https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html (`direct page retrieval (unverified SSL context)`).
- Playwright and Selenium both position browser automation as a deliberately scoped practice, not the universal answer to validation. Source: https://playwright.dev/docs/best-practices and https://www.selenium.dev/documentation/test_practices/ (`direct page retrieval (unverified SSL context)`).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Agent maintainer | Decide which neighboring skill should own the next step and what evidence packet is missing | Intermediate–advanced |
| Developer / tech lead | Choose merge-gate vs release-gate validation depth for one change | Intermediate |
| Reviewer / release owner | Judge whether current evidence is enough without inventing a whole testing manifesto | Intermediate |
| QA / quality lead | Set policy for flaky suites, quarantines, release smoke, and incident regression ratchets | Advanced |

## Current Workarounds
1. Teams rely on generic test-pyramid advice, then still argue case-by-case about merge gates and release signoff.
2. Risky requests get bounced between test implementation, debugging, and review without a clean “policy packet” front door.
3. Flaky-suite discussions fall back to rerun rituals, spreadsheet/checklist tracking, or CI noise triage instead of explicit quarantine / gate policy.
4. Release confidence often gets handled through ad hoc checklists or staging smoke notes outside the test-strategy discussion.

## Adjacent Problems
- Flaky-test management drifts into tooling/vendor conversations before teams define the human policy for quarantine, blocking vs informational checks, and follow-up ownership.
- Release checklists and QA signoff can mask the fact that the underlying change-based strategy is still unclear.
- PR review packets often mix “is this change safe?” with “why is the suite red?” even though those are separate ownership questions.
- Escaped-bug follow-ups often overreact into broad E2E expansion instead of ratcheting the lowest useful regression layer.

## User Voices
- “This specific e2e suite was poorly optimized and was killed instead of rewritten/optimized due to a perceived notion that inefficiences are inherent in all e2e ...” — Yahoo Japan indexed snippet for Hacker News result **We killed our end-to-end test suite**. Source: https://search.yahoo.co.jp/search?p=site%3Anews.ycombinator.com+end+to+end+tests+merge+gate (`Yahoo Japan indexed snippet`, confidence: medium).
- “Not too many integration tests, mostly unit tests. Clearly define a contract between the boundaries of the code, and stub/mock on the contract.” — Yahoo Japan indexed snippet for Hacker News result **Write tests. Not too many. Mostly integration**. Source: https://search.yahoo.co.jp/search?p=site%3Anews.ycombinator.com+end+to+end+tests+merge+gate (`Yahoo Japan indexed snippet`, confidence: medium).
- “Lastly we implemented a tool that alerted us on flaky tests, allowed us to temporarily quarantine a test for a limited time while we fixed it ...” — Yahoo Japan indexed snippet for Reddit result **How to deal with Flaky Test?**. Source: https://search.yahoo.co.jp/search?p=site%3Areddit.com+flaky+tests+quarantine+ci (`Yahoo Japan indexed snippet`, confidence: high).
- “You need to identify flakey tests by rerunning failed tests against the same commit. After you identify tests which fail the first run but pass ...” — Yahoo Japan indexed snippet for Reddit result **How do you Address and Prevent Flaky tests?**. Source: https://search.yahoo.co.jp/search?p=site%3Areddit.com+flaky+tests+quarantine+ci (`Yahoo Japan indexed snippet`, confidence: high).
- “Quarantine is good strategy so that you remove the noise from your CI, but you need to find the root cause of failing tests ...” — Yahoo Japan indexed snippet for Reddit result **Flaky tests are not ‘almost fine.’ They’re noise**. Source: https://search.yahoo.co.jp/search?p=site%3Areddit.com+flaky+tests+quarantine+ci (`Yahoo Japan indexed snippet`, confidence: high).
