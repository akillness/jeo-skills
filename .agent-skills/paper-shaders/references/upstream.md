# Paper Shaders: pinned source observation

## Identity and observation

- `full_name`: `paper-design/shaders`.
- Official repository: https://github.com/paper-design/shaders.
- Official documentation linked by its README and repository homepage: https://shaders.paper.design/.
- Immutable source commit: `43cd68db79fa0b1759f72ffc941b3238e2a3954c`.
- Commit time: `2026-09-17T09:44:42Z`.
- Observation UTC: `2026-10-15T16:24:49.359Z`.
- Scope: public GitHub repository metadata, search, trees, commit history, README, manifests, selected source, and complete license/notice files. No upstream install, build, server, browser session, or paid service was executed.

## Resolution method

Read-only GitHub API search `search/repositories?q=shaders+user:paper-design` returned `total_count=2`, `incomplete_results=false`: `paper-design/shaders` and the separate `paper-design/liquid-logo` demonstration. The selected repository's description identifies zero-dependency canvas shaders; its README, npm package names, and `shaders.paper.design` documentation agree. The `s…` suffix was not expanded by guessing.

The recursive tree at the immutable commit returned 417 entries with `truncated=false`. This was a complete tree observation, not a runtime or a complete source audit.

## Exact inspected coordinates

All links below are pinned; line numbers refer to this revision only.

| Artifact | Source coordinate | What it establishes |
| --- | --- | --- |
| README | [README.md, lines 1–91](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/README.md#L1-L91) | Vanilla/React choices, exact-pin warning, named component example, public docs, license-use explanation |
| Vanilla manifest | [packages/shaders/package.json, lines 1–30](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/package.json#L1-L30) | `@paper-design/shaders` `0.0.81`, empty dependencies, exports, Apache-2.0, distribution includes NOTICE |
| React manifest | [packages/shaders-react/package.json, lines 1–43](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders-react/package.json#L1-L43) | `@paper-design/shaders-react` `0.0.81`, exact vanilla dependency, React 18/19 peer range |
| Vanilla constructor | [shader-mount.ts, lines 40–128](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/src/shader-mount.ts#L40-L128) | Real DOM parent, WebGL2 context request, unsupported error, mount setup |
| Resize/visibility | [shader-mount.ts, lines 176–291](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/src/shader-mount.ts#L176-L291) | ResizeObserver, IntersectionObserver, physical-pixel bounding |
| Controls | [shader-mount.ts, lines 495–559](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/src/shader-mount.ts#L495-L559) | Frame in milliseconds, speed/pause, visibility gating, pixel setters, uniform updates |
| Cleanup | [shader-mount.ts, lines 562–618](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/src/shader-mount.ts#L562-L618) | Cancels RAF, deletes tracked textures/program, disconnects observers, removes listeners and canvas |
| React mount | [shader-mount.tsx, lines 49–240](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders-react/src/shader-mount.tsx#L49-L240) | URL image loading/CORS, async uniform processing, mount effect and `dispose()` cleanup, prop updates |
| Named component | [mesh-gradient.tsx, lines 1–130](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders-react/src/shaders/mesh-gradient.tsx#L1-L130) | Props/defaults, color conversion, uniforms, delegating to ShaderMount |

The whole selected vanilla source file (795 lines) was inspected, including shader compilation and types; the table highlights the API-relevant regions rather than claiming every shader was audited.

## Source-grounded decisions and limits

This is a shader runtime, whereas UI Layouts is a source-copy component/block catalog. The vanilla runtime defaults to `minPixelRatio=2` and `maxPixelCount=1920*1080*4`. `setSpeed(0)` stops its recurring RAF; uniform and resize updates can still draw. Hidden-document and viewport gating already exist, so integration should not casually duplicate them.

Reduced-motion preference detection and a CSS fallback are not supplied by the inspected mount. The consuming app must retain semantic HTML and a usable static background, map its motion policy to the supported speed/frame controls, and handle initialization failure. Resource disposal is observed in source; complete GPU memory reclamation, asynchronous image cancellation, context-loss recovery, frame rates, visual quality, and cross-device behavior are not established by this observation.

The React uniform loader creates images and may issue network requests for URL values. Approve remote assets and CORS implications separately from installing a package. No installation or texture fetch is authorized by reading this reference.

## History and preservation decision

The observed newest commit is `version bump (+ paper-texture-migration refine)`; its immediate predecessor is `20c68f480c7d953c62455b942fe9768e326ec84b`, titled `Paper texture 2.0 (#220)`. The five-entry history also includes a shader props audit and an earlier publish. This distinguishes mixed version/migration/source work from a mere freshness date; it does not establish a replacement for another tool.

Preserve `web-design` as the broad visual-recipe router, `responsive-design` as adaptation strategy owner, and `optimize-web-animations` as the measured lifecycle/performance owner. Their local SKILL.md files were inspected. The requested local `ui-component-patterns/SKILL.md` was absent; an exact manifest search returned no rows (`complete=true`, `truncated=false`, `partial=[]`, scope `.agent-skills/skills.json`, query `ui-component-patterns`, max 5). No external replacement was fetched. No retirement is justified: this operator owns the exact Paper runtime APIs rather than those broader decisions. No existing files were changed.

## Complete license observation

The complete [root LICENSE](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/LICENSE) was retrieved and read: Apache License 2.0, 11,357 UTF-8 bytes, SHA-256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`. It includes definitions, copyright and patent grants, redistribution conditions, contribution terms, trademark exclusion, warranty/liability disclaimers, and the application appendix; this was not inferred from GitHub's license badge.

The complete package licenses were also retrieved and byte-compared equal to that root text:

- [packages/shaders/LICENSE](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/LICENSE).
- [packages/shaders-react/LICENSE](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders-react/LICENSE).

Both complete package NOTICE files were retrieved; each is 91 UTF-8 bytes with SHA-256 `06cf1515dc4628ae4a10f04f394ce746c6edba1ad0ed5d3f7df7ab1781dfe868`:

- [packages/shaders/NOTICE](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders/NOTICE).
- [packages/shaders-react/NOTICE](https://github.com/paper-design/shaders/blob/43cd68db79fa0b1759f72ffc941b3238e2a3954c/packages/shaders-react/NOTICE).

```text
Paper Shaders
Copyright 2026 Paper

Powered by Paper Shaders:
https://shaders.paper.design
```

Redistribution must retain the applicable license and notices and mark modified files as required by Apache-2.0. The README permits commercial end products without visible attribution and appreciates credit; that statement does not remove the license's redistribution obligations. Trademark rights and rights in third-party assets are separate. This operator is original prose with source coordinates, not vendored shader implementation. Legal compliance remains artifact-specific; no legal opinion or runtime certification is implied.

## Evaluation status

The companion `evals/evals.json` contains authored positive/negative behavioral scenarios. They were not executed against an agent, browser, npm artifact, or upstream runtime. Source/license inspection is the only upstream evidence claimed here.
