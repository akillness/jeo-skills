# Craft floor

Read immediately before any UI edit, including small refinements; skip it for planning-only
work. Paraphrased from the pinned upstream `reference/craft-floor.md`
(`02523aec3e4c4580102d996d1b6a71fbe062e03f`, Apache-2.0, © 2025 Paul Bakaus). Build to it
without announcing the checklist. A pinned brief or committed visual world overrides anything
below except an item marked **ban**; your own habit never does.

## Verify on the rendered result

Run these together in one batched look at the render, at the sizes it ships at. Fix what one
look shows before looking again instead of screenshotting after every tweak.

- **Contrast:** body and placeholder text ≥ 4.5:1, large text ≥ 3:1. Secondary text on a
  colored surface is tinted from that hue or the foreground, never gray.
- **Depth:** a shadow has an offset and a soft blur. A zero-offset colored halo is decoration.
- **Spacing:** tight groups, generous separation, more space above a heading than below it.
  Read computed values, not intentions.
- **Type:** body measure 65-75ch; display at most 6rem; tracking no tighter than -0.04em
  (-0.02 to -0.03em usually reads better); balanced headings; obvious size and weight steps.
  Run real copy at every breakpoint and fix overflow.
- **Motion:** one authored moment, not scattered effects and not the same entrance on every
  section. Exponential ease-out from an already-visible default; content never depends on an
  animation to become visible.
- **States:** hover, focus, disabled, loading, error, empty; real content; working controls;
  keyboard focus; responsive composition.
- **Browser surfaces:** text selection, caret, scrollbars, focus rings, underline offset and
  tabular numerals are themed from the palette, not left at browser defaults.
- **Copy:** the product's own words. Controls name their action; errors name the problem and
  the recovery.
- **Coverage:** every brief requirement is present and findable within seconds.

## Refuse unless the brief earns it

These are category defaults, not decisions. If you reach for one while the axis is free,
rewrite the element rather than softening it.

Page scaffolds:

- Identical icon + heading + text cards as the page structure. Nested cards are always wrong.
- The hero-metric template: big number, small label, supporting stats, accent.
- **Ban:** a kicker or eyebrow label above a heading. No brief earns it back; delete it and let
  the heading carry the weight.
- Section numbers (01 / 02 / 03) unless the sequence itself is information.
- A modal for a task that needs neither interruption nor protected focus.

Surface habits:

- Gradient text; emphasis comes from weight or size.
- Glass and blur as decoration rather than a specific effect.
- A colored side border thicker than 1px on cards, list items, callouts or alerts.
- Hard offset (zero-blur) shadows outside a world that is actually neobrutalist.
- Sparklines, progress rings and soft rounded rectangles standing in for content.
- Monospace as a "technical" costume rather than for code, data or measurement.
- A system display face (Impact, Arial Black, platform sans) as the display voice of an
  own-world page; source and self-host a face that matches.
- Emoji or Unicode glyphs standing in for an icon system; use one real icon set or authored SVG
  with consistent stroke and weight.
- Circles, polygons or radial cutouts approximating a photographic subject's edge; derive a
  real alpha matte or a cut-out asset.
- Light or dark theme picked by category; pick it from who uses it, where, in what light.
- One elevation per element: a 1px border under a wide soft shadow is the ghost card. Card
  radii around 12-16px; pills are for small controls.
- Sketch-style SVG scenes and decorative grain or stripe/grid backgrounds without a real
  canvas, map or blueprint under them. Vector geometry, diagrams and shader effects are fine.
- Claims and configuration values that did not come from supplied truth; label illustrative
  values honestly.

## Loaded symbols

A subject's world never licenses militarist, supremacist or hate-movement emblems as motif,
badge or ornament (for example the Rising Sun rays, the Confederate battle flag, Nazi-era
insignia or stylized variants). Use the world's neutral forms. Documenting such a symbol as
fact is content, not decoration.

The floor is mechanics; it never picks the direction. With every check green, spend the
remaining effort on the committed world.
