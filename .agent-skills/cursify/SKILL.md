---
name: cursify
description: >
  Inspect ui-layouts/cursify cursor effects, assess reuse permission, and plan or
  review a scoped React cursor enhancement. Use when the user names Cursify,
  cursify.ui-layouts.com, a Cursify cursor follower, or its pointer/canvas lifecycle.
  Route generic visual recipes to web-design, React Bits components to react-bits,
  and measured animation leak audits to optimize-web-animations.
allowed-tools: Read Grep Glob Bash Write Edit WebFetch
compatibility: Requires public source access for upstream inspection; integration needs an authorized target React project. No upstream package installation is implied.
metadata:
  version: "1.0"
  source: https://github.com/ui-layouts/cursify
---

# Cursify

Treat Cursify as a named cursor-effects source, not an installable npm package.
The inspected repository has **no discovered license file**. Public visibility and
copy buttons do not grant reuse permission. This operator contains original guidance,
not copied component code or artwork.

## Instructions

### 1. Choose one route

| Intent | Route and completion criterion |
| --- | --- |
| Identify or compare Cursify effects | Read the pinned evidence; return exact source paths and permission status. |
| Copy or integrate a Cursify effect | Complete the permission gate before proposing source reuse. |
| Review an existing authorized integration | Map its pointer, canvas, motion, and cleanup ownership. |
| Choose an unrelated cursor recipe | Use web-design; Cursify is not the default for all cursor requests. |
| Investigate frame-time or accumulating resources | Use optimize-web-animations with the exact effect as the target. |

Load [references/upstream.md](references/upstream.md) before making source, version,
license, or API claims. For a different commit, repeat the public source and license
inspection; a later README edit is not evidence of a repaired component.

### 2. Establish permission and target

Record the target framework, route, effect name, pointer scope, intended interaction,
and whether existing source is already in the target project with documented rights.
The package manifest describes a private documentation app; its dependency list is not
an instruction to install the entire app into the consumer.

At the pinned revision, offer source analysis or an independently authored alternative
from the user's behavioral brief. Reusing upstream implementation or assets requires
an applicable license or explicit rights from the owner. Record that evidence first.
Stop the copying branch if permission remains absent; complete the analysis branch.
An independent alternative must not be a translation or close rewrite of the source.

Read public docs/source without executing them. Obtain separate approval before target
file changes, dependency installation, network-provided installers, or deployment when
those actions were not already authorized by the task.

### 3. Define the cursor contract

Keep the real control semantics independent from the decorative cursor:

- Preserve native pointer feedback, text selection, visible keyboard focus, and ordinary
  link/button activation; an overlay must not intercept clicks or become a focus stop.
- Keep cursor-only labels supplementary. Keyboard and screen-reader users need the same
  meaningful state through the actual control, not a following canvas or hover label.
- Enable decorative following only for an appropriate fine pointer and hover capability.
  On touch/coarse input, keep the static interface functional without emulating a mouse.
- With reduced motion, omit trailing, springs, particles, and continuous render work.
  Apply preference changes while mounted, not just at initial setup.
- Scope listeners and overlays to the smallest owner. Specify behavior on pointer leave,
  document visibility changes, scrolling, resize, and route changes before wiring them.

Completion: each input mode has an explicit usable behavior and no essential information
exists solely in the moving decoration.

### 4. Inspect ownership before adapting authorized code

For each selected implementation, inventory its listeners, animation frames, canvas/DOM
nodes, timers, subscriptions, and external assets. Source inspection is per component:
the sampled FollowCursor does not establish guarantees for every Cursify effect.

The inspected FollowCursor removes mouse/resize listeners, cancels a frame, and removes
its canvas. It assigns a media-query `onchange` callback without clearing that callback
in cleanup; a preference toggle after unmount can recreate resources. Its effect also
reads `zIndex` while depending only on `color`. Treat these as source-review findings,
not observed runtime failures or a ready-to-copy lifecycle pattern.

For authorized integration work, give setup and teardown the same owner. Remove media
listeners as well as pointer/resize listeners; cancel frames before disposing nodes;
prevent re-entry after disposal. Repeated mount/unmount and preference changes must not
create additional canvases or loops. Preserve the consumer's existing lifecycle pattern.

### 5. Set performance boundaries

Use mutable coordinates rather than triggering a React render for every pointer event
when the target design does not need React state. Cap particles and canvas pixel cost;
stop hidden or inactive work. Avoid global cursor overrides and full-page overlays when
a section-local treatment meets the request. Make DPR, resize, and context-creation
failure behavior explicit for canvas variants. Do not promise a frame rate from source.

## Verification and handoff

For source-only requests, report inspected paths, immutable commit, license search scope,
source caveats, and unexecuted runtime checks. Do not install or launch upstream to make
the report appear more conclusive.

For an authorized target implementation, exercise keyboard activation, touch/coarse
input, reduced-motion initial state and live toggling, pointer enter/leave, route cycles,
and visibility changes. Compare canvas/listener/frame ownership before and after bounded
cycles; report the actual observations and unavailable instrumentation separately.

Return one packet: chosen route, permission decision, target scope, source coordinates,
resource owner/cleanup plan, input-mode behavior, checks run, and remaining uncertainty.
The fixture scenarios in `evals/evals.json` are specifications, not execution evidence.

## Examples

- “Use Cursify's Follow Cursor on our hero.” → Source and permission inspection first;
  no copying from the unlicensed pin, then an authorized independent brief if requested.
- “Our Cursify overlay returns after navigating away.” → Review the media-query callback
  and disposal ownership; reproduce in the authorized target before declaring a fix.
- “Make all our components share variants and slots.” → design-system, not Cursify.

## Boundaries

Keep web-design for visual-recipe selection, react-bits for its own component catalog,
design-system for reusable component contracts, and optimize-web-animations for
measured cross-page motion optimization. No retirement or replacement of those owners
is justified by this named-repository operator.
