# Context: web-accessibility modernization

## Workflow Context
Accessibility work shows up in at least three distinct frontend moments that the current repo splits poorly:
1. **Implementation-time remediation** — semantic HTML, keyboard support, focus management, labels, and ARIA fixes inside components and flows.
2. **Audit/review time** — running automated scans plus manual checks to decide what is broken and what to fix next.
3. **System-level handoff** — routing between component APIs, responsive behavior, design-system conventions, and accessibility-specific remediation.

Primary source guidance points to a mixed workflow instead of a single-tool answer:
- W3C says accessibility evaluation is also called assessment, audit, and testing, and that **"no tool alone can determine if a site meets accessibility standards"**. Source: https://www.w3.org/WAI/test-evaluate/
- web.dev says manual accessibility testing finds issues **"automated tooling cannot"** and that both manual and assistive-technology checks need to be added to testing protocols. Source: https://web.dev/learn/accessibility/test-manual
- web.dev frames accessibility testing as a **three-step process**: automated, manual, and assistive-technology testing. Source: https://web.dev/learn/accessibility/test-automated
- MDN emphasizes that keyboard accessibility affects not just screen-reader users but also people who cannot or do not use a pointing device. Source: https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Keyboard

In the repo, the current `web-accessibility` skill tries to cover implementation, review, and examples all at once. Nearby skills also claim overlapping territory:
- `web-design-guidelines` explicitly triggers on "check accessibility" and UI review.
- `ui-component-patterns` owns reusable component API design.
- `responsive-design` owns viewport/breakpoint adaptation.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend developer | Fix semantic HTML, labels, ARIA, focus, and keyboard behavior in product code | Intermediate |
| Design-system / component-library owner | Build accessible primitives and compound widgets that teams reuse | Intermediate to advanced |
| Reviewer / QA / PM | Run accessibility audits, prioritize issues, and verify fixes | Beginner to intermediate |
| Agent maintaining a skill catalog | Decide whether to activate remediation, review, component, or layout skills | Intermediate |

## Current Workarounds
1. Use automated tooling first (`axe`, Lighthouse, Pa11y, Accessibility Insights), then manually check keyboard order, focus visibility, labels, and content behavior.
2. Treat generic WCAG checklists as the default operating model, then patch in framework-specific fixes by hand.
3. Bounce between overlapping repo skills: `web-design-guidelines` for audits, `ui-component-patterns` for reusable widgets, `responsive-design` for layout, and `web-accessibility` for everything else.
4. Rely on long example-heavy guidance instead of a decision-first boundary that says whether the job is remediation, audit, or adjacent frontend work.

## Adjacent Problems
- Accessibility review gets conflated with general UI/UX/design review.
- Component API work gets conflated with accessibility remediation, even when the real problem is reusable primitive design.
- Responsive/mobile layout work gets conflated with accessibility, even when the root cause is viewport behavior rather than WCAG support.
- Tooling choice gets overstated unless the skill reminds users that automated checks are necessary but insufficient.

## User Voices
- W3C: **"However, no tool alone can determine if a site meets accessibility standards."** Source: https://www.w3.org/WAI/test-evaluate/
- web.dev: **"Manual accessibility testing uses keyboard, visual, and cognitive tests, tools, and techniques to find issues that automated tooling cannot."** Source: https://web.dev/learn/accessibility/test-manual
- web.dev: **"Each test, automated, manual, and assistive technology, is critical to achieving the most accessible product possible."** Source: https://web.dev/learn/accessibility/test-automated
- MDN: **"To be fully accessible, a web page must be operable by someone using only a keyboard to access and control it."** Source: https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Keyboard
