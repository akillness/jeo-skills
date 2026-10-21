---
name: paper-shaders
description: >
  Integrate and diagnose Paper Shaders from paper-design/shaders: choose vanilla
  or React packages, mount a named shader, tune uniforms and rendering bounds,
  freeze motion, and release its WebGL resources. Use when the request names
  Paper Shaders, @paper-design/shaders, @paper-design/shaders-react, or asks to
  adopt their MeshGradient or ShaderMount. Route generic shader authoring,
  Three.js scenes, and UI Layouts component adoption to their own owners.
allowed-tools: Read Write Edit Bash Grep Glob WebFetch
compatibility: Browser WebGL2 integrations in vanilla JavaScript or React 18/19; source-only guidance also works without an installed runtime.
metadata:
  version: "1.0.0"
  source: https://github.com/paper-design/shaders
---

# Paper Shaders

Operate the named canvas shader runtime, not a layout system or a design generator.
The pinned source observation and license record are in [references/upstream.md](references/upstream.md).
Read that reference before selecting an API, version, or lifecycle change.

## Route first

| Request | Primary path |
| --- | --- |
| Decide whether Paper fits an existing surface | Fit check |
| Add a named shader to React | React integration |
| Add a shader to another browser frontend | Vanilla integration |
| Stop animation, resize, reduce GPU work, or remove a mount | Lifecycle diagnosis |
| Write arbitrary GLSL or build a Three.js scene | Route out; this package is not required |
| Adopt a ready-made modal, bento block, or grid | UI Layouts or the existing component owner |

A generic gradient can remain CSS. Require an actual runtime benefit before adding WebGL.
For broad visual recipe selection, use `web-design` when available.
For measured animation leaks or long-session slowdowns, use `optimize-web-animations` when available.
Those are optional adjacent owners; this operator's source reference is self-contained.

## 1. Establish the integration contract

Inspect the consuming package manifest, framework boundary, existing effects, and target container.
Record the chosen shader, decorative or meaningful role, dimensions, and motion policy.
Select exactly one entry point: `@paper-design/shaders` or `@paper-design/shaders-react`.
The inspected packages are both `0.0.81`; React declares React 18/19 peers.
Upstream warns that even `0.0.x` updates can break compatibility; choose an exact version.
A repository commit pin proves source identity, not that an npm tarball was verified.
Finish intake with a package/version choice and an explicit fallback, not an install command.

## 2. Gate operations by their effects

Public source inspection needs no package execution.
Before installation, name the dependency version, package-manager command, lockfile, and affected files.
Obtain explicit approval before installing, running downloaded code, or fetching remote image assets.
A package install may run scripts; source inspection does not authorize those scripts.
Keep textures local and rights-cleared by default; remote textures add network and CORS concerns.
Deployment, publishing, accounts, design services, and paid generation need separate authorization.
Never request credentials to use the open-source shader runtime.

## 3. Integrate through the inspected surface

### React integration

Use a named component exported by the selected installed version, such as `MeshGradient`.
The inspected component accepts `colors`, `distortion`, `swirl`, `speed`, and `frame`.
Its shared mount accepts `width`/`height` or ordinary div styles plus rendering bounds.
Place it within the consuming framework's client boundary; keep server-rendered content independent.
Give the wrapper a nonzero explicit size so the canvas has a real layout box.
The wrapper creates the vanilla mount in an effect and calls `dispose()` on effect cleanup.
Do not start a second requestAnimationFrame loop to drive a built-in animated component.
For image shaders, inspect that component's actual params before adapting the gradient example.

### Vanilla integration

Use `ShaderMount` with a real mounted HTMLElement, the selected fragment shader, and matching uniforms.
Read that shader's exported uniform types; React props are not raw uniform names.
Create the mount only after browser DOM APIs are available.
Keep one owner for the mount and call its `dispose()` when replacing or removing the surface.
Update supported values through `setUniforms`, `setSpeed`, `setFrame`, and the pixel-bound setters.
Finish integration with one mount per intended surface and an identified cleanup owner.

## 4. Preserve accessibility and fallback behavior

The source requests WebGL2 and throws when unavailable; it does not provide a CSS fallback.
Treat fallback handling as consuming-app work, not a promised library feature.
Keep readable HTML text and controls above a stable CSS color/gradient or a local still image.
Mark only purely decorative wrappers hidden from assistive technology; never hide meaningful children.
Ensure the decorative layer cannot intercept controls or reduce text/focus contrast.
The inspected mount does not read `prefers-reduced-motion` automatically.
Map reduced motion and an explicit pause control to `speed=0`; choose a stable `frame` if needed.
Retain the fallback when WebGL is disabled or initialization fails; report failures rather than hiding them.
Test reduced motion on first load and preference change, not only after animation starts.

## 5. Diagnose performance and lifecycle at the owner

The runtime already pauses animation for hidden documents and offscreen mounts.
Avoid layering another observer or loop unless a measured gap requires it.
`speed=0` cancels recurring animation frames; updates and resizes may still render a frame.
The inspected defaults are minimum pixel ratio 2 and maximum pixel count 8,294,400.
Lower `maxPixelCount` first when fill-rate is the problem; select quality from measured target-device output.
A static shader is still a WebGL allocation, not a zero-cost CSS background.
Use `dispose()` rather than removing the canvas alone: cleanup includes textures, program, observers, and listeners.
Inspect asynchronous image-loading paths during rapid mount/unmount; do not infer cancellation guarantees.
The source does not establish context-loss recovery or complete GPU-memory freedom after disposal.

## Verification and completion

When execution is authorized, exercise the exact consuming route in its real framework.
Check visible render, container resize, narrow viewport, WebGL-disabled fallback, and reduced motion.
Check offscreen/hidden-tab pause and resume without confusing a screenshot with timing evidence.
Navigate away and back repeatedly; compare canvas counts and owned resource/lifecycle observations.
Inspect console errors, image failures, readability, keyboard focus, and any meaningful controls.
Record the exact command or interaction, environment, and observed result for each check.
In source-only work, label browser, frame-time, bundle-size, and leak behavior **not executed**.
A successful source review does not prove visual quality, accessibility compliance, or performance.

## Delivery

Return the selected path, package/version, source pin, changed files, and cleanup owner.
Include fallback/motion decisions, license handling, approvals used, checks run, and unresolved risks.
The behavioral scenarios in `evals/evals.json` are authored fixtures, not recorded evaluation results.
