# Canvas UI: source evidence

## Identity and observation

- Candidate supplied: `github.com/DavidHDev/canv…`, labeled Canvas UI.
- Resolved `full_name`: `DavidHDev/canvas-ui`.
- Official repository: <https://github.com/DavidHDev/canvas-ui>.
- Official documentation linked by its README: <https://canvasui.dev/docs>.
- Immutable observed revision: `a04a99b235299ee79a123a16ccb2e6cf9da74b6b`.
- Observation UTC: `2026-10-15T16:23:57Z`.
- Public search: `gh api --method GET search/repositories -f q='user:DavidHDev canv' -f per_page=10`.
- Search returned one public match, `total_count=1`, `incomplete_results=false`.
- The recursive Git tree at this SHA returned `truncated=false`.

This audit read public source/docs and license only. No upstream install, build,
server, component execution, browser flags or origin-trial registration occurred.

## Selected inspected coordinates

Paths are relative to [this immutable tree](https://github.com/DavidHDev/canvas-ui/tree/a04a99b235299ee79a123a16ccb2e6cf9da74b6b).

| Source | Inspected coordinates and established contract |
| --- | --- |
| [README.md](https://github.com/DavidHDev/canvas-ui/blob/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/README.md) | Entire file; `Quick start`, `WebGL and WebGPU`, `Browser support`, `License`. Official registry spelling and site links. Marketing claims are not independent evidence. |
| [installation/page.tsx](https://github.com/DavidHDev/canvas-ui/blob/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/src/app/%28shell%29/docs/installation/page.tsx#L18-L163) | Entire file; USAGE variants and PAGE_MARKDOWN requirements, install and manual-copy sections. React 19, Vue 3.5, Svelte 5, Solid 1.9, Preact 10 and vanilla documented targets; source at selected pin remains authoritative. |
| [rendering/page.tsx](https://github.com/DavidHDev/canvas-ui/blob/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/src/app/%28shell%29/docs/rendering/page.tsx#L20-L87) | Entire file; renderer table, `How it works`, `Pinch zoom`: WebGL default, WebGPU through vgpu, public lifecycle shape and resolution limits. |
| [Liquid.tsx](https://github.com/DavidHDev/canvas-ui/blob/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/src/lib/Liquid/Liquid.tsx) | Entire wrapper; `LiquidProps`, `useSyncExternalStore`, create/update/destroy effects; semantic HTML fallback and decorative output canvas. |
| [LiquidVanilla.ts](https://github.com/DavidHDev/canvas-ui/blob/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/src/lib/Liquid/LiquidVanilla.ts#L801-L1027) | Selected source windows: exported types L5–55, capability probe L319, factory L333, bounded input/frame work L801–858, motion and visibility L864–908, intersection L965–972, `setOptions` L980 onward, `destroy` L1009 onward. Not every shader or engine line was inspected. |
| [ParticleScroll.tsx](https://github.com/DavidHDev/canvas-ui/blob/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/src/lib/ParticleScroll/ParticleScroll.tsx) | Entire wrapper; `native` capability branch and output `display: native ? "block" : "none"` retain DOM-only fallback. |
| [registry.ts](https://github.com/DavidHDev/canvas-ui/blob/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/src/lib/registry.ts#L210-L260) | Selected assembly windows: shared helper inlining L210–219, engine filenames L224–227, `makeStandalone` L243–260, dependency composition L280–293, source variants L314 onward and registry files L417–447. |
| [build-registry.mts](https://github.com/DavidHDev/canvas-ui/blob/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/scripts/build-registry.mts#L28-L35) | Selected metadata/file serialization window, not executed. |
| [LICENSE.md](https://github.com/DavidHDev/canvas-ui/blob/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/LICENSE.md) | Entire file read and reproduced below, including the distribution restriction and warranty clause. |

## Source-grounded usage and caveats

Inspected install examples are `npx shadcn@latest add @canvas-ui/liquid-react`
and `npx shadcn@latest add @canvas-ui/liquid-react-webgpu`. These are mutable
registry operations, not SHA-pinned installation guarantees. Ask before execution
and review generated files/dependencies in the target project.

Liquid's React wrapper imports its engine from `./LiquidVanilla`; the engine
imports helper modules. Copying only that raw wrapper is not equivalent to the
generated standalone source. Registry assembly inlines engine and helper code.
The docs' wrapper example imports `Liquid` from `@/components/canvasui/Liquid`.
Vanilla examples call `createLiquid({source, content, output}, options)`,
`setOptions()` and `destroy()`; inspect the chosen variant before reuse.

The inspected Liquid engine caps queued imperative splats at 64 and applies at
most eight splats per frame; it suspends on hidden/offscreen state, gates pointer
input on reduced motion, and removes owned resources on destroy. These are
source observations, not stress-test or whole-catalog guarantees. In particular,
reduced-motion pointer gating does not prove every autonomous effect is static.

HTML-in-Canvas capability and WebGPU availability are separate checks. The docs
mention browser flags and domain-bound origin trials; availability and expiry
must be checked again before deployment. The README's broad GPU-overlay fallback
language is not universal: ParticleScroll specifically hides its overlay and
uses ordinary DOM in the inspected fallback. WebGPU version tables are upstream
documentation assertions, not this audit's tested browser matrix.

The rendering guide describes DPR/zoom and buffer limits (8192 pixels per
axis and 16 megapixels, subject to lower device limits). A cap does not establish
low CPU/GPU use, frame rate or visual equivalence. Measure on target devices.
Preserve semantic HTML, keyboard focus, contrast, zoom and static/reduced-motion
content; inspect actual resource disposal for each added component.

## Comparison and substantive-change decision

Local `react-bits` covers DavidHDev's separate animated React component project;
it is not superseded by a framework-spanning HTML-in-Canvas effect library.
`web-design` routes MengTo visual recipes; `design-taste-frontend` supplies
Leonxlnx-based page direction. Keep all three. No retirement is recommended.

Observed HEAD is dated `2026-10-03T14:24:48Z`, message `Merge #43 and fix canvas
zoom and Safari fallback`. Its file list includes implementation changes to
Liquid/Frost engines, ParticleScroll wrappers, viewport helpers and added browser
regression scripts. Those are substantive runtime changes, not just chore
metadata. This audit did not execute those scripts or compare their runtime
results. The raw Liquid React wrapper's latest path-history commit is
`3ec350bfd31dcbff9969b44f8639fde5780f4ddb` (`export fixes`, 2026-07-21),
so wrapper history alone would miss later engine work. Neither history proves
Canvas UI replaces React Bits or any taste operator.

## Complete license observation

The entire pinned `LICENSE.md` reads:

```text
# MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of
an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as
you do not sell, sublicense, or redistribute the components themselves -
whether alone, in a bundle, or as a ported version.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Treat this as restricted source-available component code, not plain MIT or an
independent open-source certification. The README's phrase “only restricts
selling the library itself” is narrower than the file's explicit redistribution
and sublicensing language; follow the full license and obtain permission when
needed. This operator bundles no upstream component code, models, media or fonts.
Separate model license files exist in the complete tree and were not evaluated;
the repository-wide license is not an asset-rights clearance.
Behavioral fixtures are authored scenarios, explicitly not executed results.
