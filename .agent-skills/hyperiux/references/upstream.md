# Hyperiux upstream evidence

## Identity and inspection boundary

- full_name: `Hyperiux-Immersion-Labs/hyperiux-components`
- Official repository: https://github.com/Hyperiux-Immersion-Labs/hyperiux-components
- Official product linked by README/package metadata: https://vault.hyperiux.com
- Immutable commit: `71f73983fa70e56b81de5bdcf6eb49d0a5fcf5ba`
- Observed UTC: `2026-10-15T16:26:18Z`.
- Public GitHub search `q=Hyperiux`, per_page=20 returned one repository,
  `total_count=1`, `incomplete_results=false`; no guessed owner suffix was used.
- README, package repository field, and homepage agree on identity. The recursive
  tree at the pin returned `truncated=false`; selected files below were read.
- Scope: public repository metadata, selected docs/source, whole license files, and
  bounded public history. No install, upstream executable, build, server, browser,
  paid service, account/token flow, or runtime experiment was executed.
- Original operator prose only; no effect code is vendored or repackaged here.

## Exact pinned coordinates

All links below are immutable. Symbols identify the inspected implementation contract.

| Coordinate | Evidence used |
|---|---|
| [README.md](https://github.com/Hyperiux-Immersion-Labs/hyperiux-components/blob/71f73983fa70e56b81de5bdcf6eb49d0a5fcf5ba/README.md) — Requirements, Architecture, Quick Start, License | Node 18+, documented Next App Router/Tailwind baseline, source-copy CLI, public/pro separation. |
| [packages/cli/package.json](https://github.com/Hyperiux-Immersion-Labs/hyperiux-components/blob/71f73983fa70e56b81de5bdcf6eb49d0a5fcf5ba/packages/cli/package.json) — name/version/bin/exports/engines | `hyperiux` 1.1.4 is an installer, not an importable library; Node >=18. |
| [packages/cli/src/utils/config.js](https://github.com/Hyperiux-Immersion-Labs/hyperiux-components/blob/71f73983fa70e56b81de5bdcf6eb49d0a5fcf5ba/packages/cli/src/utils/config.js) — `DEFAULT_CONFIG`, `detectProjectEnvironment`, `detectNextRouter`, `detectTailwindConfig` | `hyperiux.json`; Next/React detection, app/pages routing, CSS-first Tailwind handling. Selected first 210 lines, not the entire utility module. |
| [packages/cli/src/commands/add.js](https://github.com/Hyperiux-Immersion-Labs/hyperiux-components/blob/71f73983fa70e56b81de5bdcf6eb49d0a5fcf5ba/packages/cli/src/commands/add.js) — `add`, `stampProjectReadme`, `resetGlobalCss`, `getImportPath` | Source read through end. Auth/registry fetch precede dry run; dependencies/file/config/lock/README writes and telemetry; CSS overwrite. |
| [registry/effects/text/rectangular-text-reveal/registry.json](https://github.com/Hyperiux-Immersion-Labs/hyperiux-components/blob/71f73983fa70e56b81de5bdcf6eb49d0a5fcf5ba/registry/effects/text/rectangular-text-reveal/registry.json) | Free tier, version 1.1.0, GSAP dependency, default export/import target, prop metadata. |
| [registry/effects/text/rectangular-text-reveal/index.tsx](https://github.com/Hyperiux-Immersion-Labs/hyperiux-components/blob/71f73983fa70e56b81de5bdcf6eb49d0a5fcf5ba/registry/effects/text/rectangular-text-reveal/index.tsx) — `RectangularTextReveal`, reduced-motion branch, cleanup, render | Client React, SplitText/CustomEase/ScrollTrigger; props and cleanup inspected. Initial opacity zero; lower-motion branch still translates 32px. |
| [LICENSE](https://github.com/Hyperiux-Immersion-Labs/hyperiux-components/blob/71f73983fa70e56b81de5bdcf6eb49d0a5fcf5ba/LICENSE) | Entire file read: MIT, copyright 2026 Hyperiux, permission/notice requirement and warranty/liability disclaimer. |
| [LICENSE_EFFECTS](https://github.com/Hyperiux-Immersion-Labs/hyperiux-components/blob/71f73983fa70e56b81de5bdcf6eb49d0a5fcf5ba/LICENSE_EFFECTS) | Entire file read, custom Effects License v1.0; all sections 1–8 observed. |

## License boundary and conflicting metadata

The repository search description calls free effects MIT. The actual README license
section and full `LICENSE_EFFECTS` distinguish MIT tooling from restricted Effects.
Use the applicable license text rather than that repository-description shorthand.
This operator does not make a legal compatibility determination for a user's project.

Effects License v1.0 covers effects obtained via CLI, docs, or other Hyperiux channels,
including both free and Pro tiers. Sections 1–2 define the product and permit installing,
modifying, and incorporating effects in unlimited personal/commercial finished projects,
with no attribution required. Section 3 restricts standalone source/snippet/template/
boilerplate/starter/library redistribution, registry/code-sharing distribution of effects
on their own, competing registries/CLIs, and removing embedded license/copyright notices.

Section 4 requires active Pro status at installation; previously installed effects remain
usable after lapse, while new installs/updates stop. Sections 5–6 retain ownership and
terminate rights on breach, with stated surviving sections. Section 7 disclaims warranty
and liability. Section 8 describes severability and applies future revisions to installs
after publication. Public visibility does not remove these restrictions.

Keep this skill to original guidance and links. A user request for reusable effect source
bundles, a paid effect, or competing registry requires a different permissions decision;
reading the public pin gives neither a subscription nor redistribution permission.

## Operational caveats established from source

- The CLI detects React/Vite and Next Pages Router, but rejects `next-transition-router`
  dependencies outside Next App Router. Broad detection is not a support guarantee.
- `add --dry-run` reaches registry/auth reads before exiting. It is a network-bearing
  installer operation, not an offline source-only inspection command.
- The write phase calls `resetGlobalCss`: `fs.writeFileSync` replaces the configured
  stylesheet with the Tailwind import. Existing CSS preservation is a hard review gate.
- The reveal source defaults overlay color to `#ffffff`; registry props say `#111111`.
  Source controls the implementation; flag docs/registry disagreement before relying on defaults.
- Reduced motion is sampled at effect setup; the inspected lower-motion branch is not
  static, and initial rendered content is hidden until the effect changes opacity.
- Cleanup kills timeline/trigger, reverts split text, and removes wrappers. This supports
  a lifecycle review checklist; it does not prove no leaks or universal accessibility.

## Source history versus maintenance recency

- HEAD `71f73983...`, 2026-10-07, message `fixed CI checks`: commit files are root
  `package.json`, MCP package metadata, and `pnpm-lock.yaml`; no effect source changed.
- The recent five-commit window also contains MCP listing/docs and Vitest maintenance.
- Path-filtered history for the inspected effect returned `f665ef969f4f0deef7fcf311819d1a28123fd260`,
  2026-08-26, message about JSX-to-TSX registry conversion/new component source. This is
  evidence of source-path history, not proof that all motion behavior changed that day.
- Bounded history is not a full changelog audit. A newer HEAD date does not establish
  that this catalog supersedes another animation library or existing local skill.

## Canonical and duplicate decision

Keep `hyperiux` as the exact-project operator: its restricted effect license, installer
side effects, public/pro boundary, and per-effect registry contract are distinct.
Retire no existing skills on this evidence.

The installed `react-bits/SKILL.md` describes another source catalog with jsrepo and
GSAP/Three/Motion integrations; overlapping visual categories do not make APIs interchangeable.
The installed `optimize-web-animations/SKILL.md` owns baseline profiling and offscreen/
resource evidence rather than this vendor-specific acquisition contract; keep it canonical
for that performance task.

`ui-component-patterns`, `motion-foundations`, and `motion-patterns` were absent at their
expected local paths (direct existence checks false). Separate Codemode filename searches
over `.agent-skills` used exact globs `**/ui-component-patterns/SKILL.md`,
`**/motion-foundations/SKILL.md`, and `**/motion-patterns/SKILL.md`, with `hidden=true`,
`noIgnore=true`, `max=20`. Each returned `rows=[]`, `complete=true`, `truncated=false`,
`partial=[]`.
Scope kind was `files`, timeout 30000ms, followSymlinks=false, includeExcluded=false,
with standard heavy/cache exclusions. Thus no body-level equivalence or retirement
claim is made for those absent optional skills. Primitive API architecture belongs to
the host design system; this operator remains independently usable without them.

## Evidence limits

This pin supports source-level claims only. Runtime rendering, third-party plugin/license
changes, current live registry behavior, CLI distribution integrity, accessibility,
production performance, and all Pro source remain unverified. Authored eval scenarios
are review fixtures, not executions. No elite design or performance outcome is claimed.
