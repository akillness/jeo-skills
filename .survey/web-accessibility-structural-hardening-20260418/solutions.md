# Solution Landscape: web-accessibility structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| axe / axe-core | Embedded automated rules in browser/tests/CI | Fits existing dev workflows, catches many structural issues quickly, returns `incomplete` for manual follow-up | Does not cover full keyboard/screen-reader/task-completion reality; false positives still consume review time | Dominant shift-left automation layer; README says it finds on average 57% of WCAG issues automatically (https://github.com/dequelabs/axe-core) |
| Lighthouse accessibility audits | Browser/CI page audit | Fast smoke test; already present in many perf/quality workflows | Score is easy to over-trust; important checks still manual | Lighthouse docs keep a separate manual-check list for tab order, trapped focus, focus movement, and DOM/visual order (https://developer.chrome.com/docs/lighthouse/accessibility/scoring) |
| Accessibility Insights for Web | Browser extension with automated + guided manual tests | Strong bridge between scanner output and manual verification; explicit tab-stop workflow | Still not a substitute for expert/manual review across all flows | Official docs position FastPass + Assessment together (https://accessibilityinsights.io/docs/web/overview/) |
| Pa11y / Pa11y CI / Dashboard | URL-based CLI/CI/dashboard monitoring | Good for repeated route scans and trend tracking | Brittle with auth, dynamic content, and timing-sensitive SPAs | Issue history shows repeated friction with fully loaded Angular/SPA pages and auth handling (https://github.com/pa11y/pa11y/issues/515, https://github.com/pa11y/pa11y/issues/195, https://github.com/pa11y/pa11y/issues/410) |
| W3C / GOV.UK / design-system guidance | Manual evaluation methods and component-level rules | Best source for manual verification and durable component hardening patterns | Not a one-command solution; requires judgment and documentation discipline | Useful for the packet/checklist layer that tools alone cannot provide |

## Categories
- **Embedded automation** — axe-core, editor linting, extension checks inside dev/test workflows
- **Browser-integrated audits** — Lighthouse and Accessibility Insights for fast page review plus guided manual steps
- **CI/dashboard scanning** — Pa11y-style route scanning and trend tracking
- **Manual verification frameworks** — W3C Easy Checks, WCAG-EM, GOV.UK testing guidance
- **Design-system hardening** — component and pattern guidance that prevents repeated issues before audits

## What People Actually Use
Real workflows still combine automated scanners, browser extensions, keyboard walkthroughs, selective screen-reader checks, and external tracking docs. Teams commonly use browser tools for triage, then fall back to manual tab-order/focus/announcement checks and log the results in issues, review docs, spreadsheets, Storybook notes, or design-system review artifacts. Accessibility work remains a remediation + verification discipline, not a scanner-only discipline.

## Frequency Ranking
1. axe / axe-core
2. Lighthouse
3. Manual WAI-guided checks
4. Accessibility Insights
5. Pa11y / Pa11y CI / Dashboard
6. Design-system accessibility checklists

## Key Gaps
- Automated tooling still leaves keyboard flow, focus return, route-change announcements, alternative-text usefulness, and screen-reader quality under manual ownership.
- Teams lack a clean front door that turns scanner findings and vague “make this accessible” requests into one bounded remediation + verification packet.
- Adjacent frontend boundaries remain easy to blur: broad UI critique, responsive layout decisions, component-API design, and system governance frequently leak into accessibility work unless the skill routes them explicitly.
- Routed web apps create a persistent workflow gap because client transitions remove browser feedback and force explicit focus/announcement decisions.

## Contradictions
- Marketed automation promises accessibility coverage, but official docs from W3C, Accessibility Insights, Lighthouse, and Deque all preserve manual follow-up as essential.
- Teams often want a single accessibility score, but practical evidence shows they still maintain spreadsheets, issue templates, Storybook reviews, and AT spot checks to finish the job.
- Scanner tools are framed as objective quality gates, yet issue trackers show recurring false positives, SPA timing friction, and auth-boundary gaps.

## Key Insight
The strongest bounded improvement is not another accessibility helper skill. It is tightening `web-accessibility` itself into a routing-first front door that starts from the remediation packet teams actually have — scanner findings, keyboard/focus bugs, routed-flow announcement failures, or release-audit checklists — then keeps manual verification explicit while routing broader design, layout, and component-architecture work outward.

## Curated Sources
- https://www.w3.org/WAI/test-evaluate/
- https://www.w3.org/WAI/test-evaluate/preliminary/
- https://developer.chrome.com/docs/lighthouse/accessibility/scoring
- https://accessibilityinsights.io/docs/web/overview/
- https://github.com/dequelabs/axe-core
- https://www.deque.com/axe/devtools/
- https://pa11y.org/
- https://github.com/pa11y/pa11y-ci
- https://github.com/igordutra/pa11y-dashboard-nextgen/issues/40
- https://www.gov.uk/service-manual/helping-people-to-use-your-service/testing-for-accessibility
