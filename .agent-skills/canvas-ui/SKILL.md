---
name: canvas-ui
description: >
  Operate DavidHDev/canvas-ui for selecting and integrating its live-DOM canvas
  effects, checking framework/renderer packaging, HTML-in-Canvas fallback,
  lifecycle and license boundaries. Use when the user names Canvas UI,
  canvasui.dev, @canvas-ui registry items, or its Liquid/ParticleScroll effects.
  Route ordinary animated React components to react-bits and custom visual
  recipe discovery to web-design; this is not a general drawing-canvas toolkit.
allowed-tools: Read Grep Glob Bash Write Edit WebFetch
compatibility: >
  Requires a browser frontend and the selected component's framework/runtime.
  HTML-in-Canvas and WebGPU support vary; preserve usable HTML without effects.
  Upstream components have MIT plus Commons Clause restrictions, not plain MIT.
metadata:
  version: "1.0.0"
  source: https://github.com/DavidHDev/canvas-ui
---

# Canvas UI

Use one Canvas UI effect as progressive enhancement over usable content.
Start with [pinned source and complete license evidence](references/upstream.md).
This folder contains original operating guidance, not bundled upstream engines.

## When to use this skill

- A task names DavidHDev's Canvas UI or an `@canvas-ui` registry component.
- A Canvas UI integration needs a framework/renderer choice or fallback repair.
- Existing Canvas UI behavior needs lifecycle, motion or input-path inspection.

| Different primary job | Owner |
| --- | --- |
| React Bits catalog or its animated React components | `react-bits` |
| A custom shader, scroll or CSS visual recipe | `web-design` |
| A drawing editor or HTML Canvas API tutorial | The app's canvas implementation |
| Page identity or typography direction | A design-direction skill |

The procedure is usable without installing any neighboring skill.

## Instructions

### 1. Clear the distribution boundary

Read the selected revision's entire `LICENSE.md` before copying source.
It permits use as part of applications, websites or products but restricts
selling, sublicensing or redistributing the components themselves, including
bundles and ports. Do not relabel it plain MIT or treat the README's shorter
license summary as overriding the license file.
For a component marketplace, reusable kit or library redistribution request,
stop that distribution path and require permission or an appropriately licensed
alternative. Keep third-party model, image and font rights separate.

### 2. Name the exact variant

Record effect, framework, renderer, target route and intended fallback.
The inspected docs offer React, Vue, Svelte, Solid, Preact and vanilla variants;
read the selected variant before integration. WebGL is the default build;
WebGPU registry names append `-webgpu` after the framework.
Confirm live registry metadata before any approved install, because `@latest`
and a registry URL are mutable and are not pinned by this reference's SHA.

### 3. Inspect packaging and support before copying

Prefer the documented, generated standalone component over a repository wrapper
alone. Source wrappers import engines; engines can import shared helpers. The
registry assembly inlines those dependencies into installed source.
Compare the actual installed file and dependencies with that packaging contract.
Read component-specific requirements: HTML-in-Canvas is experimental and not
interchangeable with WebGPU support. A demo working on canvasui.dev does not
prove the destination domain has the required browser capability/origin trial.
Keep ordinary HTML when capture, graphics initialization or a renderer fails.

### 4. Integrate a bounded region

Give the wrapper a deliberate layout size and preserve semantic content.
Keep output canvases decorative, out of the accessibility tree, and transparent
to pointer targeting; retain real links, labels and keyboard-operable controls.
React integration belongs in a client boundary. Preserve the wrapper's safe
server snapshot and effect cleanup rather than moving GPU work into render.
Vanilla integrations own creation, resize/options updates and `destroy()`.
Inspect actual option types instead of inventing universal pause or quality props.

### 5. Preserve lifecycle and motion controls

On removal or route change, release the engine, frames, listeners, observers and
GPU resources it owns. Avoid a second external animation loop around its loop.
Honor reduced motion with a static readable path; inspect each effect rather
than generalizing Liquid's pointer gating to the whole catalog.
Suspend unnecessary hidden/offscreen work and bound queued interaction work.
The inspected Liquid engine already has relevant guards; preserve them.
Resolution caps are implementation limits, not measured frame-rate promises.

### 6. Exercise enhancement and fallback independently

Check one supported path and one unavailable-capability path on the target app.
Verify content visibility, clicks, selection, keyboard focus, scrolling, zoom,
touch and route remount. Include reduced motion and a hidden/offscreen interval.
ParticleScroll must remain readable and interactive without HTML-in-Canvas;
its inspected wrapper hides the output canvas on that fallback path.
Record console failures and target-device performance where actually measured.
No runtime or cross-browser result was established by this source-only audit.

## Approval boundaries

Public source inspection is read-only. Dependency/registry installation, browser
flag or profile changes, origin-trial registration, MCP client configuration,
paid assets and deployment require separate authorization.
These commands are inspected examples, not executed setup steps:

```sh
npx shadcn@latest add @canvas-ui/liquid-react
npx shadcn@latest add @canvas-ui/liquid-react-webgpu
```

## Examples

- "Add Liquid from Canvas UI to one React hero." Check license and registry
  packaging, choose renderer, retain usable HTML and verify teardown/fallback.
- "Bundle Canvas UI ports for sale." Stop the component redistribution path;
  product-use permission does not establish reusable-kit distribution rights.

## Best practices

One justified effect is preferable to a blanket page wrapper. Keep semantic
content available before GPU startup and report checks not performed explicitly.

## References

- [Pinned source coordinates, caveats and license](references/upstream.md)
- [Behavioral fixtures, authored but not executed](evals/evals.json)
