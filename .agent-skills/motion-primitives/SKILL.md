---
name: motion-primitives
description: >
  Inspect, integrate, and adapt ibelick/motion-primitives React components from their
  source and registry definitions. Use when the user names Motion Primitives,
  motion-primitives.com, TextEffect, InView, or its composable dialogs in that library's
  context; cover component selection, copied-source dependencies, accessibility,
  reduced motion, and lifecycle checks. Not a general Motion SDK tutorial or a
  replacement for profiling animation regressions in an existing page.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: React web components using motion/react and Tailwind CSS; Next.js docs host is not an installable runtime library. Inspect the selected component's imports and host framework before integration.
metadata:
  version: "1.0.0"
  source: https://github.com/ibelick/motion-primitives
---

# Motion Primitives

Use the named library's source-copy contract instead of assuming an npm runtime API.
Version: 1.0.0. [Pinned evidence](references/upstream.md) is source inspection, not execution.

## When to use this skill

- Select or customize an exact `ibelick/motion-primitives` component in a React web app.
- Reconcile a docs example with its registry payload, helpers, exports, or installed source.
- Review the library's text, in-view, or dialog behavior before application integration.

For custom `motion/react` animation unrelated to this library, use the host project's
motion conventions. For React Bits, use that separate catalog's source and API.
For measured leaks or long-session slowdown, run an animation-profiling workflow rather
than assuming adopting this library fixes the bottleneck.

## Instructions

### 1. Bound the component request

Name the component, host route, state owner, intended interaction, and permitted operation:
source review, project integration, or repair. Read the selected pinned source and docs.
Treat the README's beta notice as a reason to pin and compare, not a quality guarantee.
Completion: one component contract and one host-owned outcome are explicit.

### 2. Resolve the distribution and dependency contract

The root `package.json` is private and describes the documentation app, not a library
that consumers should install wholesale. Components are copied into the application.
Read `components/core/<name>.tsx` and its entry in `scripts/registry-components.ts`.
Carry required helper/hook files and verify their imports rather than copying only JSX.
The inspected `cn` helper uses `clsx` and `tailwind-merge`; reuse a compatible host helper.
Registry dependencies can be incomplete relative to source imports: the inspected dialog
also imports `lucide-react`, `cn`, and `usePreventScroll` despite declaring only `motion`.
The docs prescribe Tailwind, Motion, the utility helper, and icons. Install only what the
chosen component actually needs, with approval for package changes.

The inspected docs host uses React ^18, Motion ^11.12.0, Next ^15.5.25, Tailwind ^4.0.0,
and TypeScript ^5. These are observed host versions, not universal consumer requirements.
Client components import from `motion/react`; keep their client boundary in SSR hosts.
React/Vite use needs the same DOM, styles, utilities, and alias adaptation; it was not run.
No Vue, React Native, or native-platform support is established by this source inspection.
Completion: each imported package/helper and each target path is accounted for.

### 3. Choose an approved acquisition path

The pinned docs present these alternatives; neither was executed for this guide:

```text
npx motion-primitives@latest add text-effect
npx shadcn@latest add "https://motion-primitives.com/c/text-effect.json"
```

A live registry and `@latest` can differ from the inspected commit. Resolve versions,
review the payload and target files, and obtain approval before installer/package writes.
Manual integration from a reviewed pin is an alternative under MIT; preserve copyright
and permission notices with copied or substantial source. Do not reinitialize a working
Tailwind/shadcn setup just to match the docs application's layout.
Completion: the acquired source, dependency delta, and approved writes are identified.

### 4. Use the selected API, not inferred names

`TextEffect` is a named export with string children, `per: word | char | line`,
`preset: blur | fade-in-blur | scale | fade | slide`, `trigger`, and transition controls.
`speedReveal` divides stagger time and `speedSegment` divides duration; keep both positive
and finite at the application boundary. `per="line"` splits on newline, not visual wrapping.
Word/character modes provide an `sr-only` string and hide animated glyphs from assistive
technology; preserve this arrangement when customizing rather than announcing each glyph.
`trigger=false` removes the text subtree through AnimatePresence; it is not merely a pause.

`InView` accepts hidden/visible variants, transition, viewOptions, as, and once.
Its separate `once` prop stores completion state after animation; `viewOptions` is also
passed to Motion's observation hook. Inspect both before promising replay semantics.
Use semantic `as` values appropriate to the host content; observer entry is not proof
that descendant RAF loops, timers, or unrelated animation have stopped offscreen.

`Dialog` exposes controlled `open`/`onOpenChange` and uncontrolled `defaultOpen`.
Keep one state owner and use its trigger/content/title/description/close composition.
The inspected content uses native `motion.dialog`, a portal, modal naming IDs, and
`showModal`; cancellation, exit animation, body scroll classes, and close are coordinated.
Completion: the chosen props match source types and host state transitions.

### 5. Gate motion, semantics, and resource ownership

Treat these as integration requirements, not upstream certification.
The inspected TextEffect and InView files contain no local reduced-motion policy.
Provide a static readable branch or appropriate host policy for users requesting less
motion; reducing duration alone does not remove repeated motion or large displacement.
Keep focus visible, support keyboard activation, and ensure pointer-only effects are
optional decorations with touch/keyboard equivalents for meaningful interactions.
For dialogs, verify accessible title/description, initial focus, Tab containment, Escape,
backdrop dismissal, restored trigger focus, and controls usable during/after exit.
Check controlled close/reopen and multiple dialogs before relying on shared body classes.
For split/animated text, verify reading order, line wrapping, zoom, localization, and
readable final content; avoid live-region announcements on every decorative frame.
Preserve effect/listener/observer cleanup, scroll unlock, and portal teardown on route exit.
Bound repeated text and blur effects; prefer a small component-specific dependency graph.
Completion: each motion fallback, semantic interaction, and cleanup owner is named.

### 6. Verify at the level actually exercised

After authorized integration, check the actual route's interaction, reduced-motion mode,
resize/zoom, route remount, rapid state toggles, and relevant keyboard/touch behavior.
For performance requests, compare a baseline and the same post-change interaction;
a screenshot or successful install cannot establish idle CPU or lifecycle stability.
For source-only work, state that browser behavior, compilation, registry reachability,
and compatibility with newer Motion versions remain unverified.

## Examples

- “Use Motion Primitives TextEffect for a heading.” Check string children and semantic `as`,
  keep positive speed inputs, supply readable reduced-motion output, then adapt host imports.
- “Animate our hand-written modal with Motion.” Prefer the existing modal semantics and
  host motion policy; selecting this library's dialog is a separate architectural choice.

## References

- [Pinned upstream evidence](references/upstream.md): source coordinates, license, history, overlap.
- [Authored scenarios](evals/evals.json): positive/negative fixtures, explicitly not executed.
