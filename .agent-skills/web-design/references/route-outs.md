# Route-outs

`web-design` routes into the 79-skill MengTo/Skills web-design family. Those sub-skills are
*visual recipes* for a page: a style pack, a background effect, a scroll system, a CSS
technique. They are not architecture, governance, or audit tools. When the request is really
about one of the concerns below, route out instead of answering here.

## `react-bits` — ready-made animated React components

react-bits is a library of animated React components (Vite, Tailwind v4, Three.js/Fiber, GSAP,
Framer Motion integrations) that you install and customize. The web-design family gives you
*recipes to build* an effect in your own code.

- Route to `react-bits` when the user wants to adopt, customize, or contribute to that library,
  or wants an off-the-shelf animated component rather than an implementation recipe.
- Stay here when the user wants the technique itself (how the laser background, the alpha mask,
  or the scroll-pin is constructed) in their own stack.

## `design-system` — token governance and cross-product consistency

`design-system` owns token governance, visual-language rules, primitive naming, page-system
direction, and handoffs that must stay coherent across products.

- Route to `design-system` when the problem is that tokens/primitives are inconsistent across
  apps, or when a shared system must be defined before any screen is polished.
- Stay here when one page or one surface needs a concrete aesthetic recipe. A Style/Design-System
  Pack in this family styles *a site*; it does not govern a multi-product token system.

## `responsive-design` — breakpoint and reflow strategy

`responsive-design` classifies whether a failure is page-shell adaptation, reusable
component/container behavior, dense-data or toolbar pressure, responsive media, or reflow
verification.

- Route to `responsive-design` when the request is "this breaks at 768px", "should this be a
  container query", or "how do I verify reflow".
- Stay here when the request is what the surface should *look like*. Sub-skills here assume a
  working layout; they do not decide breakpoint strategy.

## `react-best-practices` — measurement-led React/Next.js performance

`react-best-practices` runs audits for waterfalls, bundle size, RSC/server-client boundaries,
hydration mismatch, rerender churn, and script cost.

- Route there when the complaint is a slow route, a large bundle, or hydration errors — even if
  the slow thing is an animation, if the cause is React render or data behavior.
- Stay here when the question is which visual/motion recipe to use. Note the overlap honestly:
  a heavy WebGL background is a *performance* decision as much as a visual one, so name both.

## `web-accessibility` — remediation and conformance verification

`web-accessibility` classifies which accessibility surface is failing (semantics,
keyboard/focus, labels/announcements, visual perception/reflow, media alternatives, routed-app
navigation feedback).

- Route there for WCAG conformance, screen-reader behavior, focus-order bugs, or an audit.
- Stay here for the visual recipe, but never claim a motion or contrast recipe is accessible on
  its own — reduced-motion and contrast still need `web-accessibility` verification.

## `lazyweb` — design evidence and references

`lazyweb` supplies real app screenshots, competitor references, best practices, and examples
for designing or critiquing product UI.

- Route there when the user needs *evidence* ("show me how other products do this", "critique
  this screen").
- Stay here when the user has already chosen a direction and needs the implementation recipe.

## `open-design` — generated design artifacts

`open-design` routes design-generation work into prototype, deck, document, or media artifact
modes (local-first HTML/PDF/PPTX generation).

- Route there when the deliverable is a generated artifact (a prototype file, a deck, a
  document), not code in an existing web app.
- Stay here when the deliverable is styling and motion in a real front-end codebase.

## `web-game-development` — gameplay 3D

Both packs come from MengTo/Skills and both touch Three.js. The line is purpose:

- `web-design` covers **decorative/ambient** 3D and WebGL for *sites* — backgrounds, hero
  objects, shader atmospheres, particle fields that no one plays.
- `web-game-development` covers **interactive gameplay** — cameras, enemies, combat,
  encounters, inventory, playtest QA, and release proof.
- If the user can *lose*, route to `web-game-development`. If the 3D is scenery behind copy and
  a CTA, stay here.

## `perfectpixel` — 2D sprite generation

`perfectpixel` generates character sprite sheets, animation sets, and engine bundles from a text
prompt. Nothing in the web-design family generates raster game assets — route there instead of
improvising.
