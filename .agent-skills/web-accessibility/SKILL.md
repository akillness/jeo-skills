---
name: web-accessibility
description: >
  Routing-first skill for web accessibility remediation and verification. Use when
  the main job is classifying which accessibility surface is failing — semantics,
  keyboard/focus, labels/announcements, visual perception/reflow, media
  alternatives, or routed-app navigation feedback — and turning vague audit,
  WCAG, axe/Lighthouse, or "make this accessible" requests into one concrete
  remediation packet. Route broad UI critique to `web-design-guidelines`,
  component API architecture to `ui-component-patterns`, responsive layout
  strategy to `responsive-design`, and system governance to `design-system`.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for frontend and fullstack web work where the primary task is
  accessibility remediation or manual-vs-automated verification. Not for broad
  UI polish reviews, reusable component API architecture, or viewport-first
  layout strategy as the main owner.
license: MIT
metadata:
  tags: accessibility, a11y, wcag, aria, keyboard-navigation, focus-management, screen-reader, frontend
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1.0"
  modernization: 2026-04-13
  hardening: 2026-04-18
  source: akillness/jeo-skills
---

# Web Accessibility

Use this skill when the job is to **name the failing accessibility surface, fix it at the right layer, and leave behind a short remediation + verification packet**.

The job is not to dump generic WCAG prose, paste raw scanner output, or absorb every neighboring frontend concern.

This skill should:
1. classify the failing accessibility surface,
2. separate automated findings from manual or assistive-technology follow-up,
3. choose the smallest credible remediation packet,
4. keep routed-app feedback and focus behavior explicit,
5. route broader design/layout/component-governance work honestly.

Read these support docs first:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/audit-remediation-checklist.md](references/audit-remediation-checklist.md)
- [references/handoff-boundaries.md](references/handoff-boundaries.md)

## When to use this skill
- A team says “make this accessible” and the missing accessibility surface is still unclear
- axe, Lighthouse, Accessibility Insights, Pa11y, QA notes, or user reports need to be turned into one remediation plan instead of a raw finding dump
- You need to decide whether the main issue is semantics, keyboard/focus, labels/announcements, reflow/contrast/motion, media alternatives, or routed-app navigation feedback
- A modal, form, nav, menu, table, dashboard, or routed flow needs manual-vs-automated verification guidance before release
- Screen-reader, keyboard-only, or zoom/reflow issues are suspected, but ownership and next checks are unclear

## When not to use this skill
- **The main task is broad UI polish, heuristic review, hierarchy, or interface consistency** → `web-design-guidelines`
- **The main task is reusable primitive / slot / variant API design or component-family ownership** → `ui-component-patterns`
- **The main task is viewport adaptation, breakpoint strategy, container-query planning, or layout overflow control** → `responsive-design`
- **The main task is token governance, contribution rules, or system-wide frontend standards** → `design-system`
- **The task is only to run one tool and paste raw results**; run the tool directly, then return here to prioritize remediation and manual follow-up

## Instructions

### Step 1: Frame the accessibility job before naming fixes
Capture the minimum packet first.

```yaml
accessibility_intake:
  surface: page | routed-flow | modal | form | nav | menu | table | dashboard | component-family | mixed | unknown
  workflow_type: audit-review | remediation-pass | release-readiness | regression-follow-up | user-reported-bug | design-system-follow-up
  signal_source: axe | lighthouse | accessibility-insights | pa11y | manual-qa | screen-reader-report | user-feedback | mixed | unknown
  primary_surface: semantics | keyboard-focus | labels-announcements | visual-perception-reflow | media-alternatives | routed-navigation-feedback | mixed | unknown
  severity: blocker | major | medium | low | unknown
  ownership: app-team | frontend-platform | design-system | qa-accessibility | shared | unknown
```

Rule: do **not** start with “add ARIA,” “run axe again,” or “quote WCAG 2.1.”
First label the failing accessibility surface.

### Step 2: Choose exactly one primary remediation packet
Use the router in [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Primary packets:
1. `semantics-structure`
2. `keyboard-focus`
3. `labels-announcements`
4. `visual-perception-reflow`
5. `media-alternatives`
6. `routed-navigation-feedback`

Pick the **highest-risk user-facing failure** as primary.
List everything else as follow-up, not as equal co-owners.

### Step 3: Keep the invariants visible
These rules survive every answer:
- automated tools accelerate discovery, but they do not prove accessibility completeness
- native HTML semantics beat ARIA patching when native controls already solve the problem
- keyboard/focus failures in interactive flows usually outrank cosmetic cleanups
- routed apps need explicit focus and announcement decisions because browser navigation cues disappear
- labels, instructions, errors, and async status text are part of task completion, not polish
- every remediation recommendation needs a matching manual verification step

### Step 4: Build the accessibility remediation packet
Return this structure:

```markdown
# Accessibility Remediation Packet

## Scope
- Surface:
- Workflow type:
- Primary packet:
- Confidence: high | medium | low

## Current signal
- Tool or report source:
- What is already known:
- What still needs direct verification:

## Highest-risk gaps
1. ...
2. ...
3. ...

## Recommended first slice
1. ...
2. ...
3. ...

## Verification plan
- Automated re-check:
- Manual keyboard / focus:
- Manual screen-reader / AT:
- Visual / zoom / motion / reflow:

## Ownership and route-outs
- Primary owner:
- Adjacent skills / teams:
```

### Step 5: Use the packet, not a giant checklist
Pull the packet from [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Packet rules:
- `semantics-structure` → landmarks, headings, lists, tables, buttons/links, form markup, native-first fixes
- `keyboard-focus` → tab order, visible focus, trap/escape behavior, initial focus, focus return, composite widget behavior
- `labels-announcements` → accessible names, helper/error relationships, live regions, status/error messaging, required-state clarity
- `visual-perception-reflow` → contrast, reduced motion, zoom, reflow, target visibility, state visibility
- `media-alternatives` → alt text, decorative-vs-informative imagery, captions, transcripts, fallback descriptions
- `routed-navigation-feedback` → page title / heading announcement, route-change focus strategy, SPA/app-router cues, async load state announcements

### Step 6: Separate automated findings from manual proof
Use this split in every serious answer:
- **Automated-friendly** — missing labels, duplicate IDs, invalid ARIA, simple contrast failures, landmark/heading gaps
- **Manual keyboard/focus** — tab sequence, visible focus, trap behavior, initial focus, focus return, menu/listbox/dialog interaction
- **Manual AT / content quality** — announcement usefulness, alt-text quality, label clarity, route-change comprehension, async feedback quality

If the request starts from a scanner, say explicitly that the scanner is the **input artifact**, not the finished answer.

### Step 7: Route adjacent work explicitly
Use these route-outs when the problem crosses boundaries:

| If the real job is... | Route to... |
|---|---|
| broad UI/design review, hierarchy, polish, or guideline compliance | `web-design-guidelines` |
| reusable component API / primitive ownership / slot-variant design | `ui-component-patterns` |
| viewport/container layout strategy or breakpoint planning | `responsive-design` |
| token governance or system-wide frontend standards | `design-system` |
| React/Next performance or hydration behavior | `react-best-practices` |

## Output expectations
A strong answer from this skill should:
1. identify the **primary failing accessibility surface**,
2. recommend one bounded remediation packet,
3. name the **manual verification still required**,
4. avoid equating a scanner pass with completion,
5. route broader frontend ownership questions outward instead of absorbing them.

## Examples

### Example 1: modal audit after axe
**Input**
> Audit this checkout modal for accessibility issues and tell me what to test manually after axe.

**Output direction**
- choose `keyboard-focus` or `labels-announcements`
- treat axe as the input artifact, not the whole workflow
- verify initial focus, trap behavior, focus return, and announcement quality
- keep broader visual-polish critique out unless it materially affects accessibility

### Example 2: routed app navigation confusion
**Input**
> Screen-reader users say our React app changes routes but the new page is not announced and focus stays on the old nav link.

**Output direction**
- choose `routed-navigation-feedback`
- classify title/heading announcement plus focus-reset strategy
- include manual AT verification after the fix
- avoid turning the task into generic routing architecture work

### Example 3: component-boundary confusion
**Input**
> Our button primitive API is messy and some variants are not accessible. Is this web-accessibility or ui-component-patterns?

**Output direction**
- keep accessible-name, focus-state, and disabled/loading announcement fixes in `web-accessibility`
- route primitive API / variant ownership to `ui-component-patterns`
- split the plan instead of forcing one skill to own everything

### Example 4: manual checks after Lighthouse
**Input**
> Lighthouse says contrast is okay now. What should I still test manually?

**Output direction**
- treat this as verification planning, not score celebration
- verify keyboard order, focus visibility, routed-flow cues, and screen-reader announcement quality where relevant
- include zoom/reflow and reduced-motion checks when the interface depends on them

## Best practices
1. Start with the user task and failing surface, not the rule number.
2. Treat automated tools as accelerators, not as proof of accessibility completeness.
3. Prefer native HTML semantics before ARIA-heavy patches.
4. Keep focus behavior intentional for overlays, route changes, and async validation.
5. Separate remediation packets from broader design-review or component-architecture work.
6. When unsure, name the manual verification still required instead of pretending the scan is enough.

## References
- [W3C: Evaluating Web Accessibility Overview](https://www.w3.org/WAI/test-evaluate/)
- [W3C: Easy Checks – A First Review of Web Accessibility](https://www.w3.org/WAI/test-evaluate/preliminary/)
- [web.dev: Manual accessibility testing](https://web.dev/learn/accessibility/test-manual)
- [MDN: Keyboard accessible](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Keyboard)
- [React Router: Accessibility](https://reactrouter.com/how-to/accessibility)
- [Next.js: Accessibility](https://nextjs.org/docs/architecture/accessibility)
