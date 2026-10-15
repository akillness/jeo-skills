# Trickle UI Kit: inspected public source

## Identity and pin

- Candidate supplied: `github.com/akaieuan/trick…` / Trickle UI Kit.
- Resolved full_name: `akaieuan/trickle-UI-kit`.
- Official repository: https://github.com/akaieuan/trickle-UI-kit
- README, package repository field, and https://tricklekit.dev identify this same project:
  a text-animation registry, not a general-purpose UI framework.
- Observation UTC: `2026-10-15T16:24:49Z`.
- Immutable commit: `41129071f15271046bdca5d2ca332231b59e8d4d`.
- Commit date: `2026-07-26T21:30:03Z`; subject:
  `Fix registry installs: namespaced dep, cn import path, stale artifacts`.
- Source inspection only: no install, build, development server, visual demo, or paid
  service was run. Upstream commit-message verification claims are not our execution.

## Exact resolution/API provenance

```bash
gh api 'search/repositories?q=user%3Aakaieuan%20trickle&per_page=10'
gh api repos/akaieuan/trickle-UI-kit/commits/main
gh api 'repos/akaieuan/trickle-UI-kit/git/trees/41129071f15271046bdca5d2ca332231b59e8d4d?recursive=1'
gh api 'repos/akaieuan/trickle-UI-kit/contents/registry.json?ref=41129071f15271046bdca5d2ca332231b59e8d4d'
gh api 'repos/akaieuan/trickle-UI-kit/commits?path=registry/default/typewriter/typewriter.tsx&sha=41129071f15271046bdca5d2ca332231b59e8d4d&per_page=1'
```

Public search returned `total_count: 1`, `incomplete_results: false`, and this full_name.
The complete recursive tree returned `truncated: false`, 194 entries; case-insensitive
license/licence/copying/copyright/notice path search returned LICENSE and LICENSE-DEMOS.
Both entire files were fetched, not inferred from a badge. The selected registry was
decoded as JSON for two named entries; it contained 49 items, which is not the same claim
as README's 47 animation primitives. No partial result was treated as complete.

Raw reader requests used immutable base
`https://raw.githubusercontent.com/akaieuan/trickle-UI-kit/41129071f15271046bdca5d2ca332231b59e8d4d/`.

| Exact inspected coordinate | Evidence |
| --- | --- |
| [README.md](https://github.com/akaieuan/trickle-UI-kit/blob/41129071f15271046bdca5d2ca332231b59e8d4d/README.md), Quick install, Architecture, Browser support, Versioning, License | Source-registry distribution; no npm package; CSS primitives versus five stateful components; compatibility/marketing claims. Entire README including lines 301–338 retrieved. |
| [package.json](https://github.com/akaieuan/trickle-UI-kit/blob/41129071f15271046bdca5d2ca332231b59e8d4d/package.json), dependencies, engines, scripts | Private app 0.1.0; Next ^16.2.4, React ^19.2.5, Tailwind ^4.2.4; Node >=20, pnpm 10.4.1. Older README badges are not package truth. |
| [registry.json](https://github.com/akaieuan/trickle-UI-kit/blob/41129071f15271046bdca5d2ca332231b59e8d4d/registry.json), items named typewriter and word-cascade | Target files, CSS tokens/keyframes/reduced-motion overrides; absolute text-root dependency for Typewriter. |
| [registry/default/text-root/text-root.tsx](https://github.com/akaieuan/trickle-UI-kit/blob/41129071f15271046bdca5d2ca332231b59e8d4d/registry/default/text-root/text-root.tsx), useTextRoot, TextRootOptions, effects | Media-query state/listener cleanup; mount timer cleanup; one-shot view observer and uncancelled delayed view timeout. |
| [registry/default/typewriter/typewriter.tsx](https://github.com/akaieuan/trickle-UI-kit/blob/41129071f15271046bdca5d2ca332231b59e8d4d/registry/default/typewriter/typewriter.tsx), TypewriterProps, Typewriter, typing effect | Client state, strings/text precedence, delays/loop, per-step timeout cleanup, visual/accessible spans. |
| [registry/default/word-cascade/word-cascade.tsx](https://github.com/akaieuan/trickle-UI-kit/blob/41129071f15271046bdca5d2ca332231b59e8d4d/registry/default/word-cascade/word-cascade.tsx), WordCascadeProps and WordCascade | No client directive/hooks; whitespace-preserving split, CSS delays, parent aria-label. |
| [public/r/typewriter.json](https://github.com/akaieuan/trickle-UI-kit/blob/41129071f15271046bdca5d2ca332231b59e8d4d/public/r/typewriter.json), files, registryDependencies, cssVars, css | Generated source, target component path, absolute dependency, caret token/keyframe and reduced-motion override. |

## Complete license observation

[LICENSE](https://github.com/akaieuan/trickle-UI-kit/blob/41129071f15271046bdca5d2ca332231b59e8d4d/LICENSE)
was fetched in its entirety. It is MIT, copyright (c) 2026 trickle contributors. It grants
use, copying, modification, merging, publishing, distribution, sublicensing and selling,
conditioned on retaining the copyright/permission notice in copies or substantial portions.
The complete notice disclaims warranties and liability. Retain the actual full upstream
notice with reused code, not merely this summary.

[LICENSE-DEMOS](https://github.com/akaieuan/trickle-UI-kit/blob/41129071f15271046bdca5d2ca332231b59e8d4d/LICENSE-DEMOS)
was fetched in its entirety. It dedicates only registry/examples files under CC0 1.0;
allows copying, modification, distribution and commercial use without asking permission;
states all other repository files are MIT; and links the full CC0 legal text at
https://creativecommons.org/publicdomain/zero/1.0/ . The file is a scoped dedication,
not an included copy of that full legal code. The external full legal code was not
retrieved during this inspection. No demo source or unrelated site asset was copied.

These are observed grants for this pin, not warranties about embedded third-party assets,
trademarks, fonts, dependencies, or changed live registry responses. Operator prose is
original; no component implementation is vendored in this skill.

## Source/claim distinctions

1. README says pure-CSS animation and zero runtime. WordCascade is CSS-driven, but
   Typewriter is a client component using timeouts and state. No motion-engine dependency
   is different from zero JavaScript or zero runtime work.
2. README describes a visible no-JS final-text fallback. Typewriter initializes visual
   displayed state to empty and puts finalText in an sr-only span. Source does not support
   promising visually complete no-JS Typewriter. Verify first paint, hydration and static
   fallback in the target instead of repeating the claim.
3. TextRoot removes media listeners, clears mount delay and disconnects the observer. Its
   delayed view branch schedules a timeout without saving/clearing it. Unmount during
   that delay needs separate cleanup review. This is source evidence, not a runtime
   reproduction. View readiness also does not pause a running loop offscreen.
4. Generated Typewriter source still contains @/registry/default/text-root/text-root
   while the dependency targets a consumer components folder. Inspect installed imports
   or CLI rewrite behavior; no install established whether rewriting works.
5. WordCascade's manifest supplies animate-trickle-cascade, from/to keyframes and a
   reduced-motion override with visible opacity/transform reset. Copying only TSX omits
   that behavior. Unsupported masks/@property elsewhere need per-component inspection.

The path-specific latest Typewriter commit equals the selected SHA: these source and
registry changes are substantive, not merely a docs/lockfile timestamp. That does not
establish superiority over competitors or justify skill retirement.

## Duplication decision

Local web-design selects visual recipes; local react-bits owns its animated-component
catalog; local optimize-web-animations owns measured resource audits. The provided
catalog's ui-component-patterns entry describes primitive/slot/variant APIs, but its
expected local SKILL.md was absent; that comparison is catalog-level only. The installed
design-system is the actual primitive-API route per the lead's decision.
Keep the existing owners. This operator's distinct job is Trickle registry selection,
CSS/dependency delivery and stateful-text caveats. No retirement recommended.

## Execution boundary

Source analysis is read-only. Authorized consumers may reuse MIT source with its full
notice; check separate asset rights. Registry installation executes network CLI code and
writes components/CSS, requiring task authority. Docs-app build scripts are not selection
prerequisites. Browser, accessibility, lifecycle and performance outcomes remain unverified
until target checks are actually run.
