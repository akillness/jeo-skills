---
name: design-taste-frontend
description: >
  Apply anti-generic frontend design rules bundled from Leonxlnx/taste-skill,
  the MIT-licensed anti-slop ruleset for landing pages, portfolios, editorial
  pages, and redesigns. Use when output looks templated, AI-default, or
  "sloppy" and the user wants a deliberate design read, explicit DESIGN_VARIANCE /
  MOTION_INTENSITY / VISUAL_DENSITY dials, a real design system choice, an
  AI-tells sweep including the em-dash ban, a redesign audit that preserves
  brand equity, or the pre-flight check before shipping. Even if the user does
  not say taste-skill, also triggers on: looks like AI made it, generic
  landing page, purple gradient hero, make it less templated, Awwwards feel,
  Linear-style, redesign without losing the brand. Not for dashboards, data
  tables, wizards, or admin UI. Route shared token governance to
  `design-system`, layout adaptation to `responsive-design`, accessibility
  remediation to `web-accessibility`, and visual-recipe lookup to `web-design`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Design guidance is stack-neutral but assumes a modern web frontend. The
  upstream skill installs through `npx skills` and targets Claude Code and
  compatible runtimes. Design-system install commands assume npm.
license: MIT
metadata:
  platforms: Claude, ChatGPT, Gemini, Codex, Cursor, Cline
  version: "1.0"
  source: https://github.com/Leonxlnx/taste-skill
---

# Design Taste Frontend

Stop a frontend from looking machine-generated. The failure this addresses is
not ugliness — it is *defaulting*: purple gradients, centered hero on dark mesh,
three equal feature cards, Inter plus slate-900, em-dashes everywhere. Those are
the model's priors leaking into the page, and they read as generic to anyone who
has seen another AI-built site.

The upstream skill is a single 1206-line ruleset. This skill is self-contained:
its operative rules are bundled into the references under MIT attribution, so
normal operation needs no install and no network. This front door decides
**whether the skill applies**, sets the dials, and routes the parts that belong
to other skills.

Bundled from `Leonxlnx/taste-skill` commit
`ccbc15639c97057cbfcf32ecebc38ef716e4bb37` (2026-08-24), MIT, © leonxlnx.

> **Name collision warning.** Upstream's frontmatter `name:` is also
> `design-taste-frontend` (its folder is `skills/taste-skill/`). Running
> `npx skills add ... --skill design-taste-frontend` installs a *second* skill
> under this same name and can shadow or overwrite this catalog copy. Do not run
> it as a setup step.

## When to use this skill

- A landing page, portfolio, editorial page, or marketing site looks templated.
- A redesign must modernize without discarding existing brand equity.
- The user names an aesthetic — Linear-clean, Awwwards-experimental, brutalist,
  premium-consumer — and wants it executed rather than approximated.
- Output needs an AI-tells sweep before shipping.
- A design decision needs to be *stated* (design read, dial values) instead of
  silently assumed.

Do not use this skill for the jobs it explicitly disclaims:

| Brief | Route to |
|---|---|
| Dashboards, admin panels, dense product UI | `design-system`; upstream names Fluent, Carbon, Atlassian, Polaris |
| Data tables | TanStack Table or AG Grid |
| Multi-step forms and wizards | form-specific patterns |
| Code editors | Monaco or CodeMirror with official theming |
| Native mobile | Apple HIG or Material directly |
| Realtime collaboration UI | a different problem class |

Neighboring catalog skills:

- Shared tokens, primitives, cross-product governance → `design-system`
- Breakpoint and layout adaptation → `responsive-design`
- Accessibility remediation and audits → `web-accessibility`
- Recipe lookup across a large visual-effect library → `web-design`
- Reusable component API shape → `ui-component-patterns`
- Design evidence and competitor screenshots → `lazyweb`

## Instructions

### Step 0: Confirm the page kind is in scope

If the brief is a dashboard, table, or wizard, say so explicitly, name the right
tool, and apply this skill only to the marketing surfaces that remain. Applying
landing-page taste to an admin panel produces confident, wrong output.

### Step 1: Work from the bundled rules

Normal operation reads this skill's own references — no install, no network:

- [Design read and dials](references/design-read-and-dials.md)
- [AI tells and pre-flight](references/ai-tells-and-preflight.md)

Consult upstream only for provenance, for a section this skill does not bundle
(the block library, the full reference vocabulary, per-design-system install
appendices), or to confirm whether the pinned rules have since changed:

```bash
# read-only provenance check; installs nothing
curl -fsS https://raw.githubusercontent.com/Leonxlnx/taste-skill/ccbc15639c97057cbfcf32ecebc38ef716e4bb37/skills/taste-skill/SKILL.md | head -40
```

If a user explicitly wants the upstream skill installed alongside this one,
state the name collision first and install it into an isolated directory rather
than the runtime's default skill path.

### Step 2: Declare a design read before touching code

One line, stated to the user, before any generation:

> Reading this as: `<page kind>` for `<audience>`, with a `<vibe>` language,
> leaning toward `<design system or aesthetic family>`.

Infer it from page kind, vibe words the user used, reference URLs or brands,
audience, existing brand assets, and quiet constraints such as public-sector or
accessibility-critical contexts. Those constraints override aesthetic
preference.

If the read genuinely diverges, ask **exactly one** question. If it does not,
declare and proceed — a multi-question dump is its own failure mode.

### Step 3: Set the three dials explicitly

| Dial | 1 | 10 | Baseline |
|---|---|---|---|
| `DESIGN_VARIANCE` | perfect symmetry | artsy chaos | 8 |
| `MOTION_INTENSITY` | static | cinematic | 6 |
| `VISUAL_DENSITY` | art gallery | packed cockpit | 4 |

Baseline is `8 / 6 / 4`. State the chosen values and the reason. Silently
accepting baseline is a pre-flight failure. Representative reads:

| Signal | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| minimalist, calm, Linear-style | 5-6 | 3-4 | 2-3 |
| premium consumer, luxury | 7-8 | 5-7 | 3-4 |
| playful, Awwwards, agency | 9-10 | 8-10 | 3-4 |
| trust-first, public-sector, regulated | 3-4 | 2-3 | 4-5 |
| redesign, preserve | match existing | +1 | match existing |

Full dial and preset tables are in
[design read and dials](references/design-read-and-dials.md); these are the
orientation subset.

### Step 4: Choose a real design system, or name the aesthetic honestly

Reach for an official package when the brief implies an established language —
Material, Fluent, Carbon, GOV.UK Frontend, USWDS. Otherwise say which aesthetic
family the page is in. What is not acceptable is an unnamed default that happens
to be the model's prior.

### Step 5: Sweep the AI tells before shipping

Upstream enumerates them; the highest-yield ones:

- **Em-dash ban.** Zero `—` and zero separator `–` anywhere user-visible:
  headlines, eyebrows, pills, body, quotes, attribution, captions, buttons, alt
  text. Restructure with a period, comma, colon, parentheses, or ` - `. Upstream
  makes this binary because "use sparingly" has historically been ignored.
- Purple-to-blue gradients, centered hero over dark mesh, glassmorphism applied
  to everything, three equal feature cards.
- Inter plus slate-900 as an unconsidered default.
- Placeholder content: "Jane Doe", lorem, fake logos presented as real.
- Theme drift: one section flipping to inverted mode mid-page.

### Step 6: On a redesign, audit before changing anything

Detect preserve-versus-overhaul, audit the existing page, and treat logo,
brand color, product naming, and legal or compliance copy as things that never
change silently. Modernize typography, spacing, motion, and hierarchy first.
Say which lever you pulled and why.

### Step 7: Run the pre-flight check

Do not report the work as done until the bundled pre-flight checklist passes.
The gates that fail most often:

- [ ] Design read declared
- [ ] Dial values explicit and reasoned, not silently baseline
- [ ] Design system chosen, or aesthetic labeled honestly
- [ ] Zero em-dashes anywhere visible
- [ ] One page theme, no mid-page inversion
- [ ] One accent color and one corner-radius system throughout
- [ ] CTA text passes WCAG AA and does not wrap at desktop
- [ ] Form inputs, placeholders, focus rings pass AA on their background
- [ ] Hero fits the viewport: headline ≤ 2 lines, CTA visible without scroll
- [ ] Reduced-motion path honored

Accessibility items here are ship gates, not polish. For remediation beyond the
checklist, route to `web-accessibility`.

## Examples

### Example 1: Generic-looking landing page

Request: "This looks like every other AI site. Fix it."

Declare the design read, name the specific tells present (gradient hero, equal
cards, Inter, em-dashes), set dials away from baseline with a reason, and
rebuild the offending sections. Report what changed and why.

### Example 2: Out of scope

Request: "Apply taste to our analytics dashboard."

Say plainly that upstream disclaims dashboards, route to `design-system` and a
product-UI system such as Fluent or Carbon, and offer to apply this skill only
to the marketing pages around it.

### Example 3: Redesign with brand constraints

Request: "Modernize it but the brand team will kill us if the logo changes."

Preserve mode. Audit first, hold logo, brand color, naming, and legal copy
fixed, and pull typography, spacing, motion, and hierarchy levers. State the
preserved set explicitly before generating.

## Best practices

1. **Scope first** — dashboards and tables are disclaimed; say so instead of
   producing confident, wrong output.
2. **Declare the read** — an unstated design decision is an accidental one.
3. **Never leave dials at silent baseline** — state values and reasoning.
4. **Treat the em-dash ban as binary** — it is the most-violated tell.
5. **Audit before redesigning** — brand equity is easy to destroy accidentally.
6. **Accessibility gates are gates** — contrast and reduced motion block ship.
7. **Work from the bundled references** — they carry the operative rules; reach
   upstream only for provenance or an unbundled section.

## References

- [Design read and dials](references/design-read-and-dials.md)
- [AI tells and pre-flight](references/ai-tells-and-preflight.md)
- [Upstream repository](https://github.com/Leonxlnx/taste-skill)
- [Audited pin `ccbc156`](https://github.com/Leonxlnx/taste-skill/commit/ccbc15639c97057cbfcf32ecebc38ef716e4bb37)
