---
name: responsive-design
description: >
  Plan mobile-first, container-aware responsive layouts before patching breakpoints
  everywhere. Use when the user needs help fixing overflow, wrapping, layout
  collapse, responsive media, breakpoint strategy, container queries, or deciding
  what should adapt at the viewport level versus inside a component/container.
  Triggers on: responsive layout, mobile-first, breakpoint bug, overflow on mobile,
  card wraps badly, table on small screens, container query, responsive image,
  layout collapse, and reflow.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for modern web/frontend/fullstack repos using CSS, utility frameworks, or
  component libraries. Not for reusable component API design, broad UI-polish
  audits, or accessibility remediation as the primary task.
license: MIT
metadata:
  tags: responsive, mobile-first, layout, container-queries, breakpoints, frontend, css, reflow
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# Responsive Design

Use this skill when the main question is **"how should this interface adapt across screen sizes or container sizes, and how do we verify it without turning the codebase into breakpoint soup?"**

This skill is not a generic CSS tutorial.
It should:
1. classify the responsive problem,
2. choose the right adaptation surface,
3. keep viewport and container decisions explicit,
4. call out verification requirements early,
5. route neighboring concerns to the right frontend skill.

Read [references/layout-decision-checklist.md](references/layout-decision-checklist.md) before designing or refactoring a responsive layout.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `responsive-design`, `ui-component-patterns`, `web-accessibility`, `design-system`, or `web-design-guidelines` should own the next step.

## When to use this skill
- Fix layouts that overflow, wrap badly, collapse awkwardly, or force horizontal scrolling on smaller screens
- Plan mobile-first page, dashboard, card-grid, form, nav, table, or media layouts
- Decide whether a change belongs in viewport breakpoints, container queries, intrinsic layout rules, or responsive media behavior
- Review whether a layout is overfitted to one screen size or relying on too many one-off overrides
- Turn vague requests like “this page breaks on mobile” into a concrete responsive strategy and verification plan
- Define responsive test cases for zoom/reflow, content density, and breakpoints
- Add container-query thinking to reusable UI without turning every problem into a component-API rewrite

## When not to use this skill
- **The main task is reusable primitive / variant / slot API design** → use `ui-component-patterns`
- **The main task is keyboard/focus behavior, semantics, labels, contrast, reduced motion, or manual a11y remediation** → use `web-accessibility`
- **The main task is system-wide tokens, breakpoint policy across many products, naming rules, or contribution governance** → use `design-system`
- **The main task is broad UI critique, design polish, or interface-guideline review** → use `web-design-guidelines`
- **The task is mostly React/Next.js performance, hydration, or rerender behavior** → use `react-best-practices`
- **The layout adaptation rules are already clear and the job is just implementation**; in that case implement directly instead of reopening the architecture decision

## Instructions

### Step 1: Classify the responsive failure before writing CSS
Do not start with “add another breakpoint.”

First decide which kind of problem you have:
- **Viewport adaptation** — page/grid/nav/layout changes because the available screen width changes
- **Container adaptation** — a component needs to behave differently depending on the width of its parent, not the whole viewport
- **Content-density stress** — real text, tables, cards, filters, or localized strings do not fit the assumed layout
- **Media adaptation** — images/video/embeds crop, distort, or download the wrong asset size
- **Verification failure** — the layout might look fine at one browser width but fail under zoom, reflow, or narrower containers

Quick framing template:
```markdown
Responsive problem:
- Surface: dashboard table + filter toolbar
- Failure mode: horizontal scrolling on mobile and at 400% zoom
- Likely owner: responsive-design
- Related handoff: web-accessibility for reflow verification, ui-component-patterns only if the toolbar primitive API is wrong
```

### Step 2: Choose the adaptation surface deliberately
Use the smallest surface that actually owns the behavior.

#### Use viewport rules when
- the whole page or major layout region changes with screen size
- navigation, sidebars, page columns, or full-page density shifts are involved
- the layout decision should be consistent across many containers on the page

#### Use container rules when
- a reusable card, panel, or embedded module appears in multiple widths
- the component should adapt based on the width of its parent, not the browser window
- the same component can appear in a sidebar, feed, modal, or dashboard slot

#### Use intrinsic/flexible layout first when possible
Prefer layouts that naturally adapt before adding more conditions:
- fluid widths
- `minmax()` / auto-fit grid
- wrapping flex rows
- sensible `max-width`
- text wrapping / line length constraints
- content-driven sizing

If intrinsic layout solves the problem, do not create a tower of breakpoints.

### Step 3: Start from a mobile-first baseline
Mobile-first is still the safest default for feature delivery.

Healthy baseline rules:
- define the smallest-screen/default layout first
- add complexity only when the space is actually available
- treat larger layouts as progressive enhancement
- write breakpoints around layout pressure, not device brand names

Bad pattern:
```css
@media (max-width: 1024px) { ... }
@media (max-width: 992px) { ... }
@media (max-width: 991px) { ... }
@media (max-width: 768px) { ... }
@media (max-width: 767px) { ... }
```

Better pattern:
```css
.dashboard {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

@media (min-width: 48rem) {
  .dashboard {
    grid-template-columns: 18rem minmax(0, 1fr);
  }
}
```

Use fewer breakpoints with clearer reasons.

### Step 4: Use container queries when the component’s parent drives the layout
Container queries are not for every problem, but they are the clean answer when viewport rules create brittle component reuse.

Use them when:
- a card or panel is reused in multiple column widths
- a component should switch density/layout based on the slot it lives in
- the same module appears in a feed, sidebar, modal, or dashboard area

Pattern:
```css
.card-shell {
  container-type: inline-size;
}

.card {
  display: grid;
  gap: 0.75rem;
}

@container (width > 42rem) {
  .card {
    grid-template-columns: 12rem minmax(0, 1fr);
    align-items: start;
  }
}
```

Do not use container queries to hide a confused component API. If the real issue is primitive structure, route to `ui-component-patterns`.

### Step 5: Plan for common responsive pressure points
#### Navigation
Prioritize wrapping, overflow handling, menu trigger behavior, and content hierarchy. Avoid nav bars that only work at one label length.

#### Forms and toolbars
Prioritize field stacking, button grouping, label/help/error space, and real text length under smaller widths.

#### Tables and data-heavy views
Prioritize what must remain tabular versus what can stack, collapse, scroll, summarize, or switch presentation. Reflow exceptions can exist, but make them intentional.

#### Cards, grids, and feeds
Prioritize intrinsic column behavior, readable line lengths, and whether cards should adapt to their container.

#### Media and embeds
Prioritize aspect ratio, crop strategy, object-fit, `srcset` / `sizes`, and whether the layout depends on art direction.

#### Typography and density
Prioritize readable line lengths, spacing scale, wrapping, and hierarchy; fluid type can help, but do not let it replace layout thinking.

### Step 6: Treat accessibility and reflow as verification requirements, not afterthoughts
Responsive design is not just about “looks okay when resized.”

Always check:
- does content avoid unnecessary two-dimensional scrolling?
- do long labels, localization, and user zoom break the layout?
- do controls remain reachable and readable?
- does the layout still make sense at narrow widths and high zoom?

If the main work becomes semantic remediation, touch-target fixes, keyboard/focus behavior, or manual accessibility verification, route to `web-accessibility`.

### Step 7: Keep neighboring concerns as route-outs, not ownership theft
This skill should acknowledge nearby work without absorbing it.

Examples:
- if a responsive problem comes from an overstuffed reusable primitive, route API redesign to `ui-component-patterns`
- if the team needs one breakpoint/token policy across many apps, route governance to `design-system`
- if the request is “audit this whole interface,” route broad critique to `web-design-guidelines`
- if reflow issues become accessibility remediation, route verification/fixes to `web-accessibility`

Mixed requests are normal. Split them explicitly instead of forcing one skill to own everything.

### Step 8: Produce the responsive strategy packet
End with a concise artifact another engineer or agent can execute.

Preferred format:
```markdown
# Responsive Strategy Packet

## Surface
- Page / component / container:
- Failure mode:
- Primary owner:

## Layout strategy
- Mobile-first baseline:
- Viewport breakpoints:
- Container-query usage:
- Intrinsic layout rules:
- Media behavior:

## Boundaries
- Keeps:
- Routes to neighboring skills:

## Verification
- Narrow-width checks:
- Zoom/reflow checks:
- Overflow/wrapping checks:
- Responsive media checks:
```

## Examples

### Example 1: Dashboard overflow on mobile
**Input:** “This analytics dashboard looks fine on desktop but the filter bar and table break on mobile.”

**Good output direction:**
- classify the problem as page-level layout + data-view adaptation
- keep a mobile-first single-column baseline
- decide whether the table needs intentional horizontal scroll, summarization, or a stacked representation
- include zoom/reflow verification and route semantic remediation to `web-accessibility` if needed

### Example 2: Reusable card in many widths
**Input:** “The same product card appears in a sidebar, a 2-column grid, and a full-width feed. Should we keep adding viewport breakpoints?”

**Good output direction:**
- classify the problem as container-driven adaptation
- recommend container queries or intrinsic layout rules at the card-shell boundary
- keep primitive API questions routed to `ui-component-patterns`
- avoid adding page-level breakpoints when the parent slot is the real driver

### Example 3: System-wide breakpoint debate
**Input:** “Our teams all use different breakpoints and spacing rules. Is this a responsive-design issue?”

**Good output direction:**
- explain that cross-app breakpoint and token policy is broader `design-system` work
- preserve `responsive-design` for local/page/component adaptation strategy
- suggest a clean handoff instead of over-triggering this skill

## Best practices
1. Prefer intrinsic layout and content-driven sizing before reaching for many breakpoint overrides.
2. Use mobile-first defaults and add complexity only where space genuinely changes the job to be done.
3. Use container queries when the component’s parent width matters more than the viewport width.
4. Write verification steps for overflow, wrapping, zoom/reflow, and responsive media instead of relying on visual guesswork.
5. Treat tables, nav, forms, and filter bars as high-risk responsive surfaces that need explicit decisions.
6. Route component API redesign to `ui-component-patterns`, not to more CSS.
7. Route accessibility-heavy remediation to `web-accessibility`, especially when reflow and usability failures dominate.

## References
- [MDN — Responsive web design](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design)
- [MDN — CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)
- [Tailwind CSS — Responsive design](https://tailwindcss.com/docs/responsive-design)
- [W3C WAI — Understanding SC 1.4.10 Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html)
