# AI Tells and Pre-Flight

Operative rules bundled from `Leonxlnx/taste-skill` commit
`ccbc15639c97057cbfcf32ecebc38ef716e4bb37` (2026-08-24), MIT licensed,
© leonxlnx. Redistributed under MIT with attribution. This file is the working
reference — normal operation does not require the upstream install.

## The em-dash ban (upstream §9.G)

Upstream calls this the single most-violated tell and states it as binary,
because every softer phrasing has been ignored in practice.

**Zero `—` and zero separator `–` anywhere user-visible.** Headlines, eyebrows,
labels, pills, button text, body copy, quotes, attribution, image captions, nav
items, alt text.

Replacements:

| Context | Instead of `—` |
|---|---|
| Headline | period or comma |
| Eyebrow, pill, button | line break, column, hairline rule |
| Body copy | two sentences, a comma, parentheses, or a colon |
| Quote attribution | ` - ` with spaces, or a line break plus lighter weight |
| Date or number range | plain hyphen: `2018-2026`, `€40-80k` |

Permitted dashes: the regular hyphen `-`, and the minus sign in math (`-5°C`).

A single visible `—` or separator `–` fails pre-flight and the output must be
rewritten. This governs generated page content, not unrelated prose the user
already wrote.

## Visual and CSS tells

- Purple-to-blue gradient hero, especially over a dark mesh background.
- Centered hero with a glow blob behind it.
- Glassmorphism applied uniformly rather than to one deliberate surface.
- Three equal feature cards in a row as the default section shape.
- Infinite-loop micro-animations on everything.
- Uniform border radius and shadow across every element with no hierarchy.

## Typography tells

- Inter plus slate-900 chosen by default rather than by decision.
- Fraunces or Instrument Serif as the reflexive "we need a serif" pick.
- Reusing the same serif across unrelated projects.
- Italic words with descenders (`y g j p q`) clipped by tight leading — upstream
  requires `leading-[1.1]` minimum plus a bottom padding reserve.

## Content tells

- "Jane Doe", "Acme Inc", lorem ipsum left in shipped output.
- Invented testimonials or logos presented as real customers.
- Fabricated metrics in trust bars.

Placeholder content is acceptable only when labeled as placeholder.

## Consistency locks

Each is a single global decision for the page:

| Lock | Rule |
|---|---|
| Page theme | one theme for the whole page; no mid-page inversion |
| Color | one accent used identically across all sections |
| Shape | one corner-radius system throughout |

## Forbidden animation patterns

- Animating layout properties (`width`, `height`, `top`, `left`) instead of
  `transform` and `opacity`.
- Motion that runs regardless of `prefers-reduced-motion`.
- Perpetual attention-seeking loops on non-interactive elements.

## Pre-flight check

Upstream frames this as non-optional: run every box; any failure means the
output is not done.

- [ ] Design read declared as a one-liner
- [ ] Dial values explicit and reasoned, not silently baseline
- [ ] Design system chosen where applicable, or aesthetic labeled honestly
- [ ] Redesign mode detected and audit performed, if applicable
- [ ] Zero em-dashes anywhere user-visible
- [ ] Page theme lock holds
- [ ] Color consistency lock holds
- [ ] Shape consistency lock holds
- [ ] Every CTA passes WCAG AA against its background
- [ ] No CTA label wraps to two lines at desktop
- [ ] Form inputs, placeholders, focus rings, labels pass AA on their section
- [ ] Serif discipline: not the reflexive default, or justified
- [ ] Premium-consumer palette is not the beige-brass-oxblood-espresso default
- [ ] Italic descenders have leading and padding reserve
- [ ] Hero fits the viewport: headline ≤ 2 lines, subtext ≤ 20 words and ≤ 4
      lines, CTA visible without scrolling
- [ ] Reduced-motion path honored
- [ ] Dark mode verified if the page is consumer-facing

## Performance and accessibility guardrails

- Animate `transform` and `opacity`; avoid animating layout properties.
- `prefers-reduced-motion` is mandatory, not optional.
- Core Web Vitals targets apply to marketing pages, where they matter most.
- Keep DOM cost and z-index layering restrained.

Contrast and reduced motion are ship gates here. Deeper remediation — semantics,
keyboard traps, screen-reader flow, focus management — belongs to
`web-accessibility`.

## Reporting

State which tells were present, which dials moved and why, and which pre-flight
boxes were checked. "Made it look better" is not a report.
