---
name: trickle-ui
description: >
  Inspect and integrate akaieuan/trickle-UI-kit text animations through its
  shadcn-style registry, or review TextRoot and Typewriter lifecycle behavior.
  Use when the user names Trickle UI Kit, tricklekit.dev, its registry JSON,
  CSS text reveals, or its Typewriter integration. Route unrelated React Bits
  components to react-bits and page-wide animation profiling to optimize-web-animations.
allowed-tools: Read Grep Glob Bash Write Edit WebFetch
compatibility: Source inspection needs public GitHub access; registry integration needs an authorized React project and compatible shadcn/Tailwind setup. No standalone npm library was observed.
metadata:
  version: "1.0"
  source: https://github.com/akaieuan/trickle-UI-kit
---

# Trickle UI

Use the named repository's text primitives, not a generic “UI kit” interpretation.
Its distribution is a source registry; the private documentation app is not the package
to install. Keep upstream marketing claims distinct from inspected implementation.

## Instructions

### 1. Pick one branch

| Request | Smallest branch |
| --- | --- |
| Evaluate the library | Inspect license, selected primitive, manifest, and generated JSON. |
| Add a text reveal | Prefer the simplest selected CSS primitive that meets the brief. |
| Add cycling/typed text | Inspect the stateful primitive and TextRoot together. |
| Diagnose a registry install | Compare source imports, declared dependencies, generated files, and target aliases. |
| Audit page-wide animation cost | Route to optimize-web-animations with the selected primitive as context. |

Read [references/upstream.md](references/upstream.md) before choosing a component or
quoting compatibility. Do not replace the inspected package versions with README badges.
The pinned package and README differ; the consumer's actual setup owns compatibility.

### 2. Freeze the integration packet

Record the component name, text and semantic element, one-shot versus looping behavior,
trigger, reduced-motion fallback, target file, existing `cn` alias, and CSS entrypoint.
Choose one primitive rather than installing the catalog or the documentation application.

For WordCascade, inspect `registry/default/word-cascade/word-cascade.tsx` and its manifest
entry. For Typewriter, inspect its source, `text-root`, and the generated installation
item. Verify any other chosen primitive independently; these samples do not cover all.

The repository's components/orchestration carry MIT terms; retain the copyright and
permission notice with copies or substantial portions. `LICENSE-DEMOS` applies CC0 only
to `registry/examples/`. Do not generalize that scope to arbitrary site assets or fonts.

Completion: one selected component has a complete dependency, CSS, license, and semantic
packet. Analysis can finish without any installation or execution.

### 3. Choose the authorized delivery path

Source-only inspection is the default when no target mutation was requested. For a
separately authorized integration, inspect the registry item before invoking its CLI:

```bash
npx shadcn@latest add https://tricklekit.dev/r/typewriter.json
```

This is an upstream-documented, **unexecuted** example, not a pinned reproducible install.
`latest` executes downloaded code and the live registry can differ from the recorded
commit. Obtain approval for that execution and file/CSS changes when not already granted;
otherwise supply a review packet or use permitted commit-pinned source with its notice.
Do not suggest `npm install trickle` as the distribution path.

The selected generated Typewriter item targets `components/trickle/typewriter.tsx` and
references `https://tricklekit.dev/r/text-root.json`. It embeds a source import from
`@/registry/default/text-root/text-root`; verify the actual installed import is rewritten
to the consumer's layout rather than assuming the upstream repository path exists there.
Reuse the consumer's `cn` utility instead of duplicating a parallel helper.

### 4. Preserve CSS and rendering behavior

Carry the component's manifest `cssVars` and `css` alongside its TSX. WordCascade needs
its animation token, keyframes, and reduced-motion rule; Typewriter needs the caret
rules as well as its hook dependency. A copied TSX file alone is incomplete.

Inspect the client boundary per primitive. WordCascade has no client directive or hook;
Typewriter uses React state and timeouts. “Zero animation-library dependency” is not
“zero client JavaScript.” Keep the boundary narrow without claiming stateful components
are server-only. Confirm final readable content with JavaScript disabled when required.

### 5. Check semantics and motion controls

Use a real heading, link, or button for the task, not decorative spans as controls.
Split glyphs/words should expose one coherent accessible name, not repeated spoken
characters. Typewriter hides its changing visual span and exposes the first target to
assistive technology; ensure that static phrase communicates the same essential meaning.
If cycling strings carry different facts, expose those facts in stable accessible content.

Keep keyboard focus and touch behavior ordinary; text animation must not require hover
or intercept input. Apply reduced-motion CSS and the stateful hook's preference path.
Provide a usable static result for reduced motion, failed CSS, and unsupported visual
features. Avoid adding a noisy live region that announces each typed character.
For persistent automatic motion, assess a pause/stop control rather than assuming a
reduced-motion media query alone meets the user's accessibility requirements.

### 6. Own lifecycle and performance

The inspected TextRoot removes its media-query listener and disconnects its observer;
its delayed view-trigger timeout is not cleared on cleanup. Typewriter clears its own
per-step timeout. Review these separately; observer disconnection does not cancel timers.
A view trigger is one-shot start logic, not offscreen pause logic for continuous work.

For authorized adaptations, cancel every pending delay when its owner unmounts or changes,
including view-trigger delays. Check text/strings prop changes, empty inputs, visibility,
and route remounts. Keep long text and per-character DOM counts bounded. CSS masks, blur,
and many independently animated spans still require measurement; CSS is not free work.

## Verification and handoff

In an authorized target, verify resolved imports, CSS merge, SSR/first paint, hydration,
no-JS readability, keyboard/touch behavior, reduced-motion toggling, and bounded route
cycles during a pending view delay. Exercise empty text and multiple-string content.
Report actual commands and browser observations; distinguish them from source findings.

Return branch, selected primitive/pin, rights/attribution, dependencies and CSS locations,
source caveats, target changes if authorized, checks run, and unresolved browser behavior.
The scenarios in `evals/evals.json` have not been executed by this source-authoring task.

## Examples and boundaries

- “Install Trickle Typewriter without motion libraries.” → Stateful branch; inspect
  TextRoot and registry CSS/imports, approve execution, preserve stable accessible text.
- “Use a CSS-only Trickle word reveal.” → Inspect WordCascade rather than Typewriter.
- “Design our shared slot/variant APIs.” → design-system, not this operator.
- “Pick an unrelated cursor trail.” → web-design; react-bits owns its named components.

This operator complements those owners; no existing skill retirement is recommended.
