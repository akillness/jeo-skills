# Family Routing

How to pick which entries from `skill-catalog.md` apply to a given request, and
in what order to apply them when more than one is warranted.

## 1. Choosing a family

Match the *shape* of the request to a family, not just a keyword:

- The request names a whole brand/site aesthetic ("clean beige SaaS", "dark
  glass dashboard", "bright-green technical system") → **Style/Design-System
  Packs**. These skills cover background, hero, nav, cards, and type together.
- The request names a business vertical or a bar to clear ("Awwwards-quality",
  "pricing page", "enterprise AI product page", "service booking site") →
  **Full-Site Quality & Direction**. These are page/site-level briefs that
  already assume some family below will supply the visual texture.
- The request is about scroll behavior, reveal timing, or choreography
  ("scroll-reveal", "pinned sections", "word-by-word reveal", "scroll
  progress") → **Motion & Scroll Systems**.
- The request wants a real-time rendered background or hero object (WebGL
  grid, laser, particle globe, faceted 3D object) that is *not* tied to one
  named package → **WebGL/3D Backgrounds & Shaders**.
- The request explicitly names a third-party library or package (GSAP,
  Three.js, Tailwind, Matter.js, globe.gl, cobe, Vanta.js, Unicorn Studio, the
  Shaders library) → **Library Embeds & Integrations**, regardless of what
  visual it produces.
- The request is about one interactive component's states (hover, loading,
  focus, selected, pressed) → **Component & State Effects**.
- The request is a single, small, reusable CSS/SVG technique or a decorative
  detail (gradient border, alpha mask, progressive blur, corner cut, numeric
  markers, icon set) → **CSS Technique Primitives**.

If a request could plausibly sit in two families (e.g. "add a metallic hover
border with the metal-fx package" touches both Library Embeds and Component &
State Effects), route by the *primary intent*: a request about a component's
state semantics is Component & State Effects even when it happens to ship as
one named package; a request that is really "how do I wire up this library"
is Library Embeds & Integrations.

## 2. Pick the narrowest sub-skill

Within a family, always prefer the single sub-skill whose description matches
the request most specifically over a broader neighbor:

- "I need a fade at the bottom edge of this image" → `css-alpha-masking`, not
  `progressive-blur` (progressive blur is a *layered blur*, not a mask fade)
  and not a full **Style/Design-System Pack**.
- "I need a laser effect behind this hero" → `webgl-laser` (full-screen laser
  background) or `corner-lasers` (corner-anchored composition) depending on
  placement — not the broader `atmosphere-background` or a whole
  `blue-laser-clean-glass-layout` design-system pack, unless the request is
  actually for the whole system.
- "Reveal text as the user scrolls" → distinguish `masked-reveal` (mask-based,
  GSAP ScrollTrigger), `scroll-scrubbed-word-reveal` (scroll-paced, preserves
  inline markup/links), and `staggered-word-reveal` (in-view fade/rise, no
  scroll scrubbing) by the exact mechanism requested, not by "it's about
  text".
- Never reach for a **Full-Site Quality & Direction** skill when the ask is
  actually scoped to one component or one section — that is over-scoping the
  smallest correct change.

When two sub-skills in the same family look equally close, re-read their
"Use when" rows in `skill-catalog.md`; the one whose trigger phrase most
literally matches the user's words wins.

## 3. When combining across families is justified

Combine when the request genuinely spans layers that the catalog itself keeps
separate, and each layer is independently needed:

- A landing page brief that specifies both an aesthetic direction *and* a
  named background technology *and* scroll behavior — e.g. "clean beige SaaS
  landing page with a WebGL particle globe hero and scroll-reveal sections" —
  justifies one **Style/Design-System Pack** + one **WebGL/3D Backgrounds &
  Shaders** (or **Library Embeds & Integrations** if a specific library like
  `globe-gl` is named) + one **Motion & Scroll Systems** skill.
- A **Full-Site Quality & Direction** skill (e.g. `build-awwwards-quality-sites`,
  `product-proof-saas`) is expected to pull in supporting skills from other
  families for its background, motion, and component-state needs — that is
  the intended use of the family, not scope creep.
- A single component that needs both a visual technique and a state
  treatment — e.g. a card using `css-border-gradient` for its resting edge and
  `beam-glow-states` for its loading state — justifies combining a **CSS
  Technique Primitive** with a **Component & State Effect**, because they
  answer different questions (static styling vs. state transition).

## 4. When combining is NOT justified

- Do not stack two **Style/Design-System Packs**. They each define a
  complete, self-consistent system; picking parts of two conflicting systems
  produces an incoherent brand. Choose the closer-matching one, or fall back to
  primitives if neither fits.
- Do not add a **Full-Site Quality & Direction** skill on top of a request
  that only asked for one section or one component. Route to the narrowest
  matching skill in the relevant family instead.
- Do not add a **WebGL/3D Backgrounds & Shaders** or **Library Embeds &
  Integrations** skill "for polish" when nothing in the request calls for a
  3D/animated background — an unused heavy dependency is a bundle-size and
  performance regression, not an enhancement.
- Do not combine multiple **Motion & Scroll Systems** skills that implement
  the same mechanism (e.g. two different word-reveal skills) — pick the one
  narrowest match per section instead of layering redundant scroll listeners.
- Do not reach into **Component & State Effects** for a component that has no
  distinct state to express (a static label doesn't need a loading beam).

## 5. Ordering when multiple families are combined

Apply skills in this order so each layer has something stable to sit on top
of:

1. **Direction / style pack** — establish the design-system pack or the
   Full-Site Quality & Direction brief first; it fixes color, type, and
   structural rules everything else must respect.
2. **Layout** — lay out the grid/containers (framed grids, nested containers,
   split layouts) before adding motion or effects that depend on final
   element positions.
3. **Background / 3D** — add the WebGL/3D background, shader, or particle
   layer once layout is fixed, so it can be sized and layered correctly behind
   or around content.
4. **Motion** — wire up scroll and reveal systems once the DOM structure and
   background are in place, since triggers and choreography depend on final
   element boundaries.
5. **Component states** — add hover/loading/selected/focus treatments to
   individual components last among the interactive layers, once the base
   components exist.
6. **Polish** — apply CSS Technique Primitives (shadows, gradient borders,
   corner treatments, numeric details, icon sets) as the final pass, since
   these are additive refinements that shouldn't block earlier layers.

Skipping a step is fine when a family isn't needed; skipping the *order* (e.g.
tuning scroll-trigger offsets before layout is final) causes rework.
