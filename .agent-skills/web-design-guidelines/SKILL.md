---
name: web-design-guidelines
description: >
  Run a broad web UI review for pages, flows, or component surfaces using audit
  categories such as layout hierarchy, content clarity, CTA emphasis, visual
  consistency, interaction states, responsiveness basics, performance signals,
  and accessibility basics. Use when the user asks to review a UI, audit a page,
  critique UX polish, check interface quality before launch, or turn vague
  design-feedback requests into a structured audit packet. Not for accessibility-
  only remediation, reusable component API design, system-level token governance,
  or React/runtime performance debugging. Triggers on: UI audit, design review,
  UX review, interface critique, polish review, landing-page review, dashboard
  review, usability review, visual consistency, CTA clarity.
allowed-tools: Bash Read Write Grep Glob
compatibility: >
  Best for frontend and fullstack web work where the main task is a broad page or
  flow review. Route specialized remediation to neighboring frontend skills when
  the issue is mainly accessibility, responsive layout, design-system governance,
  component architecture, or React behavior.
license: MIT
metadata:
  tags: frontend, ui-review, ux, usability, design-audit, heuristics, accessibility-basics, responsive-basics
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/jeo-skills
---

# Web Design Guidelines

Use this skill when the question is **"how good is this interface overall, what is creating friction, and what should we fix first?"**

This is the repo's **broad interface audit / design-review anchor**.
It is not just a vendor-rule fetcher and it is not a replacement for specialized neighboring skills.

Read [references/review-modes-and-categories.md](references/review-modes-and-categories.md) before handling a broad page or flow review.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether the work belongs here, `web-accessibility`, `responsive-design`, `ui-component-patterns`, `design-system`, or `react-best-practices`.
Read [references/ui-audit-packet-template.md](references/ui-audit-packet-template.md) before writing a final review packet.

## When to use this skill
- Review a landing page, dashboard, signup flow, settings page, or marketing site for broad interface quality
- Turn "review my UI" or "audit this UX" into a structured audit instead of scattered opinions
- Judge hierarchy, clarity, spacing, consistency, component-state quality, CTA emphasis, and task friction together
- Check whether a screen or flow is ready for implementation, release, or stakeholder review
- Compare a page against broad interface heuristics and practical implementation guidelines
- Convert mixed findings into one prioritized UI audit packet with explicit handoffs

## When not to use this skill
- **The main task is accessibility remediation, keyboard/focus behavior, labels, semantic HTML, or manual-vs-automated WCAG verification** → use `web-accessibility`
- **The main task is viewport adaptation, overflow, breakpoint strategy, or container-aware layout behavior** → use `responsive-design`
- **The main task is reusable primitive / slot / variant API design or controlled-vs-uncontrolled component architecture** → use `ui-component-patterns`
- **The main task is system-level token governance, visual language, or component-library foundations** → use `design-system`
- **The main task is React rendering, hydration, state churn, bundle/runtime behavior, or performance debugging** → use `react-best-practices` or `performance-optimization`
- **The task is only to paste automated tool output with no design judgment**; run the tool directly, then return here to interpret and prioritize

## Core idea
Broad UI review works best when you:
1. define the review surface,
2. classify findings into stable categories,
3. separate broad interface issues from specialist remediation lanes,
4. prioritize by user friction and launch risk,
5. leave behind one concise audit packet.

Do **not** pretend one checklist, linter, or vendor guideline is the whole answer.
Use rule sources and heuristics as inputs, then make a judgment call.

## Instructions

### Step 1: Frame the review surface
Before judging the UI, identify **what kind of surface** is being reviewed.

Classify one or more:
- **Marketing / landing page** — narrative hierarchy, CTA emphasis, scanability, proof, visual trust
- **Application screen / dashboard** — information density, task flows, states, navigation clarity, recoverability
- **Form / onboarding / checkout flow** — field clarity, sequencing, error prevention, progress feedback, confirmation
- **Settings / admin / CRUD surface** — labels, destructive-action clarity, defaults, success/error feedback, table/filter complexity
- **Component cluster** — consistency and state behavior across repeated controls, but not full component API design

Quick frame:
```markdown
Review surface:
- Type: application screen + multi-step form
- Primary job: create a new workspace
- Main user risk: hidden next step, weak error recovery, inconsistent button hierarchy
```

If the request spans too many pages, choose a representative flow or top-priority screens first.

### Step 2: Choose the review mode
Pick **one primary mode** so the review stays bounded.

Modes:
- **Launch-readiness audit** — broad pre-release review with severity and fix ordering
- **Polish / consistency audit** — spacing, hierarchy, copy emphasis, component/state consistency
- **Flow-friction audit** — task completion obstacles, ambiguous steps, error handling, dead ends
- **Heuristic audit** — evaluate against broad interaction heuristics such as visibility, clarity, control, consistency, and recovery
- **Rule-overlay audit** — apply an external checklist or source such as Vercel Web Interface Guidelines on top of the broader audit

Good default:
```markdown
Primary mode: launch-readiness audit
Secondary lens: rule-overlay using Vercel Web Interface Guidelines
```

### Step 3: Review by stable categories
Do not dump random opinions. Group findings into categories.

Use these buckets:
- **Hierarchy and scanability** — visual priority, section ordering, whitespace, grouping, headline/CTA emphasis
- **Clarity and language** — labels, CTA wording, helper text, error text, jargon, next-step clarity
- **Consistency and component behavior** — repeating patterns, button styles, icon use, field treatment, hover/focus/disabled/loading states
- **Interaction feedback and recovery** — success/error/loading states, empty states, confirmation, undo/cancel, progress visibility
- **Navigation and wayfinding** — orientation, section labels, breadcrumbs/tabs, location awareness, exit paths
- **Responsiveness basics** — mobile readability, touch target sanity, overflow, stacking, density changes
- **Accessibility basics** — contrast sanity, visible focus, semantic structure, keyboard reachability, meaning not encoded by color alone
- **Performance and trust signals** — slow hero/media, jittery interactions, layout shifts, heavy assets, inconsistent loading behavior

If a category has no material problem, say so briefly instead of forcing findings.

### Step 4: Decide whether the issue stays here or routes out
This skill owns the broad interface audit, not every specialized fix.

Typical route-outs:
- **Accessibility-only or a11y-heavy remediation** → `web-accessibility`
- **Viewport/container adaptation and layout overflow** → `responsive-design`
- **Reusable component or primitive API redesign** → `ui-component-patterns`
- **Token system / library-wide design governance** → `design-system`
- **Render/runtime/perf debugging in React code** → `react-best-practices` or `performance-optimization`

Use this rule:
- keep the **diagnosis and prioritization** here,
- route the **specialist remediation plan** outward when one lane clearly dominates.

Example:
```markdown
Finding: icon-only buttons are inconsistent and two lack accessible names.
- Keep here: note inconsistency and review impact
- Route out: accessibility remediation details to `web-accessibility`
```

### Step 5: Use external rule sources as overlays, not as the entire method
You may use an external rule source, but only as an overlay.

Useful overlays:
- **Vercel Web Interface Guidelines** — practical web implementation checks across accessibility, focus, forms, motion, performance, and responsive behavior
- **Usability heuristics** — visibility, match to user language, control, consistency, error prevention, recovery
- **Tool output** — Lighthouse, axe, design lint, visual regression notes, analytics/heatmaps if provided

Do not say "the audit is complete because the rules file was fetched".
Instead say:
```markdown
Overlay evidence:
- Vercel guideline overlap: focus visibility, form semantics, state clarity
- Heuristic overlap: consistency, error prevention, user control
- Tool overlap: contrast and performance warnings
```

### Step 6: Prioritize by friction, not by category count
Use severity that matches user impact.

Suggested scale:
- **Critical** — blocks task completion, causes likely abandonment, or creates strong mistrust
- **High** — causes confusion, repeated mistakes, or missing feedback in a core flow
- **Medium** — weakens clarity, consistency, or efficiency but does not fully block the flow
- **Low** — polish issue, small inconsistency, or cleanup worth batching

Also label **fix effort** if helpful:
- low effort / high return
- medium effort / high return
- large redesign / structural follow-up

### Step 7: Produce a short audit packet
The output should help someone act, not just admire your opinions.

Preferred format:
```markdown
# UI Audit Packet

## Surface
- Screen/flow:
- Review mode:
- Primary user job:

## Top findings
1. [Severity] ...
2. [Severity] ...
3. [Severity] ...

## Findings by category
### Hierarchy and scanability
- ...

### Clarity and language
- ...

### Consistency and states
- ...

## Recommended next moves
- Quick wins:
- Follow-up redesigns:
- Route-outs:

## Route-outs
- `web-accessibility`: ...
- `responsive-design`: ...
```

If the user asked for terse review notes, keep the categories but compress each bullet.

## Examples

### Example 1: broad launch-readiness review
**Input:** "Review this signup flow before launch. I need hierarchy, CTA, state, mobile, and accessibility basics checked."

**Good response shape:**
- classify the surface as onboarding / form flow
- choose launch-readiness audit as the primary mode
- group findings into hierarchy, clarity, states, responsiveness basics, and accessibility basics
- prioritize the top blockers
- route keyboard/focus remediation to `web-accessibility` only if it becomes a specialist follow-up

### Example 2: polish review with route-outs
**Input:** "Audit this dashboard UI for consistency. Buttons, badges, loading states, and mobile layout feel uneven."

**Good response shape:**
- choose polish / consistency audit
- keep component/state inconsistency in this skill
- route repeated mobile overflow issues to `responsive-design`
- avoid turning the task into a full design-system rewrite

### Step 8: Keep the boundary explicit in your final answer
End broad reviews with a sentence that prevents overlap drift.

Examples:
- "This packet covers broad interface quality; detailed keyboard/focus fixes should move to `web-accessibility`."
- "The main responsive overflow issues are identified here, but the layout adaptation plan belongs in `responsive-design`."
- "Component inconsistency is flagged here; reusable primitive/API redesign belongs in `ui-component-patterns`."

## Output checklist
Before finishing, verify that you included:
- the review surface,
- the chosen review mode,
- categorized findings,
- prioritization,
- explicit route-outs when needed,
- one concise audit packet instead of scattered observations.

## Best practices
1. Start from the user task or page goal, not from a random list of visual nits.
2. Use categories to organize the audit so findings can be handed off.
3. Treat accessibility and responsiveness as part of broad review, but route specialist remediation out when they dominate.
4. Prefer 5 strong findings over 25 weak bullets.
5. Use external rule sets as overlays, not substitutes for judgment.
6. Distinguish quick wins from structural redesign follow-up.
7. Keep launch-risk and user-friction language concrete.

## References
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)
- [NN/G: 10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [W3C WAI: Web Accessibility Evaluation Tools List](https://www.w3.org/WAI/test-evaluate/tools/list/)
- [Roast My Web: UI Audit Checklist: Template + Report Outline](https://www.roastmyweb.com/blog/ui-audit-checklist)
