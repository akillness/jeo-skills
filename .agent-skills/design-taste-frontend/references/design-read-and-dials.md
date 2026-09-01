# Design Read and Dials

Operative rules bundled from `Leonxlnx/taste-skill` commit
`ccbc15639c97057cbfcf32ecebc38ef716e4bb37` (2026-08-24), MIT licensed,
© leonxlnx. Redistributed under MIT with attribution. This file is the working
reference — normal operation does not require the upstream install.

## The design read

One line, before any code:

> Reading this as: `<page kind>` for `<audience>`, with a `<vibe>` language,
> leaning toward `<design system or aesthetic family>`.

Worked examples from upstream:

- *B2B SaaS landing for technical buyers, Linear-style minimalist language,
  leaning toward Tailwind utilities plus Geist and restrained motion.*
- *Solo designer portfolio for hiring managers, editorial and kinetic-type
  language, leaning toward native CSS plus scroll-driven animation.*
- *Redesign of a public-sector service site, trust-first language, leaning
  toward GOV.UK Frontend or USWDS.*

### Signals to read first

1. **Page kind** — landing (SaaS, consumer, agency, event), portfolio (dev,
   designer, studio), redesign (preserve or overhaul), editorial or blog.
2. **Vibe words the user actually used** — minimalist, calm, Linear-style,
   Awwwards, brutalist, premium consumer, Apple-y, playful, serious B2B,
   editorial, glassy, dark tech.
3. **Reference signals** — URLs linked, screenshots pasted, products named,
   competitors mentioned.
4. **Audience** — a procurement panel and a design-conscious consumer want
   different pages. The audience picks the aesthetic, not your taste.
5. **Existing brand assets** — logo, color, type, photography. On a redesign
   these are starting material, not optional input.
6. **Quiet constraints** — accessibility-first audiences, public sector,
   regulated industries, trust-first commerce, children's products. These
   **override** aesthetic preference.

### Asking questions

Ask exactly one clarifying question, and only when the read genuinely diverges:
*"Closer to Linear-clean or Awwwards-experimental?"* If context supports a
confident inference, declare it and proceed. A multi-question dump is its own
failure.

## The three dials

| Dial | 1 | 10 | Baseline |
|---|---|---|---|
| `DESIGN_VARIANCE` | perfect symmetry | artsy chaos | 8 |
| `MOTION_INTENSITY` | static | cinematic, physics-driven | 6 |
| `VISUAL_DENSITY` | art gallery, airy | cockpit, packed data | 4 |

Baseline `8 / 6 / 4`. Overrides happen conversationally — never instruct the
user to edit the skill file. Use these exact variable names; upstream
cross-references them and aliases like `ANIM_LEVEL` break those references.

### Inference table

| Signal | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| minimalist, clean, calm, editorial, Linear-style | 5-6 | 3-4 | 2-3 |
| premium consumer, Apple-y, luxury, brand | 7-8 | 5-7 | 3-4 |
| playful, wild, Dribbble, Awwwards, experimental, agency | 9-10 | 8-10 | 3-4 |
| landing page, portfolio, marketing site (default) | 7-9 | 6-8 | 3-5 |
| trust-first, public-sector, regulated, a11y-critical | 3-4 | 2-3 | 4-5 |
| redesign, preserve | match existing | +1 | match existing |
| redesign, overhaul | +2 | +2 | match existing |

### Use-case presets

| Use case | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| Landing, SaaS mainstream | 7 | 6 | 4 |
| Landing, agency or creative | 9 | 8 | 3 |
| Landing, premium consumer | 7 | 6 | 3 |
| Portfolio, designer or studio | 8 | 7 | 3 |
| Portfolio, developer | 6 | 5 | 4 |
| Editorial or blog | 6 | 4 | 3 |
| Public-sector service | 3 | 2 | 5 |

## Design system versus aesthetic

Reach for an official package when the brief implies an established language:
Material Web, Fluent UI, Carbon, GOV.UK Frontend, USWDS, Atlassian, Polaris.
Upstream ships install commands per system in its appendix.

When the brief is an aesthetic rather than a system, name the family honestly —
editorial, brutalist, Swiss, kinetic-type, dark-tech — and execute it
deliberately. The failure mode is neither of these: an unnamed default that is
just the model's prior.

## Redesign mode

Detect preserve versus overhaul as the first action, then audit before touching
anything.

**Never changes silently:** logo, brand color, product naming, legal and
compliance copy.

**Modernisation levers, in priority order:** typography, spacing and rhythm,
hierarchy, motion, materiality. Pull the earliest lever that achieves the brief
and say which one you used.

For preserve mode, match existing variance and density and add at most one point
of motion. For overhaul, add two points to variance and motion while holding
density to the existing content reality.
