# Solution Landscape: testing-strategies structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Test Pyramid / Practical Test Pyramid (Martin Fowler) | Heuristic framework for choosing cheaper layers first | Durable mental model; strong on layer selection and anti-overuse of broad E2E | Not an operational packet or gate policy by itself | Primary-source anchor for layer-mix reasoning |
| Google Testing Blog – end-to-end guidance | Policy argument against overusing E2E | Clear rationale for scoping E2E and favoring lower layers | Stops short of a reusable intake packet for change-based gate decisions | Primary-source evidence for “do not default to more E2E” |
| Playwright best practices | Browser-test guidance | Useful for keeping browser coverage scoped and maintainable | Focused on implementation hygiene, not repo-wide validation policy | Strong route-out target, not the policy front door |
| Selenium test practices | Browser/UI automation guidance | Reinforces deliberate automation practice and maintenance tradeoffs | Also implementation-heavy | Another route-out target |
| Pact / consumer-driven contracts | Interface-level proof for multi-service/API boundaries | Sharp solution when contract risk is the main concern | Only covers one validation layer | Belongs under policy-selected evidence, not as a universal strategy |
| CloudBees Smart Tests / Launchable predictive selection | AI-assisted test selection and prioritization | Speeds CI by picking likely-failing tests and surfacing flaky/slow patterns | Vendor tool still needs human gate policy and confidence thresholds | Source: CloudBees Smart Tests page + Launchable docs/search results |
| BuildPulse | Flaky-test analytics, quarantine, impact metrics | Strong on flake detection, quarantine, and CI analytics | Solves noise-management more than the whole validation policy | Source: BuildPulse site/search results |
| Release checklist / QA signoff templates | Checklist-based substitute | Easy to adopt for release coordination and manual signoff | Often lives outside change-based strategy; can hide unclear layer decisions | Search results show many checklist-driven alternatives |

## Categories
- **Foundational heuristics:** Test Pyramid, Practical Test Pyramid, Google testing guidance
- **Layer-specific tools:** Playwright, Selenium, Pact
- **CI optimization / flaky-suite tooling:** CloudBees Smart Tests / Launchable, BuildPulse
- **Operational substitutes:** release checklists, QA signoff templates, regression tracking sheets

## What People Actually Use
In practice, teams blend a lightweight strategy heuristic with operational workarounds: selective integration/contract tests for risky changes, narrow smoke checks for release-critical paths, flaky-test quarantine rules, and checklist-style release signoff. Vendor tools help with flaky detection or predictive selection, but the day-to-day decision still starts with a human asking what change happened, what evidence already exists, and whether the next owner is test implementation, debugging, review, or release operations.

## Frequency Ranking
1. **Foundational strategy content** (test pyramid, risk-based layering, anti-E2E sprawl) appears most consistently across primary guidance.
2. **Flaky-test handling / quarantine** shows up repeatedly in community snippets and vendor positioning.
3. **Predictive test selection / Smart Tests** appears as the main productized optimization lane.
4. **Release checklist / QA signoff** appears as the common substitute when a true change-based strategy packet is missing.

## Key Gaps
- Most sources explain principles or sell tooling, but few normalize the incoming packet into a small decision contract an agent can use.
- Flaky-test tools assume someone already decided blocking vs informational gates and quarantine rules.
- Release checklist content usually sits adjacent to, not inside, the test-layer decision.
- Browser and API tooling focus on implementation detail, leaving the policy router ambiguous.

## Contradictions
- Marketed claim: more automation and smarter tooling make validation straightforward. Reality: teams still debate which layer deserves trust and when manual or release-only checks are the honest answer.
- Marketed claim: flaky-test platforms solve the pain. Reality: community snippets still emphasize reruns, quarantine windows, and root-cause follow-up as policy work, not just tooling.
- Marketed claim: E2E proves confidence. Reality: primary guidance and discussion snippets both keep warning against broad always-on E2E gates.

## Key Insight
The structural gap is not missing test tools; it is missing **packet-first policy routing**. The strongest reusable improvement for `testing-strategies` is to start from the validation packet already in hand—change-risk question, merge-gate debate, flaky-suite problem, release-readiness checklist, or escaped-bug ratchet—then produce one concise brief and route implementation, debugging, review, accessibility, or performance work outward.
