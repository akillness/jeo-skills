# Context: web-accessibility structural hardening

## Workflow Context
Accessibility remediation usually shows up after an automated scan, before release, and again during manual QA for critical flows. Primary guidance is consistent that scanners are only the start: W3C says tools help but some checks cannot be automated and require manual intervention (https://www.w3.org/WAI/test-evaluate/tools/), W3C Easy Checks separates tool-detectable failures from human judgment such as whether alt text is appropriate in context (https://www.w3.org/WAI/test-evaluate/preliminary/), and Accessibility Insights formalizes a split between automated checks and guided manual tests (https://accessibilityinsights.io/docs/web/overview/).

In practice the workflow is:
1. run a scanner or browser extension,
2. fix obvious semantics/label/contrast/ARIA issues,
3. manually verify keyboard, focus, route-change, and screen-reader behavior on important flows,
4. hand off a short remediation + verification packet for implementation or QA.

Client-routed apps make this boundary sharper because browser navigation feedback disappears. React Router explicitly asks what element receives focus after route changes and whether route changes are announced to screen-reader users (https://reactrouter.com/how-to/accessibility). Next.js ships a route announcer because client transitions otherwise hide page-change cues (https://nextjs.org/docs/architecture/accessibility). Gatsby’s user-research summary frames the same issue as recreating missing browser feedback through focus management and announcements (https://www.gatsbyjs.com/blog/2019-07-11-user-testing-accessible-client-routing/).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend engineer | Fix semantic HTML, keyboard/focus behavior, labels, ARIA, route-change behavior | Intermediate–advanced |
| Fullstack engineer | Connect component-level fixes to forms, auth flows, routed pages, and release checks | Intermediate |
| Design-system maintainer | Encode accessible defaults into primitives and shared patterns without absorbing every remediation ticket | Advanced |
| QA / accessibility reviewer | Run automated scans, keyboard passes, selective AT checks, and issue triage | Intermediate |
| Product / release owner | Decide which critical flows require manual verification before launch | Beginner–intermediate |

## Current Workarounds
1. **Scanner-first + manual follow-up** — teams use axe, Lighthouse, Accessibility Insights, or Pa11y for first-pass detection, then manually verify focus order, focus visibility, keyboard traps, route announcements, and alt-text quality.
2. **Browser-extension-assisted review** — Accessibility Insights and axe DevTools are used inside the browser as a bridge between raw scanner output and manual remediation (https://accessibilityinsights.io/docs/web/overview/, https://www.deque.com/axe/devtools/).
3. **Selective screen-reader spot checks** — teams reserve NVDA/JAWS or similar checks for dialogs, forms, error handling, and routed flows because full AT coverage is expensive (https://www.gov.uk/service-manual/helping-people-to-use-your-service/testing-for-accessibility).
4. **Spreadsheet / issue-doc tracking** — real teams still document accessibility review in spreadsheets, linked issue trackers, review docs, Storybook notes, and Figma references because automated reports do not fully capture manual verification or remediation ownership (https://github.com/GSA/px-benefit-finder/issues/373, https://github.com/department-of-veterans-affairs/va.gov-team/issues/134695).

## Adjacent Problems
- Broad UI polish, hierarchy, or consistency critiques often belong to `web-design-guidelines`, not `web-accessibility`.
- Reusable primitive API design, slot/variant structure, and component-family architecture belong to `ui-component-patterns` or `design-system`.
- Viewport adaptation and reflow planning belong to `responsive-design`, though reflow failures can become accessibility remediation when they affect semantics, touch targets, or keyboard/AT use.
- Routed app behavior creates overlap with framework/runtime decisions, but the accessibility skill should stay focused on remediation + verification rather than absorbing all router architecture.

## User Voices
> “Moving between routes does not reset the focus, which would occur on a server-side render. Is there a fix to reset the focus on route changes?” — React Router issue reporter (https://github.com/remix-run/react-router/issues/5210)

> “the screen reader does not announce the navigation change” — Next.js issue describing route-announcer gaps on some subpath navigations (https://github.com/vercel/next.js/issues/86660)

> “the clicked anchor remains focused after page change” — Next.js issue reporting unintuitive focus retention after client navigation (https://github.com/vercel/next.js/issues/33060)

> There are “multiple variations recommended in the industry” for accessible client routing, but “very little user research on those methods.” — Gatsby/Fable research summary (https://www.gatsbyjs.com/blog/2019-07-11-user-testing-accessible-client-routing/)
