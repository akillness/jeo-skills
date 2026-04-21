---
name: responsive-design
description: >
  Routing-first responsive layout strategy and verification for web interfaces. Use
  when the main job is classifying whether the failure is page-shell adaptation,
  reusable component/container behavior, dense-data or toolbar pressure,
  responsive media, or reflow verification — then turning vague “breaks on
  mobile” requests into one concrete strategy packet. Route component API design
  to `ui-component-patterns`, accessibility remediation to `web-accessibility`,
  system-wide breakpoint/token governance to `design-system`, and broad UI audit
  work to `web-design-guidelines`.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for frontend and fullstack web repos using CSS, utility frameworks, or
  component libraries where the main task is responsive layout strategy or
  verification. Not for reusable component API architecture, broad UI polish
  reviews, or accessibility-heavy remediation as the primary owner.
license: MIT
metadata:
  tags: responsive, mobile-first, layout, container-queries, breakpoints, frontend, css, reflow
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1.0"
  source: akillness/oh-my-skills
  modernization: 2026-04-13
  hardening: 2026-04-19
---

# Responsive Design

Use this skill when the job is to **name the failing responsive surface, choose the smallest viable adaptation packet, and leave behind a short strategy + verification brief**.

The job is not to dump generic CSS recipes, paste framework snippets, or absorb every neighboring frontend concern.

This skill should:
1. classify the responsive failure first,
2. choose one primary responsive packet,
3. keep viewport vs container ownership explicit,
4. separate dense-data and media cases from generic layout advice,
5. keep reflow/verification visible,
6. route neighboring frontend work honestly.

Read these support docs first:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/layout-decision-checklist.md](references/layout-decision-checklist.md)
- [references/handoff-boundaries.md](references/handoff-boundaries.md)

## When to use this skill
- A team says “this page breaks on mobile” and the real responsive surface is still unclear.
- A dashboard, nav, form, card grid, pricing page, table, or embed needs a responsive strategy before more breakpoints are added.
- You need to decide whether the fix belongs in viewport layout rules, container queries, intrinsic layout, responsive media handling, or verification/reflow follow-up.
- A launch-readiness pass uncovered overflow, wrapping, density, or zoom/reflow failures and someone needs one bounded packet instead of a CSS lecture.
- The request mixes page-level adaptation, component reuse, and dense-data pressure and needs routing before implementation.

## When not to use this skill
- **The main task is reusable primitive / slot / variant API design or component-family ownership** → `ui-component-patterns`
- **The main task is keyboard/focus behavior, semantics, labels, contrast, reduced motion, or accessibility-heavy remediation** → `web-accessibility`
- **The main task is breakpoint governance, token policy, or cross-product responsive standards** → `design-system`
- **The main task is broad UI critique, polish, heuristic review, or launch-readiness audit across many dimensions** → `web-design-guidelines`
- **The main task is React hydration, rerender churn, or client-boundary performance behavior** → `react-best-practices`
- **The responsive strategy is already clear and the job is just implementation**; in that case implement directly instead of re-running the router

## Instructions

### Step 1: Frame the responsive job before naming CSS
Capture the minimum intake packet first.

```yaml
responsive_intake:
  surface: page-shell | nav | form | table | dashboard | card-grid | media-embed | component-slot | mixed | unknown
  workflow_type: bug-fix | refactor-plan | launch-readiness | review-follow-up | design-handoff | unknown
  primary_packet: page-layout | component-slot | dense-data | media-behavior | verification-reflow | mixed | unknown
  pressure_source: viewport-width | parent-container | content-density | localization-copy | zoom-reflow | mixed | unknown
  signal_source: bug-report | screenshot | browser-resize | qa-review | design-review | a11y-review | mixed | unknown
  confidence: high | medium | low
```

Rule: do **not** start with “add another breakpoint.” First label the failing responsive surface.

### Step 2: Choose exactly one primary responsive packet
Use the router in [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Primary packets:
1. `page-layout`
2. `component-slot`
3. `dense-data`
4. `media-behavior`
5. `verification-reflow`

Pick the highest-leverage packet for the current decision. List anything else as follow-up, not as equal co-owners.

### Step 3: Keep the invariants visible
These rules survive every answer:
- mobile-first defaults are still the safest baseline for feature delivery
- intrinsic layout beats breakpoint sprawl when it solves the problem cleanly
- viewport rules own page-shell changes; container rules own reusable slot adaptation
- breakpoints should reflect content pressure, not device brand names
- dense tables/toolbars are special cases and often need explicit fallback choices
- responsive media needs intentional `srcset` / `sizes` / aspect-ratio thinking, not just width: 100%
- zoom/reflow and long-copy stress are verification requirements, not afterthoughts

### Step 4: Build the responsive strategy packet
Return this structure:

```markdown
# Responsive Strategy Packet

## Scope
- Surface:
- Workflow type:
- Primary packet:
- Confidence: high | medium | low

## Current signal
- Main symptom:
- Pressure source:
- What is already known:
- What still needs direct verification:

## Recommended first slice
1. ...
2. ...
3. ...

## Layout decisions
- Mobile-first baseline:
- Intrinsic layout rules:
- Viewport query layer:
- Container-query usage:
- Dense-data / media fallback:

## Verification plan
- Narrow-width checks:
- Zoom / reflow checks:
- Overflow / wrapping checks:
- Content-density / localization checks:

## Ownership and route-outs
- Primary owner:
- Adjacent skills / teams:
```

### Step 5: Use the packet, not a giant CSS tutorial
Pull the packet from [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Packet rules:
- `page-layout` → page shell, nav/sidebar shifts, grid columns, spacing density, viewport breakpoints
- `component-slot` → reusable card/panel/module behavior that changes by parent width; container queries or intrinsic component rules
- `dense-data` → tables, toolbars, filter bars, dashboards, and intentional fallback choices such as summary, disclosure, or horizontal scroll
- `media-behavior` → image/video/embed sizing, `srcset` / `sizes`, aspect ratio, crop strategy, and art-direction edge cases
- `verification-reflow` → zoom, reflow, overflow, long labels, localization, and screenshot-vs-manual follow-up before release

### Step 6: Separate mechanism choice from ownership choice
Use this split in every serious answer:
- **Mechanism** — intrinsic layout, viewport queries, container queries, responsive media rules, fallback presentation
- **Ownership** — `responsive-design`, `ui-component-patterns`, `web-accessibility`, `design-system`, `web-design-guidelines`, or `react-best-practices`

If the request starts from a screenshot, QA note, or “mobile is broken” report, say explicitly that the screenshot is the **signal artifact**, not the finished responsive strategy.

### Step 7: Route adjacent work explicitly
Use these route-outs when the problem crosses boundaries:

| If the real job is... | Route to... |
|---|---|
| reusable primitive API, variant sprawl, slot ownership, component structure | `ui-component-patterns` |
| semantics, keyboard/focus, labels, contrast, motion, or accessibility-heavy remediation | `web-accessibility` |
| shared breakpoint tokens, system-wide density rules, cross-product frontend standards | `design-system` |
| broad launch-readiness UI critique, hierarchy, polish, or heuristic review | `web-design-guidelines` |
| hydration, rerender churn, client-boundary cost, or runtime performance | `react-best-practices` |

## Output expectations
A strong answer from this skill should:
1. identify the **primary responsive packet**,
2. recommend one bounded adaptation strategy,
3. name the **manual verification still required**,
4. avoid treating framework helpers as a complete strategy,
5. route broader frontend ownership questions outward instead of absorbing them.

## Examples

### Example 1: dashboard overflow on mobile
**Input**
> Our dashboard filter bar and data table force horizontal scrolling on mobile. Help us fix the responsive behavior.

**Output direction**
- choose `dense-data`
- keep a mobile-first shell but make the table/toolbar fallback intentional
- include zoom/reflow verification and long-label checks
- route accessibility-heavy remediation to `web-accessibility` if it becomes the main issue

### Example 2: reusable card in many slots
**Input**
> The same card lives in a sidebar, a feed, and a 2-column grid. Should we use container queries or more viewport breakpoints?

**Output direction**
- choose `component-slot`
- explain why parent-container width is the main driver
- recommend container queries or intrinsic layout at the card-shell boundary
- route primitive/API redesign to `ui-component-patterns` if the structure itself is wrong

### Example 3: pricing page before launch
**Input**
> Review this pricing page before launch. Cards feel cramped on mobile and the hero wraps badly.

**Output direction**
- keep `responsive-design` on the layout-adaptation slice only
- produce one packet for page layout plus dense mobile sections
- route broader hierarchy / CTA / polish review to `web-design-guidelines`
- keep accessibility remediation separate unless it becomes primary

### Example 4: system-wide breakpoint debate
**Input**
> Our teams all use different breakpoint and spacing rules across products. Is responsive-design the right skill?

**Output direction**
- explain that shared breakpoint/token governance is broader `design-system` work
- keep `responsive-design` narrower than cross-product standards
- avoid over-triggering on governance-only requests

### Example 5: zoom and reflow failure
**Input**
> This form still breaks at 400% zoom and keyboard users lose context. Should we keep fixing it in responsive-design?

**Output direction**
- choose `verification-reflow` first if layout ownership is still unclear
- include zoom/reflow verification explicitly
- route keyboard/focus remediation to `web-accessibility`
- split the work instead of forcing one skill to own everything

## Best practices
1. Start with the failing responsive surface, not the syntax trick.
2. Prefer intrinsic layout before adding another breakpoint.
3. Keep viewport and container ownership explicit.
4. Treat tables, toolbars, and dense dashboards as packet-worthy special cases.
5. Treat screenshots and device-mode checks as inputs, not proof of completion.
6. Keep verification honest: zoom, reflow, long copy, and overflow still matter.
7. When unsure, route neighboring frontend work explicitly instead of inflating this skill.

## References
- [MDN: Responsive design](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design)
- [MDN: Using media queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries)
- [MDN: Container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)
- [MDN: Responsive images](https://developer.mozilla.org/en-US/docs/Learn/HTML/Multimedia_and_embedding/Responsive_images)
- [web.dev: Learn Responsive Design](https://web.dev/learn/design)
- [W3C WAI: Understanding Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html)
