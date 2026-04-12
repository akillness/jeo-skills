---
name: web-accessibility
description: >
  Diagnose and remediate web accessibility issues across semantic HTML, keyboard
  support, focus management, labels, ARIA, contrast, motion, and manual-vs-
  automated verification. Use when the user needs an accessibility audit,
  accessibility remediation plan, WCAG-oriented implementation guidance, or help
  deciding what to test manually after tools like axe or Lighthouse. Triggers on:
  a11y, accessibility audit, keyboard trap, focus return, screen reader issue,
  aria-label, semantic HTML, color contrast, WCAG, accessible modal, accessible
  form, and what manual accessibility checks are still required.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for frontend and fullstack web work where the main problem is
  accessibility remediation or verification. Not for broad UI polish reviews,
  pure component API architecture, or viewport-only responsive layout work.
license: MIT
metadata:
  tags: accessibility, a11y, wcag, aria, keyboard-navigation, focus-management, screen-reader, frontend
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# Web Accessibility

Use this skill when the main question is **"what accessibility issue is present, how do we fix it, and what still needs manual verification beyond automated scans?"**

The job is not to dump generic WCAG prose or a giant widget cookbook.
The job is to:
1. identify the accessibility failure mode,
2. separate automated findings from manual/assistive-technology follow-up,
3. fix semantics, labeling, focus, keyboard, feedback, and media behavior at the right layer,
4. route adjacent design-review or component-architecture work to the right neighboring skill,
5. leave behind a short remediation and verification packet.

Read [references/audit-remediation-checklist.md](references/audit-remediation-checklist.md) before handling a broad audit or release-critical accessibility pass.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `web-accessibility`, `web-design-guidelines`, `ui-component-patterns`, `responsive-design`, or `design-system` should own the next step.

## When to use this skill
- Audit a web flow, page, or component for accessibility issues and decide what to test beyond automated tooling
- Fix keyboard traps, missing focus return, invisible focus states, or broken tab order
- Repair labels, instructions, error messages, landmarks, headings, live regions, and form semantics
- Choose semantic HTML versus ARIA and remove unnecessary role-heavy implementations
- Review accessibility behavior for modals, menus, tabs, accordions, toasts, dialogs, carousels, and forms
- Turn vague requests like “make this accessible” into a concrete remediation + verification plan
- Prepare an accessibility check packet for implementation, QA, or release review

## When not to use this skill
- **The main task is broad UI polish, copy hierarchy, spacing, consistency, or multi-rule design review** → use `web-design-guidelines`
- **The main task is reusable primitive/component API design, slot/variant structure, or controlled-vs-uncontrolled component architecture** → use `ui-component-patterns` or `design-system`
- **The main task is viewport adaptation, mobile layout behavior, breakpoint selection, or responsive media sizing** → use `responsive-design`
- **The main task is general React performance or rendering behavior** → use `react-best-practices`
- **The task is only to run one tool and paste raw findings with no remediation judgment**; in that case run the tool directly, then return here to interpret and prioritize

## Instructions

### Step 1: Frame the accessibility surface
Before suggesting fixes, classify what kind of accessibility surface is failing.

Use one or more of these buckets:
- **Structure and semantics** — landmarks, headings, lists, tables, button/link semantics, form labels
- **Keyboard and focus** — tab order, focus visibility, focus trap, focus return, roving tabindex, escape behavior
- **Name / role / value** — labels, accessible names, state announcements, ARIA relationships
- **Content and feedback** — error text, instructions, validation timing, live regions, status updates
- **Visual perception** — color contrast, reduced motion, visible states, zoom/reflow side effects
- **Media and alternatives** — alt text, captions, transcripts, decorative media handling

If multiple buckets are involved, list them explicitly instead of treating the whole issue as a single “a11y bug.”

Quick frame:
```markdown
Accessibility surfaces:
- Keyboard and focus: modal traps focus but does not restore it on close
- Name / role / value: icon-only close button has no accessible name
- Content and feedback: form validation errors are not announced
```

### Step 2: Separate automated findings from manual follow-up
Do not pretend an automated scan is the full answer.

Use this split:
- **Automated-friendly checks** — missing labels, basic ARIA misuse, contrast on simple cases, duplicate IDs, landmark/heading presence
- **Manual checks required** — logical tab order, focus visibility, keyboard trap behavior, screen-reader announcement quality, alternative-text usefulness, content clarity, timing/motion comfort, realistic task completion
- **Assistive-technology follow-up** — when a flow is critical, dynamic, widget-heavy, or already known to confuse screen-reader users

Good framing:
```markdown
Automated scan can confirm:
- missing form labels
- icon button missing accessible name
- color contrast failures on solid backgrounds

Manual verification still required:
- opening the modal moves focus to the right element
- Escape closes it and focus returns logically
- screen reader announces the dialog title and error summary
```

If the user mentions axe, Lighthouse, Pa11y, Accessibility Insights, or another scanner, treat that as the **start** of the workflow, not the entire workflow.

### Step 3: Prefer semantic HTML before ARIA
If native HTML already solves the problem, use it first.

Common rules:
- use `<button>` for button behavior, not clickable `<div>` or `<span>`
- use real `<label>` relationships for inputs before adding ARIA labels everywhere
- use `<nav>`, `<main>`, `<header>`, `<footer>`, `<table>`, `<th>`, and headings correctly before adding roles
- use ARIA to express missing semantics or state only when native HTML cannot carry them alone

Ask these questions:
1. Is this element interactive?
2. Does native HTML already provide the right role and keyboard behavior?
3. If ARIA is added, does it clarify state, relationship, or announcement rather than patching bad markup?

Bad pattern:
```html
<div role="button" tabindex="0" onclick="save()">Save</div>
```

Better pattern:
```html
<button type="button" onclick="save()">Save</button>
```

### Step 4: Fix keyboard and focus behavior first for interactive flows
When users cannot operate the UI with a keyboard, that is usually a priority issue.

Check:
- every interactive control is reachable without a mouse
- tab order follows visual/task logic
- focus state is visible and not removed without replacement
- opening overlays places focus in the right place
- closing overlays returns focus logically
- composite widgets use the correct arrow-key / escape / enter / space behavior
- trapped focus only exists where it should, such as an active modal dialog

Typical failure → fix mapping:
- **keyboard trap with no exit** → ensure Escape and close controls work, and restore focus to the invoking control
- **focus disappears on route or dialog close** → move focus to main content, heading, or invoker intentionally
- **custom widget uses click only** → add native semantics or implement full keyboard interaction, not partial `tabindex` hacks
- **`outline: none` with no replacement** → restore visible `:focus-visible` styling

### Step 5: Repair names, labels, instructions, and announcements
Many accessibility failures are not about widgets being absent; they are about meaning being unclear.

Audit:
- icon-only buttons need an accessible name
- form fields need labels and useful instructions
- errors should be tied to fields and surfaced in plain language
- dynamic status updates should be announced appropriately
- helper text, required state, and validation timing should make sense without vision alone

Useful fixes:
- `aria-label` only when visible text is not available and no better labeling relationship exists
- `aria-describedby` for hint/error text that should be read with a field
- `aria-live="polite"` for non-blocking async updates such as save confirmations or validation messages
- explicit error summary + focus management on submit when multiple fields fail

Avoid using ARIA to mask unclear copy. Rewrite the user-facing text when that is the real issue.

### Step 6: Handle common component families with the right remediation lens
Use the failure mode, not the component name alone, to choose the fix.

#### Forms
Prioritize labels, hints, required-state communication, inline error clarity, and error-summary focus.

#### Modals / dialogs
Prioritize initial focus, focus trap only while open, escape/close behavior, background inertness, and logical focus return.

#### Menus / listboxes / tabs / accordions
Prioritize correct roles only when needed, arrow-key behavior, selected-state announcement, and avoiding over-complex custom widgets when simpler native controls would work.

#### Toasts / async validation / status banners
Prioritize timely announcement without hijacking focus unnecessarily.

#### Tables / data-heavy views
Prioritize header association, caption/summary clarity where needed, sortable-state announcement, and keyboard access to interactive cells.

### Step 7: Route adjacent work correctly
This skill owns accessibility remediation and verification, not every adjacent frontend concern.

Typical handoffs:
- **`web-design-guidelines`** — broader UI/design/polish/compliance review across multiple rule families, not just accessibility
- **`ui-component-patterns`** — reusable primitive APIs, composition, slot/variant design, controlled/uncontrolled boundaries
- **`design-system`** — system-level token/pattern/primitive decisions before individual accessibility fixes
- **`responsive-design`** — breakpoint and viewport adaptation when the main bug is layout behavior rather than accessibility semantics
- **`react-best-practices`** — rendering/performance/hydration issues that only incidentally touch accessibility

If the user asks “is this accessible and how do we fix it?”, stay here.
If the user asks “how should our button API be designed for all variants?” route to `ui-component-patterns`.
If the user asks “review this UI against broader design rules and product polish,” route to `web-design-guidelines`.

### Step 8: Produce the remediation + verification packet
End with a concise artifact someone can act on.

Preferred format:
```markdown
# Accessibility Remediation Packet

## Surface
- Flow/component:
- Accessibility buckets:
- Severity / user impact:

## Findings
1. ...
2. ...
3. ...

## Recommended fixes
- Semantic / markup:
- Keyboard / focus:
- Labels / announcements:
- Visual / motion / contrast:

## Verification
- Automated:
- Manual keyboard:
- Manual screen-reader / AT:
- Out of scope for now:

## Route-outs
- `web-design-guidelines` / `ui-component-patterns` / `responsive-design` / other
```

If the right answer is “the automated tool is correct, but the real next step is manual focus and screen-reader verification,” say that explicitly.

## Output format
Always return an **accessibility remediation packet**, **accessibility audit summary**, or **manual-vs-automated verification plan**.

Required qualities:
- classify the failing accessibility surface
- distinguish automated findings from manual or AT follow-up
- prefer semantic HTML before ARIA-heavy fixes
- prioritize keyboard/focus issues for interactive flows
- tie labels, instructions, and announcements to real user tasks
- route broader design review or component architecture to the correct neighboring skill

## Examples

### Example 1: modal audit after axe
**Input**
> Audit this checkout modal for accessibility issues and tell me what to test manually after axe.

**Output sketch**
- Surface: keyboard/focus + labels/announcements
- Findings:
  1. close button missing accessible name
  2. focus trap exists but focus does not return to the checkout trigger
  3. coupon validation message is not announced
- Manual checks:
  - tab sequence stays inside dialog only while open
  - Escape closes dialog
  - screen reader announces title + error text
- Route-out: none unless broader visual-polish review is also requested

### Example 2: component-boundary confusion
**Input**
> Our button primitive API is messy and some variants are not accessible. Is this web-accessibility or ui-component-patterns?

**Output sketch**
- Stay in `web-accessibility` for missing names, focus states, and disabled/loading announcements
- Route to `ui-component-patterns` for variant API design, slot structure, and reusable primitive architecture
- If both matter, produce a split plan instead of forcing one skill to own everything

### Example 3: manual checks after Lighthouse
**Input**
> Lighthouse says contrast is okay now. What should I still test manually?

**Output sketch**
- Verify keyboard order and visible focus across the user journey
- Verify modal open/close and focus return behavior
- Verify screen-reader announcement quality for status/error updates
- Verify zoom/reflow and reduced-motion behavior where relevant

## Best practices
1. Start with the user task, not the rule number.
2. Treat automated tools as accelerators, not as proof of accessibility completeness.
3. Prefer native HTML semantics before ARIA patches.
4. Keep focus behavior intentional for route changes, overlays, and async validation.
5. Separate remediation work from broader design-review or component-API architecture work.
6. When unsure, name the manual verification still required instead of pretending the scan is enough.

## References
- [W3C: Evaluating Web Accessibility Overview](https://www.w3.org/WAI/test-evaluate/)
- [web.dev: Automated accessibility testing](https://web.dev/learn/accessibility/test-automated)
- [web.dev: Manual accessibility testing](https://web.dev/learn/accessibility/test-manual)
- [MDN: Keyboard accessible](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Keyboard)
- [A11Y Project checklist](https://www.a11yproject.com/checklist/)
