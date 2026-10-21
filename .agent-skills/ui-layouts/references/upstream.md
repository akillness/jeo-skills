# UI Layouts: pinned source observation

## Identity and observation

- `full_name`: `ui-layouts/uilayouts`.
- Official repository: https://github.com/ui-layouts/uilayouts.
- Official site linked by repository metadata and README: https://www.ui-layouts.com/.
- Immutable source commit: `88d827d7ec342917ca06f6894e5add65fabbe5d8`.
- Commit time: `2026-08-22T21:03:51Z`.
- Observation UTC: `2026-10-15T16:24:49.359Z`.
- Scope: read-only public GitHub search, repository metadata, complete tree, commit history, README, manifests, selected component/block source and registry, complete root license. No upstream project, CLI, installer, build, server, browser session, or paid service was run.

## Resolution, including the truncated historical name

1. Public API query `search/repositories?q=ui+user:ui-layouts` returned `total_count=3`, `incomplete_results=false`: `ui-layouts/uilayouts`, `ui-layouts/ui-tools`, and `ui-layouts/mcp`. Their descriptions distinguish the component catalog from tools and its separate MCP server.
2. Independent repository search `"UI Layouts" in:name,description` returned `total_count=1986`, `incomplete_results=false`; the first 10 returned candidates included `ui-layouts/uilayouts` with the matching catalog description. Only those 10 search hits were inspected, not all 1,986.
3. The pinned CLI source literally references `ui-layouts/ui-layouts` in its raw GitHub URLs. A subsequent read-only `repos/ui-layouts/ui-layouts` lookup returned canonical `full_name=ui-layouts/uilayouts` and its canonical html_url. This confirms the old `ui-…` clue by an observed alias; it was not invented from a suffix.
4. The README and metadata link `www.ui-layouts.com`; the selected block's design guide also identifies `ui-layouts/uilayouts`.

The recursive tree at the pin contains 1,519 entries with `truncated=false`. No claim is made that every component or file was audited.

## Exact selected source coordinates

| Artifact | Immutable coordinate | Observation |
| --- | --- | --- |
| README | [README.md, lines 1–94](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/README.md#L1-L94) | Source-component catalog, Tailwind/motion/helper guidance, official links |
| Root package | [package.json, lines 1–35](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/package.json#L1-L35) | Private monorepo; not a public component runtime |
| Website package | [apps/ui-layout/package.json, lines 1–104](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/apps/ui-layout/package.json#L1-L104) | Private `ui-layouts` version `0.1.0`, React/Next, motion, Vaul, workspace dependencies |
| CLI package | [cli/package.json, lines 1–24](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/apps/ui-layout/cli/package.json#L1-L24) | `ui-layouts` version `1.0.3`, bin mapping; not verified as an npm artifact |
| CLI instructions | [cli/README.md, lines 1–63](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/apps/ui-layout/cli/README.md#L1-L63) | `npx ui-layouts list/add`; downloads and dependency installation |
| CLI implementation | [cli/src/index.js, lines 13–55](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/apps/ui-layout/cli/src/index.js#L13-L55) and [84–186](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/apps/ui-layout/cli/src/index.js#L84-L186) | Mutable `main` network URLs, file writes, helper creation, package-manager execution |
| Modal docs | [responsive-modal.mdx, lines 1–91](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/apps/ui-layout/content/components/responsive-modal.mdx#L1-L91) | `uilayouts@latest`/shadcn alternatives, manual deps, Vaul wrapper, inaccurate props table |
| Modal primitive | [responsive-modal.tsx, lines 1–162](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/apps/ui-layout/components/ui/responsive-modal.tsx#L1-L162) | Actual props/state, 768px matchMedia branch, portal, Vaul, trigger semantics, listener cleanup |
| Modal demo | [registry/components/modal/responsive-modal.tsx, lines 1–75](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/apps/ui-layout/registry/components/modal/responsive-modal.tsx#L1-L75) | Example imports exceed primitive needs; uses `asChild` motion button |
| Registry item | [public/r/responsive-modal.json](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/apps/ui-layout/public/r/responsive-modal.json) | Embedded TSX imports `vaul`; dependencies list only `motion` and `lucide-react` |
| Registry definition | [apps/ui-layout/registry.json](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/apps/ui-layout/registry.json) | Catalog schema/data inspected; not a guarantee every generated payload agrees |
| Block source | [about-bento.tsx, lines 1–87](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/packages/blocks/src/about-section/about-bento.tsx#L1-L87) | Workspace `Card`, single-to-four-column grid, hover rotation, demo metrics and copy |
| Block handoff | [about-bento/design.md, lines 1–83](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/packages/blocks/src/about-section/about-bento/design.md#L1-L83) | Newer block-level design documentation; mutable main source links inside remain documentation, not immutable evidence |

## Operator consequences

The source/registry/documentation disagree in concrete ways. Do not treat `npx ui-layouts`, `npx uilayouts@latest`, a website manifest, and a remote shadcn registry as interchangeable verified installation surfaces. This observation does not establish current npm ownership or artifact integrity. Review and authorize any chosen executable and endpoint before use; manual adaptation from the immutable source is the default source-only plan.

The responsive-modal source imports Vaul, Motion, lucide icons, and a local `cn` helper; generated dependency metadata omits Vaul. Its actual `setOpen` type is a callback, despite the docs table calling it boolean. The desktop branch uses animated divs in a portal and supplies a labeled close button, but source does not establish dialog naming/role, focus trapping/restoration, Escape dismissal, or reduced motion. The default trigger is a clickable div; the `asChild` path accepts a real button. Those are source observations to drive verification/remediation, not a claim that runtime testing found every failure.

`AboutBento` depends on workspace-only `@repo/shadcn`. It includes demonstration metrics and a clickable-looking card without actual navigation; an adopter must map primitives and replace claims rather than copy the demo wholesale. Its `md` layout and motion need consumer-specific reflow/reduced-motion checks. A guide's promise of accessibility or production readiness is not proof.

The CLI downloads from mutable main, writes component files without a visible overwrite-confirmation branch, creates `lib/utils` if absent, and invokes a package manager for declared dependencies. Dependency-install failure is caught and logged before the CLI's final success message; output alone is not a complete install-verification signal. None of these operations was executed during authoring.

## History and preservation decision

The newest observed commit merges per-block design handoffs. Its predecessor `e9e82395d595454ae69cebe654add4c590d74bde` is `docs: make block design guides portable`. Other recent commits include preview-control and raw-markdown-loading fixes. The recent documentation work adds useful context, but neither a fresh commit date nor a design guide supersedes actual TSX or proves universal runtime behavior.

Preserve `web-design` for broad recipe routing, `responsive-design` for adaptation strategy, and `optimize-web-animations` for measured lifecycle/performance work; their local guides were inspected. The requested `ui-component-patterns/SKILL.md` is absent locally, and an exact manifest search returned no rows (`complete=true`, `truncated=false`, `partial=[]`, scope `.agent-skills/skills.json`, query `ui-component-patterns`, max 5). Existing design-system ownership remains the route for primitive APIs. No overlapping skill retirement is justified, and no shared skill was edited. Paper Shaders remains a distinct WebGL runtime owner even when a UI Layouts page demonstrates shader-like visuals.

## Complete license observation

The entire [root LICENSE](https://github.com/ui-layouts/uilayouts/blob/88d827d7ec342917ca06f6894e5add65fabbe5d8/LICENSE) was retrieved and read, not inferred from the API badge. It is MIT, 1,066 UTF-8 bytes, SHA-256 `25d698c61ceea4d42107ef85ef37d4449f1169ca24c7ee288db434688071e1e3`:

```text
MIT License

Copyright (c) 2024 UI LAYOUT

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Retain the copyright and permission notice when copying substantial source. The root software license is not a blanket license for third-party demo photography, logos, fonts, or other dependencies; inspect each selected artifact. This operator is original guidance rather than a vendored catalog. No legal opinion is implied.

## Evaluation status

`evals/evals.json` contains authored positive/negative behavioral fixtures only. No agent evaluation, browser exercise, package install, or upstream runtime test was executed. Source and complete-license observations are the upstream evidence delivered.
