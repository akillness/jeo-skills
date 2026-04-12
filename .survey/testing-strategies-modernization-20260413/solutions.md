# Solution Landscape: testing-strategies modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Test Pyramid / Practical Test Pyramid | Layered portfolio model across unit, integration/service, and UI/E2E tests | Canonical, simple, reusable framing for balancing speed and confidence | Easy to apply dogmatically; needs modernization for contracts/services | [Fowler](https://martinfowler.com/bliki/TestPyramid.html), [Practical](https://martinfowler.com/articles/practical-test-pyramid.html) |
| Google anti-E2E / hermetic testing guidance | Reliability-first policy emphasizing fast deterministic tests and low flake | Strong operational realism; directly addresses CI pain and E2E overuse | Less of a ready-made template, more of an engineering philosophy | [Google testing blog](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html), [SWE Book](https://abseil.io/resources/swe-book/html/ch11.html) |
| Test Trophy / “mostly integration” | Modern product/web framing that prefers integration over excessive unit/UI extremes | Good antidote to dogmatic unit-heavy advice; resonates with web teams | Can become another slogan without risk-based nuance | [Kent C. Dodds](https://kentcdodds.com/blog/write-tests) |
| Risk-based / ISTQB-style test strategy | Formal strategy and governance via risks, entry/exit criteria, traceability, environments | Strong for compliance, documentation, and stakeholder reporting | Often too heavy and template-driven for product teams | [ISTQB](https://www.istqb.org/) |
| Microservice testing / contract testing | Architecture-aware portfolio using component/service/contract tests to limit E2E sprawl | Great fit for distributed systems and API-heavy products | Too architecture-specific to be the only default model | [Microservice Testing](https://martinfowler.com/articles/microservice-testing/), [Consumer-Driven Contracts](https://martinfowler.com/articles/consumerDrivenContracts.html) |
| BDD / specification-by-example | Aligns testing with behavior, examples, and acceptance criteria | Useful for cross-functional alignment and executable requirements | Not sufficient alone as a whole testing strategy | [Cucumber BDD](https://cucumber.io/docs/bdd/) |
| Tool-vendor guidance (Playwright, Cypress, Selenium, etc.) | Implementation guidance packaged around specific tools | Concrete and actionable for a chosen stack | Usually biased toward one test layer and vendor workflow | [Playwright](https://playwright.dev/docs/best-practices), [Selenium](https://www.selenium.dev/documentation/test_practices/) |
| Test-management/reporting platforms | Coordinate runs, reporting, evidence, and status across teams | Helps with auditability, reporting, and centralized visibility | Does not solve the core “what should we test?” decision well; often high-overhead | [PractiTest](https://www.practitest.com/state-of-testing/), [TestRail](https://www.testrail.com/state-of-testing/) |

## Categories
- **Conceptual portfolio models** — test pyramid, practical test pyramid, test trophy, testing quadrants.
- **Engineering-practice guidance** — Google-style anti-flake, hermetic testing, fast feedback, deterministic CI.
- **Architecture-aware strategy** — microservice testing, contract testing, API/service layering.
- **Governance-heavy templates** — risk-based strategy, ISTQB, formal test plans.
- **Behavior/specification approaches** — BDD, example mapping, acceptance-criteria-driven validation.
- **Tool-anchored guidance** — Playwright/Cypress/Selenium/Postman-style best practices.
- **Operational/reporting tools** — TestRail/PractiTest-style coordination platforms.

## What People Actually Use
In practice, teams mix multiple layers instead of following a pristine single model. They use a portfolio of unit + integration/service + selected browser/API checks, then coordinate release confidence in docs, chats, issue trackers, and spreadsheets. Browser/device labs and test-management tools help with execution or reporting, but the decision of *which* checks matter and *which* paths deserve blocking coverage often remains manual and context-heavy. Manual exploratory testing, smoke checklists, flaky-test quarantine, reruns, and release notes continue to coexist with automation ([Playwright](https://playwright.dev/docs/best-practices), [Selenium](https://www.selenium.dev/documentation/test_practices/), [PractiTest](https://www.practitest.com/state-of-testing/), [TestRail](https://www.testrail.com/state-of-testing/), [World Quality Report](https://www.capgemini.com/insights/research-library/world-quality-report/)).

## Frequency Ranking
1. **Test Pyramid / Practical Test Pyramid** — still the default shared mental model.
2. **Google-style “reduce E2E / control flake” guidance** — strongly cited for modern CI reality.
3. **Risk-based / enterprise strategy templates** — common in QA-led and regulated settings.
4. **Test Trophy / mostly integration** — especially popular in product/web engineering discussions.
5. **Testing Quadrants / planning models** — common in agile/test coaching.
6. **Microservice / contract-testing strategy** — recurring in service-heavy systems.
7. **BDD / example-driven strategy** — common for collaborative requirement validation.
8. **Tool-vendor best practices** — ubiquitous but narrower and more implementation-biased.

## Key Gaps
- Many sources explain **one layer** or **one philosophy**, but fewer help teams map change risk to the minimum convincing validation plan.
- Tool guidance often tells teams how to write tests, not how to decide *which* test layers matter.
- Formal test-strategy templates are often too heavyweight for fast-moving product teams.
- Real-world release confidence still depends on docs/checklists/manual judgment, but many strategy guides underplay that workflow reality.
- There is frequent confusion between **testing strategy**, **backend testing implementation**, **TDD workflow**, **debugging failing tests**, and **code-review feedback on evidence**.

## Contradictions
- **Marketed claim:** comprehensive automation can centralize quality and reduce manual effort.  
  **User reality:** teams still rely on spreadsheets, checklists, chat, and manual release coordination.
- **Marketed claim:** E2E coverage gives the most realistic confidence.  
  **User reality:** mature engineering guidance treats E2E overuse as a speed/flakiness trap and recommends using lower-cost layers first.
- **Marketed claim:** a test pyramid or trophy slogan is enough.  
  **User reality:** teams still need change-based rules, risk tiers, and exception language.
- **Marketed claim:** test management platforms solve strategy.  
  **User reality:** they help with reporting, but they rarely answer “what is enough validation for this change?”

## Key Insight
The strongest bounded role for `testing-strategies` is **not** to dump sample unit/integration/E2E code. It should act as the repo’s **risk-based validation-policy skill**: define the test-layer taxonomy, choose the minimum convincing validation plan for a change, control flake/cost/feedback-speed tradeoffs, and route implementation to neighboring skills like `backend-testing`, `test-driven-development`, `debugging`, and `code-review`.
