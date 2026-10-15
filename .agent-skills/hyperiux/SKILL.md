---
name: hyperiux
description: >
  Inspect and integrate Hyperiux Vault effects from Hyperiux-Immersion-Labs/hyperiux-components.
  Use when the user names Hyperiux, the hyperiux CLI, hyperiux.json, or a Vault effect;
  choose public-source review, approved project integration, or lifecycle repair.
  Distinguish MIT tooling from restricted Effects licensing and review installer CSS changes
  before execution. Not a generic animation library selector or a Pro-access bypass.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: Requires source-reading tools; approved CLI use requires Node.js 18+ and a compatible React web project. Next.js App Router is the documented baseline; per-effect constraints apply.
metadata:
  version: "1.0.0"
  source: https://github.com/Hyperiux-Immersion-Labs/hyperiux-components
---

# Hyperiux

Operate the source-copy effect library, not an importable `hyperiux` runtime package.
This guide contains original instructions, not redistributed effect implementations.
Version: 1.0.0. Evidence is source-only at the pin in [upstream](references/upstream.md).

## When to use this skill

- Inspect an exact Vault effect, its dependencies, license, exports, or React lifecycle.
- Plan an approved effect integration or diagnose an installed effect in the host project.
- Review CLI writes before allowing `init` or `add` to touch an existing application.

For another named library, follow that library's own source rather than translating its API.
For an existing page's measured animation leak or offscreen-work audit, use a performance
workflow; retain this guide for Hyperiux-specific source and installer behavior.

## Instructions

### 1. Select a bounded operation

Record the requested effect, host route, desired interaction, and whether the task permits
source reading only or application mutation. Default an inspection request to source-only.
Read the pinned evidence before selecting a component or proposing a command.
Completion: one effect and one operation are named, with execution permission explicit.

### 2. Resolve license and framework before design

Read `LICENSE_EFFECTS` for effect use, even when metadata says `tier: free`.
The CLI/MCP MIT license does not make their installed effects MIT.
Effects may be used and modified within finished projects under the custom license;
standalone snippets, templates, libraries, registries, and competing distribution are restricted.
Link upstream source; keep effect source out of this skill and reusable template packages.
Treat Pro acquisition, account access, credentials, subscription spending, and external
MCP configuration as separate approval boundaries. Keep public-source tasks public.

Confirm the host's React, router, Tailwind setup, aliases, and existing dependency versions.
The README targets Next.js App Router. CLI detection also recognizes React/Vite and
Pages Router, but detection is not proof that every effect supports them.
`add` rejects effects depending on `next-transition-router` outside Next App Router.
No Vue, native-mobile, or framework-agnostic support is established by this inspection.
Completion: eligible license use and effect-specific host compatibility are recorded.

### 3. Inspect the exact implementation

Read its `registry.json` and source together. Record `tier`, dependencies, registry
 dependencies, `exportName`, `exportKind`, file targets, client boundary, and public props.
Prefer actual source when defaults differ from registry metadata; report the discrepancy.
For the inspected `rectangular-text-reveal`, source is a default React client component
using GSAP `SplitText`, `CustomEase`, and `ScrollTrigger`; it is not a Motion component.
Its `as`, `direction`, `once`, `triggerStart`, and timing props control the installed component.
The source defaults `overlayColor` to white while registry props describe a dark value.
Completion: every selected import and required helper has a source coordinate.

### 4. Review installer side effects before approval

The following are documented commands, not instructions to execute during inspection:

```text
npx hyperiux init
npx hyperiux add rectangular-text-reveal --dry-run
npx hyperiux add rectangular-text-reveal
```

Resolve a reviewed CLI version before approved execution; an unversioned `npx` can drift.
The pinned CLI package is `hyperiux` 1.1.4, Node >=18, and installer-only.
`add --dry-run` still reads auth state and fetches the registry before the preview branch;
it is neither offline nor a permission-free preflight.
A real `add` can install dependencies, recurse into registry dependencies, write effect
files, update config/lock state, record install stats, stamp README, and send telemetry.
Most importantly, pinned `resetGlobalCss` overwrites the configured CSS file with only
`@import "tailwindcss";`. Treat loss of existing CSS as a blocking change, not a small diff.
Offer a reviewed, license-compliant manual project integration when appropriate, or
require explicit approval and preservation of the affected CSS before installer execution.
Do not use `--overwrite` or `--yes` as routine convenience flags.
Completion: approved destinations and dependency/CSS/README changes are enumerated.

### 5. Adapt lifecycle and accessibility at the owning component

Keep interactive controls native and keyboard reachable; decorative cursor or canvas
layers must not capture input or become the only path to information.
For split text, preserve one readable accessible name and semantic heading structure.
Ensure meaningful content stays visible when animation setup fails or JavaScript is absent:
the inspected reveal renders initial inline opacity zero and relies on its effect to reveal it.
Its reduced-motion branch still moves lines 32px over 0.9s; explicitly assess suitability
and provide a static readable alternative when reduced motion must remove displacement.
Preserve cleanup of GSAP timelines, ScrollTriggers, split nodes, wrappers, and any
listeners/observers/RAF introduced by the chosen effect; check remount and prop changes.
Pause decorative repeating work offscreen and in background tabs where appropriate.
Budget the selected effect, not the entire catalog: inspect imports before adding GSAP,
Three.js, or other large runtimes. Keep motion from obscuring content or focus indicators.
Completion: static/reduced-motion behavior and resource ownership have explicit outcomes.

### 6. Verify only what the task authorized

For source-only work, report inspected contracts and unresolved runtime checks separately.
For approved integration, exercise the actual host route: keyboard/touch input, focus,
reduced motion, resize, route exit/re-entry, and repeated mount/unmount.
Confirm styles survived integration and no duplicate split wrappers or active timelines
accumulate. Measure visible/offscreen behavior if a performance claim is needed.
Report exact checks and observed results; a source review cannot establish runtime safety.

## Examples

- “Inspect rectangular-text-reveal for our existing Next landing page.” Return dependencies,
  license fit, hidden-content/reduced-motion risks, and a CSS-preserving integration plan.
- “Publish these free effects in our reusable component starter.” Explain the standalone
  redistribution restriction and keep the deliverable to original guidance and upstream links.

## References

- [Pinned upstream evidence](references/upstream.md): source contracts, license, history, caveats.
- [Authored scenarios](evals/evals.json): behavioral fixtures, not executed runtime tests.
