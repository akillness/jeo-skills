---
name: design-system
description: >
  Define or refactor a shared frontend UI system before polishing one screen at a
  time. Use when the user needs token governance, visual-language rules,
  primitive naming, page-system direction, cross-product consistency, or a design
  handoff that should stay coherent across landing pages, dashboards, forms, and
  component libraries. Not for reusable component API architecture, responsive
  layout-only fixes, accessibility-only remediation, or broad UI critique.
  Triggers on: design system, design tokens, visual language, component library
  foundations, UI governance, cross-product consistency, landing page plus
  dashboard system, primitive naming, token policy.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for frontend and fullstack repos that need reusable system rules across
  multiple pages or products. Route implementation-only work and specialist
  remediation to neighboring frontend skills once the system boundary is clear.
license: MIT
metadata:
  tags: frontend, design-system, ui, ux, design-tokens, governance, visual-language, accessibility
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/jeo-skills
---

# Design System

Use this skill when the main question is **"what shared UI rules should govern this product or product family before we design or refactor individual screens?"**

This is the repo's **canonical frontend UI-system anchor**.
It should:
1. classify the system problem,
2. choose the right design-system mode,
3. route neighboring frontend work out early,
4. define a compact system packet another human or agent can execute.

Read [references/system-modes.md](references/system-modes.md) before choosing an approach.
Read [references/token-and-governance-checklist.md](references/token-and-governance-checklist.md) before changing shared tokens, primitives, or naming rules.
Read [references/scope-boundaries.md](references/scope-boundaries.md) when deciding whether the work belongs here, `ui-component-patterns`, `responsive-design`, `web-accessibility`, or `web-design-guidelines`.
Read [references/design-system-packet-template.md](references/design-system-packet-template.md) before writing the final handoff.

## When to use this skill
- Define or refactor a shared design system for a product, product suite, or app + marketing surface
- Set token policy for color, typography, spacing, radius, elevation, motion, and breakpoint scales
- Choose primitive naming rules, contribution boundaries, and reusable visual-language conventions
- Create a coherent system direction for landing pages, dashboards, forms, and component libraries that must feel related
- Turn vague requests like “our UI feels inconsistent” into a system-level direction packet instead of a one-off page redesign
- Review whether a team needs a system decision before component, accessibility, or responsive implementation starts
- Prepare a design-system handoff for Figma, code tokens, primitives, and downstream frontend work

## When not to use this skill
- **The main task is reusable primitive / slot / variant API design or component-family extraction** → use `ui-component-patterns`
- **The main task is viewport adaptation, container-query strategy, overflow, or mobile layout verification** → use `responsive-design`
- **The main task is keyboard/focus behavior, WCAG remediation, labels, semantics, contrast, or manual a11y verification** → use `web-accessibility`
- **The main task is a broad page or flow critique for hierarchy, CTA clarity, polish, and launch readiness** → use `web-design-guidelines`
- **The task is implementation-only and the system rules are already clear**; implement directly instead of reopening system governance

## Core idea
A good design system is not a random palette plus a hero-section mock.
It is a shared decision layer that defines:
- what stays consistent,
- what may vary by surface,
- which neighboring skill owns the next implementation step,
- and what artifact downstream teams should follow.

Do **not** let this skill become a catch-all for every frontend concern.
System governance stays here; specialist remediation routes out.

## Instructions

### Step 1: Classify the design-system request before generating examples
Pick one primary mode so the answer stays bounded.

Modes:
- **Foundations mode** — tokens, scales, naming, motion, density, breakpoint policy
- **Cross-surface alignment mode** — landing page + dashboard + app-shell consistency, shared hierarchy, shared brand/system language
- **Primitive governance mode** — when the team needs rules for primitive naming, ownership, contribution boundaries, and promotion from product-local UI into shared primitives
- **System handoff mode** — package already-decided system rules into a concise artifact for design/dev execution
- **System review mode** — assess whether inconsistency is really a design-system problem or should route to a neighboring skill

Quick frame:
```markdown
Design-system request:
- Surface: marketing site + logged-in dashboard
- Primary mode: cross-surface alignment
- System question: shared tokens and hierarchy, separate page-specific layouts
- Likely route-outs: component API details to ui-component-patterns, responsive verification to responsive-design
```

### Step 2: Define the shared system boundary
Before changing tokens or page direction, decide what the system actually owns.

Keep in `design-system` when the job is to define:
- token scales and naming rules
- primitive naming and contribution policy
- visual-language principles that should apply across many screens
- breakpoint or density policy that multiple surfaces should inherit
- motion principles and accessibility baseline that many components depend on

Do **not** keep the work here when the question becomes:
- one reusable component API → `ui-component-patterns`
- one page’s layout breakage → `responsive-design`
- one accessibility failure or remediation plan → `web-accessibility`
- one broad UX/UI critique → `web-design-guidelines`

### Step 3: Make the minimum shared decisions first
Do not start by dumping dozens of example tokens.

For each system request, decide these shared layers first:
1. **Foundations** — color, type, spacing, radius, elevation, motion, density, breakpoints
2. **Primitive policy** — which primitives exist, how they are named, what is shared vs product-local
3. **Surface rules** — how landing pages, dashboards, forms, nav, and data-heavy surfaces should differ while staying coherent
4. **Accessibility baseline** — contrast expectations, focus visibility, reduced-motion posture, semantic expectations
5. **Governance** — who can add/change tokens or primitives, what must be reviewed, and when work should route to another skill

If a layer is unknown, say so and capture it as an open decision instead of inventing detail.

### Step 4: Keep examples subordinate to the rules
Examples are useful only after the shared rules are explicit.

Good example usage:
- show one token naming pattern
- show one page-system contrast between landing and dashboard surfaces
- show one primitive promotion rule
- show one motion baseline or accessibility baseline

Bad example usage:
- dumping a full palette, TS token file, CSS animation sheet, and JSX screen mock before saying what problem the system is solving

Use this rule:
- **rules first**,
- **one or two illustrative examples second**,
- **handoff packet last**.

### Step 5: Route neighboring frontend work out early
Mixed requests are normal. Split them explicitly.

Examples:
- if the team asks for button variants, slot structure, and controlled/uncontrolled behavior, keep the system naming/tokens here but route API design to `ui-component-patterns`
- if the team asks how cards collapse on mobile, keep shared breakpoint policy here but route layout adaptation to `responsive-design`
- if the team asks whether icon-only buttons meet keyboard/focus/label requirements, keep baseline a11y expectations here but route remediation to `web-accessibility`
- if the request is “audit this dashboard and tell us what feels off,” route the broad critique to `web-design-guidelines`

Do not hide unclear ownership by calling everything “design-system work.”

### Step 6: Produce the design-system packet
End with a concise artifact that downstream design/dev work can follow.

Preferred format:
```markdown
# Design System Packet

## Scope
- Products / surfaces covered:
- Primary mode:
- Shared system goal:

## Foundations
- Color / semantic token rules:
- Typography / spacing / radius / elevation:
- Motion / density / breakpoint policy:

## Primitive policy
- Shared primitives:
- Naming rules:
- What stays product-local:

## Surface guidance
- Landing / marketing:
- Dashboard / app shell:
- Forms / workflows:

## Accessibility baseline
- Contrast / focus / reduced motion / semantics:

## Route-outs
- `ui-component-patterns`:
- `responsive-design`:
- `web-accessibility`:
- `web-design-guidelines`:

## Open decisions
- ...
```

If the user asks for a terse answer, keep the same sections but compress them into bullets.

### Step 7: Only then add a small illustrative example when needed
Use at most one or two examples and keep them obviously subordinate to the packet.

Healthy example shapes:
- semantic color tokens (`surface/default`, `surface/emphasis`, `text/muted`) instead of giant fixed palettes
- landing-page hero vs dashboard header comparison to show shared hierarchy but different density
- primitive promotion rule such as “shared button stays primitive; billing-upsell banner stays product-local”

### Step 8: Finish with a boundary sentence
End with a sentence that prevents overlap drift.

Examples:
- "This packet defines the shared UI system; component API extraction belongs in `ui-component-patterns`."
- "This packet sets breakpoint and density policy; page-level layout fixes belong in `responsive-design`."
- "This packet sets accessibility baseline expectations; remediation and verification belong in `web-accessibility`."

## Examples

### Example 1: shared landing page + dashboard system
**Input:** "We need one design system for our marketing site and B2B dashboard so tokens, typography, and motion feel related without making both surfaces identical."

**Good response shape:**
- choose cross-surface alignment mode
- define shared foundations and surface-specific differences
- leave one compact design-system packet
- route component-family API design to `ui-component-patterns`

### Example 2: token and primitive governance
**Input:** "Our team keeps adding random colors and spacing values. We need naming rules and a review policy for shared primitives."

**Good response shape:**
- choose foundations or primitive governance mode
- define token/naming rules and review thresholds
- keep one or two naming examples only
- avoid turning the answer into a full page mock

### Example 3: mixed system + responsive request
**Input:** "Should the dashboard and mobile web app share one breakpoint policy, and how should the layout collapse on small screens?"

**Good response shape:**
- keep shared breakpoint/density policy in `design-system`
- route the actual collapse strategy and verification to `responsive-design`
- make the split explicit in the packet

### Example 4: accessibility-heavy follow-up
**Input:** "We already have tokens, but our forms still fail focus visibility and error-state accessibility."

**Good response shape:**
- note the design-system baseline briefly
- route the real remediation and manual verification to `web-accessibility`
- do not absorb the full a11y fix into this skill

## Best practices
1. **Decide the mode first** so the skill stays bounded.
2. **Define shared rules before examples** to avoid overfitting on one mockup.
3. **Keep governance explicit**: token changes, primitive promotion, and ownership rules are part of the system.
4. **Use route-outs early** so `design-system` does not steal layout, component-API, accessibility, or broad-audit work.
5. **Leave a compact packet** another human or agent can follow.
6. **Keep the alias narrow**: `frontend-design-system` remains a compatibility redirect, not a peer canonical skill.

## References
- [System modes](references/system-modes.md)
- [Token and governance checklist](references/token-and-governance-checklist.md)
- [Scope boundaries](references/scope-boundaries.md)
- [Design-system packet template](references/design-system-packet-template.md)
- [Compatibility alias](../frontend-design-system/SKILL.md)
- [Component architecture neighbor](../ui-component-patterns/SKILL.md)
- [Responsive layout neighbor](../responsive-design/SKILL.md)
- [Accessibility neighbor](../web-accessibility/SKILL.md)
- [Broad UI audit neighbor](../web-design-guidelines/SKILL.md)
