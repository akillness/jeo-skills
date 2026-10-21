# Motion Primitives upstream evidence

## Identity and source-only boundary

- full_name: `ibelick/motion-primitives`
- Official repository: https://github.com/ibelick/motion-primitives
- Product/docs linked by README: https://motion-primitives.com/docs
- Immutable commit: `120f64f6ca60348e251f929e9c81f11ccbe45eda`
- Observed UTC: `2026-10-15T16:26:18Z`.
- Public GitHub repository search `q=motion user:ibelick`, per_page=20 returned two
  results, `total_count=2`, `incomplete_results=false`: this library and `ibelick/nim`.
  Nim's description identifies a website template built with Motion Primitives; the
  library's name, README, and homepage resolve the truncated candidate without a guess.
- Recursive tree at the pin returned `truncated=false` and includes `LICENCE.md`,
  component source, docs, registry builder sources, registry payloads, and CLI source.
- Public source/docs and bounded commit metadata only were inspected. No dependencies,
  installers, upstream scripts/builds/servers, browser sessions, paid services, credentials,
  or private data were used. No runtime compatibility or performance was established.
- This independently installable skill contains original prose and behavioral scenarios,
  not a copy of the upstream component implementation or docs.

## Exact immutable source coordinates

| Coordinate | Selected contract |
|---|---|
| [README.md](https://github.com/ibelick/motion-primitives/blob/120f64f6ca60348e251f929e9c81f11ccbe45eda/README.md) | Motion + Tailwind library, beta notice, official docs, license claim. |
| [package.json](https://github.com/ibelick/motion-primitives/blob/120f64f6ca60348e251f929e9c81f11ccbe45eda/package.json) | Private docs host; React ^18, Motion ^11.12.0, Next ^15.5.25, Tailwind ^4, TypeScript ^5. Not consumer peer guarantees. |
| [app/docs/installation/page.mdx](https://github.com/ibelick/motion-primitives/blob/120f64f6ca60348e251f929e9c81f11ccbe45eda/app/docs/installation/page.mdx) | Tailwind, Motion, utility helper, icons, registry/manual paths. |
| [components/website/installation-cli.tsx](https://github.com/ibelick/motion-primitives/blob/120f64f6ca60348e251f929e9c81f11ccbe45eda/components/website/installation-cli.tsx) — `InstallationCli` command list | `npx motion-primitives@latest add <value>` and shadcn remote JSON alternatives. Read, not executed. |
| [scripts/registry-components.ts](https://github.com/ibelick/motion-primitives/blob/120f64f6ca60348e251f929e9c81f11ccbe45eda/scripts/registry-components.ts) — `components` entries for text-effect, in-view, dialog, infinite-slider | Per-item dependency lists and dialog hook distribution; selected entries inspected, not complete registry coverage. |
| [lib/utils.ts](https://github.com/ibelick/motion-primitives/blob/120f64f6ca60348e251f929e9c81f11ccbe45eda/lib/utils.ts) — `cn` | Composes clsx and tailwind-merge; reuse an equivalent host helper. |
| [components/core/text-effect.tsx](https://github.com/ibelick/motion-primitives/blob/120f64f6ca60348e251f929e9c81f11ccbe45eda/components/core/text-effect.tsx) — `TextEffectProps`, `AnimationComponent`, `splitText`, `TextEffect` | String children; per/preset/trigger; speed arithmetic; sr-only text; no local reduced-motion policy. Whole component read. |
| [components/core/in-view.tsx](https://github.com/ibelick/motion-primitives/blob/120f64f6ca60348e251f929e9c81f11ccbe45eda/components/core/in-view.tsx) — `InViewProps`, `InView` | `useInView`, separate once state set on completion, semantic as, hidden/visible variants. Whole component read. |
| [components/core/dialog.tsx](https://github.com/ibelick/motion-primitives/blob/120f64f6ca60348e251f929e9c81f11ccbe45eda/components/core/dialog.tsx) — `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogContent` | Selected first 270 lines: controlled/uncontrolled state, usePreventScroll, cancel listener, body classes, native dialog modal, portal, naming IDs, exit coordination. Tail exports/close implementation not claimed as independently inspected. |
| [LICENCE.md](https://github.com/ibelick/motion-primitives/blob/120f64f6ca60348e251f929e9c81f11ccbe45eda/LICENCE.md) | Entire actual license file read; MIT copyright 2024 ibelick. |

## Whole-license observation

The entire `LICENCE.md` is MIT: permission to use, copy, modify, merge, publish,
distribute, sublicense, and sell software, conditioned on inclusion of the copyright
and permission notice in copies or substantial portions. The full warranty and liability
disclaimer was read. Preserve those notices when incorporating copied source.

The README links `/LICENSE.md`, but the complete recursive tree and fetched license
show the actual filename `LICENCE.md`. The actual file includes a trailing `app/page.tsx`
line after the standard MIT text; this is recorded as observed, not silently corrected.
No separate asset/image-rights audit or legal suitability opinion is provided.

## Implementation findings and adaptation gates

- Root `private: true` marks the website package. Do not prescribe installing its full
  dependency set or importing components from an imagined root runtime export.
- The registry lists only `motion` for dialog; source also imports `cn`, Lucide `X`, and
  a local `usePreventScroll` hook. Registry metadata is not a complete import-closure proof.
- TextEffect splits lines by explicit newline. Word mode preserves whitespace via spans;
  character mode uses string splitting, which needs application review for complex scripts.
- `speedReveal` and `speedSegment` are divisors; application-controlled zero/negative/
  nonfinite values need a defined boundary rather than relying on source validation.
- `trigger=false` causes an animated subtree removal, not an idle-but-readable pause.
- Word/character text has a separate sr-only string; line mode uses readable line spans.
  Preserve semantics and verify the accessible result after any customization.
- InView's own `once` state is set on animation completion; `viewOptions` independently
  reaches the Motion hook. Source does not promise all descendant loops stop offscreen.
- The inspected TextEffect and InView have no local reduced-motion handling. A host
  static branch/policy is a required adaptation, not a claimed upstream feature.
- The dialog uses native `showModal`, modal labeling, portal mounting, cancel handling,
  body scroll classes, and exit completion. These are reviewable mechanisms, not proof
  of focus return, concurrent-dialog safety, keyboard usability, or screen-reader behavior.
- CSS utilities/SSR client boundaries, aliases, dependency versions, and imported hooks
  must match the consumer. A Next docs host is not evidence that Vite is incompatible,
  nor proof that any untested React environment is supported.

## Source history versus documentation maintenance

At the pin, the recent five-commit window contains deployment/static-export, Shiki,
prefetch/Next upgrades, a link addition, and removal of `.vercelignore`.
HEAD `120f64f6...`, 2026-09-28, changes exactly one file: removes `.vercelignore`
(one changed line). Its timestamp is not evidence of newer component semantics.

A path-filtered query for `components/core/text-effect.tsx` returned:

- `e3f9549223d75e837d2df4ab134b33260d9d29b6`, 2025-06-04, message about InView once.
- `d8509946e928176671f3f4a84a5fee238f2ce5b8`, 2025-06-04, message about TextEffect variants/types.

These bounded path-history records establish source-related activity separately from
HEAD maintenance. Commit subjects alone do not establish every behavioral change;
this guide relies on the pinned implementation, not recency or popularity rankings.
No entire-history audit or claim of replacing another project follows from these dates.

## Canonical and duplicate decision

Keep `motion-primitives` for the named library's source-copy APIs, registry/helper
closure, text semantics, and dialog ownership. Retire no existing skills on this evidence.

The installed `react-bits/SKILL.md` targets a different source catalog and jsrepo workflow,
including GSAP/Three/Motion components. Shared use of Motion or similar visual examples
is not API identity. `optimize-web-animations/SKILL.md` owns measured offscreen work,
long-lived resource cleanup, and before/after profiling; keep it canonical for that task.

Expected local paths for `ui-component-patterns`, `motion-foundations`, and `motion-patterns`
were absent (direct existence checks false). Separate Codemode filename searches over
`.agent-skills` used exact globs `**/ui-component-patterns/SKILL.md`,
`**/motion-foundations/SKILL.md`, and `**/motion-patterns/SKILL.md`, with `hidden=true`,
`noIgnore=true`, `max=20`. Each returned `rows=[]`, `complete=true`, `truncated=false`,
`partial=[]`.
Scope kind `files`, timeout 30000ms, followSymlinks=false, includeExcluded=false,
standard heavy/cache exclusions. Body-level equivalence is therefore not established
for those optional skills. Primitive API architecture remains a design-system concern;
this operator includes the necessary host-owned checks without requiring another skill.

## Verification status

Repository identity, source contracts, whole license, and bounded history were observed.
No component runtime, CLI payload download/install, browser/a11y test, build, or benchmark
was executed. `evals/evals.json` scenarios are authored behavioral fixtures, not passing
test results. Live registries and future dependency versions can drift from this pin.
