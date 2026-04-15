# Context: agent-browser modernization

## Workflow Context
`agent-browser` fits the clean-session verification lane: open a disposable browser, inspect stable page state, perform one action, then verify the outcome with explicit evidence. The strongest adjacent evidence comes from Playwright's emphasis on resilient locators and web-first assertions plus ARIA snapshots for semantically stable page-state checks, and from Stagehand's split between act / extract / observe rather than one giant browser blob.

Sources:
- https://playwright.dev/docs/locators
- https://playwright.dev/docs/best-practices
- https://playwright.dev/docs/aria-snapshots
- https://docs.stagehand.dev/introduction
- https://docs.stagehand.dev/basics/act
- https://docs.stagehand.dev/basics/extract
- https://docs.stagehand.dev/basics/observe

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| AI coding-agent operator | Run repeatable website checks and confirm real browser outcomes before reporting success | Intermediate |
| Web/frontend developer | Verify flows, forms, and UI states in a fresh reproducible session | Intermediate |
| QA / test workflow maintainer | Capture deterministic evidence and reduce flaky browser steps | Advanced |
| Agent-platform maintainer | Separate fresh-session checks from running-browser reuse, annotation, and plan review | Advanced |

## Current Workarounds
1. Use Playwright locators instead of brittle raw selectors or screenshots as the main reference layer.
2. Use ARIA/accessibility snapshots when semantic state matters more than raw DOM or pixels.
3. Persist auth state or browser profiles when login friction is unavoidable, then route those stateful flows into a different lane.
4. Fall back to screenshots, traces, or manual inspection when DOM/text verification is ambiguous.
5. Wrap browser commands with repo rules or hooks to enforce allowed domains, artifact capture, and post-action verification.

## Adjacent Problems
- Authenticated-session reuse is real but should stay in `playwriter`, not the fresh-session verification lane.
- Exact rendered-UI review is adjacent but belongs in `agentation`, not in the core verification skill.
- Generic browser automation / RPA is broader than the intended `agent-browser` boundary.
- Extraction and verification overlap, but extraction answers "what data is present?" while verification answers "did the intended state change happen?"

## User Voices
- Playwright docs strongly push users away from brittle selectors toward resilient locators and assertions, reflecting long-running flake complaints in browser automation.
- Browser-use and related agent-browser projects keep surfacing session/profile/remote-browser setup because operators repeatedly hit environment and auth consistency issues.
- Agent-browser-style tooling is most valued when it proves that a real page state changed, not when it tries to subsume every browser/runtime problem.

Source hubs:
- https://github.com/microsoft/playwright/issues
- https://github.com/browser-use/browser-use/issues
- https://github.com/browserbase/stagehand/issues
- https://docs.browser-use.com/customize/browser/session
- https://docs.browser-use.com/customize/browser/remote
