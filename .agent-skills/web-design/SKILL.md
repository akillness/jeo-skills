---
name: web-design
description: >
  Route web design, motion, WebGL, and visual-styling requests into the narrowest matching
  sub-skill of the 79-skill MengTo/Skills web-design family — Style/Design-System Packs,
  Full-Site Quality & Direction, Motion & Scroll Systems, WebGL/3D Backgrounds & Shaders,
  Library Embeds & Integrations, Component & State Effects, and CSS Technique Primitives.
  Use when picking and fetching the right visual recipe for a marketing site, landing page,
  portfolio, or dashboard shell, then combining layers in direction → layout → background →
  motion → component-state → polish order. Triggers on: web design, landing page, awwwards,
  GSAP, Lenis, scroll animation, WebGL background, shader, glass UI, dark mode design system,
  editorial layout, cursor trail, progressive blur, gradient border, three.js background,
  vanta, globe.gl, unicorn studio, marketing site polish.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Best for browser front-ends (HTML/CSS/Tailwind/React/Next.js) where the task is choosing
  and fetching the correct upstream MengTo/Skills web-design sub-skill. Not for design-token
  governance, component API design, accessibility audits, or game runtimes — route those out.
license: MIT
metadata:
  tags: web-design, motion, webgl, gsap, threejs, css, landing-page, skill-routing, skill-pack, mengto-skills
  version: "1.0"
  source: https://github.com/MengTo/Skills/tree/main/agent-skills/web-design
---

# Web Design

Use this skill when the real question is **"which upstream web-design recipe should own this
visual task, and how do I get it installed?"**

This is a **routing pack**, not a reimplementation. The 79 real sub-skills live upstream at
[MengTo/Skills · agent-skills/web-design](https://github.com/MengTo/Skills/tree/main/agent-skills/web-design).
The job here is to:

1. classify the request into one of seven families,
2. pick the single narrowest sub-skill in that family,
3. fetch it locally if it is not already installed,
4. sequence multi-family work in the documented order, and
5. route out to this repo's system/architecture/accessibility skills when they are the real owner.

## The seven families

| Family | Count | Route here when the request is about |
| --- | --- | --- |
| Style/Design-System Packs | 23 | A whole brand or site aesthetic — background, hero, nav, cards, and type together ("dark glass dashboard", "clean beige SaaS", "bright-green technical system") |
| Full-Site Quality & Direction | 10 | A page/site-level brief or a bar to clear ("Awwwards-quality", pricing page, enterprise AI product page, service booking site) |
| Motion & Scroll Systems | 10 | Scroll behavior, reveal timing, pinning, choreography, scroll progress |
| WebGL/3D Backgrounds & Shaders | 8 | A real-time rendered background or hero object not tied to one named package (grid, laser, particle field, faceted 3D object) |
| Library Embeds & Integrations | 10 | A named third-party library or package — GSAP, Three.js, Tailwind, Matter.js, globe.gl, cobe, Vanta.js, Unicorn Studio, Shaders |
| Component & State Effects | 4 | One component's interactive states — hover, loading, focus, selected, pressed |
| CSS Technique Primitives | 14 | A single small reusable CSS/SVG technique or decorative detail (gradient border, alpha mask, progressive blur, corner cuts, shadows, icons) |

The full 79-row table with a real "use when" per sub-skill is in
[references/skill-catalog.md](references/skill-catalog.md). Family-selection rules, the
narrowest-match rule, and the combining rules are in
[references/family-routing.md](references/family-routing.md).

## When to use this skill

- The task is designing or upgrading the visual layer of a marketing site, landing page,
  portfolio, editorial page, or dashboard shell
- You need to choose between two or more upstream web-design sub-skills and are not sure
  which one is narrowest
- The request names a specific effect (cursor trail, laser background, progressive blur,
  scroll-pinned section) and you need the recipe that already encodes it
- The request names a library (GSAP, Three.js, Vanta, globe.gl, Unicorn Studio) and you need
  the integration/cleanup patterns rather than improvised setup code
- Several visual layers must be combined for one page and you need a safe application order
- The upstream sub-skill needed for the task is not installed yet

## When not to use this skill

- **The task is adopting a ready-made animated React component library rather than authoring the
  effect yourself** → use `react-bits`
- **The task is generating design evidence — real app screenshots, competitor references, UI
  critique input** → use `lazyweb`

- **The task is design-token governance, theming contracts, or system-wide consistency rules** →
  use `design-system`
- **The task is breakpoint strategy, page-shell adaptation, or container-query classification** →
  use `responsive-design`
- **The task is React render/bundle/data-fetching performance, not visual styling** →
  use `react-best-practices`
- **The task is an accessibility audit, WCAG conformance, or assistive-technology behavior** →
  use `web-accessibility`
- **The task is interactive 3D that is gameplay (cameras, enemies, combat, encounters)** →
  use `web-game-development`
- **The task is generating 2D pixel-art sprite sheets** → use `perfectpixel`

Full boundary statements: [references/route-outs.md](references/route-outs.md).

## Instructions

### Step 1: Classify the request into one family

Use [references/family-routing.md](references/family-routing.md) §1. Match the *shape* of the
request, not a keyword. If a request straddles two families, route by primary intent — a
question about a component's state semantics is Component & State Effects even when it ships
as a named package; a question about wiring a library up is Library Embeds & Integrations.

### Step 2: Pick the single narrowest sub-skill

Use [references/skill-catalog.md](references/skill-catalog.md) and name one sub-skill. Prefer
the specific recipe over a broader neighbor: "fade the bottom edge of this image" is
`css-alpha-masking`, not a whole style pack.

### Step 3: Check whether it is installed

```bash
ls "${SKILLS_ROOT:-$HOME/.agents/skills}" | grep -x "<matched-skill-name>" || echo "not installed"
```


### Step 4: Fetch the sub-skill if missing

`scripts/fetch-upstream-skills.sh` sparse-checkouts only `agent-skills/web-design` from
`https://github.com/MengTo/Skills.git` and copies the requested folder(s) into
`${SKILLS_ROOT:-$HOME/.agents/skills}` without deleting anything already there.

```bash
scripts/fetch-upstream-skills.sh --list
scripts/fetch-upstream-skills.sh --skill gsap --skill animation-on-scroll
scripts/fetch-upstream-skills.sh --dry-run --all
scripts/fetch-upstream-skills.sh --all
```


### Step 5: Sequence multi-family work

When more than one family is warranted, apply them in this order (details in
[references/family-routing.md](references/family-routing.md) §5):

1. Direction / style pack — fixes color, type, and structural rules
2. Layout — grids, containers, split layouts
3. Background / 3D — WebGL, shader, or particle layer sized against final layout
4. Motion — scroll and reveal systems once DOM structure is stable
5. Component states — hover/loading/selected/focus on real components
6. Polish — CSS Technique Primitives as the final additive pass

### Step 6: Report the route

State the family, the chosen sub-skill, whether it was already installed or fetched, any
additional families being combined and why, and any route-out you took instead.

## Examples

**"Make our landing page feel like an Awwwards site — dark, glassy, with a laser background
and scroll reveals."**
→ Full-Site Quality & Direction (`build-awwwards-quality-sites`) for direction, then
Style/Design-System Packs (`dark-glass-clean-layout`) for the surface system, then
WebGL/3D Backgrounds & Shaders (`webgl-laser`) for the background, then Motion & Scroll
Systems (`animation-on-scroll`) last. Applied in that order per §5.

**"Add a fade at the bottom of this hero image."**
→ CSS Technique Primitives, single sub-skill `css-alpha-masking`. Do not pull in a style pack.

**"Set up Vanta.js on our Next.js hero and make sure it cleans up on route change."**
→ Library Embeds & Integrations, `vantajs`. The request is library wiring and lifecycle
cleanup, not a visual direction choice.

**"Our design tokens are inconsistent across three apps."**
→ Route out to `design-system`. This pack styles pages; it does not govern tokens.

## Best practices

1. **Name one sub-skill before writing any code** — improvising a shader or scroll system when
   a matching recipe exists is the failure mode this pack prevents.
2. **Combine across families only when the request genuinely spans layers** — most requests are
   one sub-skill.
3. **Respect the application order** — motion wired before layout is final will re-measure
   against stale element boundaries.
4. **Never stack two sub-skills that solve the same problem** (two word-reveal recipes, two
   scroll listeners); pick the narrowest match per section.
5. **Keep the upstream SKILL.md authoritative** — fetch the folder whole rather than
   paraphrasing its instructions here.
6. **Route out early** — token governance, component APIs, breakpoints, and accessibility are
   owned by other skills in this repo, and answering them here produces confident wrong advice.

## References

- Upstream family: [MengTo/Skills · agent-skills/web-design](https://github.com/MengTo/Skills/tree/main/agent-skills/web-design)
- [references/skill-catalog.md](references/skill-catalog.md) — all 79 sub-skills grouped by family
- [references/family-routing.md](references/family-routing.md) — family choice, narrowest-match, combining, ordering
- [references/route-outs.md](references/route-outs.md) — boundaries against this repo's other skills
- [scripts/fetch-upstream-skills.sh](scripts/fetch-upstream-skills.sh) — sparse-checkout fetcher
- Sibling pack: `web-game-development` (Three.js/browser **games**)
