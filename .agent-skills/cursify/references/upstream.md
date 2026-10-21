# Cursify: inspected public source

## Identity and immutable observation

- Candidate supplied: `github.com/ui-layouts/cur…` / Cursify.
- Resolved full_name: `ui-layouts/cursify`.
- Official repository: https://github.com/ui-layouts/cursify
- Repository metadata describes “Cursor Animation Library for React & Next.js” and links
  https://cursify.ui-layouts.com as its homepage. It is public and not archived.
- Observed UTC: `2026-10-15T16:24:49Z`.
- Selected commit: `b3a173c33f12e74550389c9555f9ce85c30c46f6` (main at observation).
- Commit date: `2026-03-31T12:11:37Z`; subject: `chore: update table-of-contents`.
- This is source-only evidence. No upstream installation, build, server, browser demo,
  copied component, asset download, or runtime execution occurred.

## Resolution and inspection provenance

Read-only public GitHub API calls were made through the current `gh` identity, without
switching identity or modifying remotes. Exact search/API coordinates:

```bash
gh api 'search/repositories?q=user%3Aui-layouts%20cursify&per_page=10'
gh api repos/ui-layouts/cursify
gh api repos/ui-layouts/cursify/commits/main
gh api 'repos/ui-layouts/cursify/git/trees/b3a173c33f12e74550389c9555f9ce85c30c46f6?recursive=1'
gh api 'repos/ui-layouts/cursify/commits?path=registry/components/cursor/common/follow-cursor.tsx&sha=b3a173c33f12e74550389c9555f9ce85c30c46f6&per_page=1'
```

Search returned `total_count: 1`, `incomplete_results: false`, and the exact full_name
above. This resolves the candidate rather than inferring its suffix. The recursive tree
returned `truncated: false`, `total_entries: 227`. No partial tree was treated as complete.
API output was filtered for relevant metadata and paths, not executed.

Public source files were retrieved as raw text using the reader tool, with immutable
base `https://raw.githubusercontent.com/ui-layouts/cursify/b3a173c33f12e74550389c9555f9ce85c30c46f6/`.

| Exact coordinate at selected commit | What was inspected |
| --- | --- |
| [README.md](https://github.com/ui-layouts/cursify/blob/b3a173c33f12e74550389c9555f9ce85c30c46f6/README.md), Installation and folder tree | Starter instructions mention Tailwind, motion, clsx, tailwind-merge, and a media-query helper. The generic starter tree is not reliable current component discovery. |
| [package.json](https://github.com/ui-layouts/cursify/blob/b3a173c33f12e74550389c9555f9ce85c30c46f6/package.json), root fields and dependencies | Private ui-layout-starter-kit 0.1.0; Next 15.3.8, React 19.1.4, motion ^12.9.2, Tailwind ^3.4.6. These describe the docs app, not an npm Cursify SDK. |
| [content/components/follow-cursor.mdx](https://github.com/ui-layouts/cursify/blob/b3a173c33f12e74550389c9555f9ce85c30c46f6/content/components/follow-cursor.mdx), metadata and ComponentCodePreview | Names Follow Cursor and its preview key. |
| [registry/components/cursor/common/follow-cursor.tsx](https://github.com/ui-layouts/cursify/blob/b3a173c33f12e74550389c9555f9ce85c30c46f6/registry/components/cursor/common/follow-cursor.tsx), FollowCursorProps, FollowCursor, useEffect, init, destroy | Optional color/zIndex; body-appended fixed canvas; mousemove/resize listeners; RAF; reduced-motion query; teardown and callback lifetime. |

No other cursor implementation's behavior is asserted from this sample.

## Complete license observation

The entire untruncated recursive tree was checked case-insensitively for path names
containing `license`, `licence`, `copying`, `copyright`, or `notice`; result: **zero paths**.
GitHub metadata returned `license: null`. The full inspected README and package manifest
supplied no license grant. There was no discovered license file to retrieve; this is
not an MIT observation and not a claim that every blob was legally audited.

Positive permission is **not established**. Do not distribute upstream code, translate
its implementation, copy its artwork, or interpret public accessibility as permission.
Seek an applicable owner grant or choose separately licensed material. This operator is
original procedural prose; it does not vendor upstream implementation.

## Source findings and limits

- FollowCursor's init skips creation with reduced motion. Its overlay has pointer-events
  disabled; those facts do not prove keyboard/touch accessibility globally.
- destroy removes the canvas and mouse/resize listeners and cancels a RAF identifier.
  The media-query onchange callback remains assigned after cleanup. Source risk: later
  preference changes can call init on a disposed owner. This was not runtime-tested.
- The effect depends on color, not zIndex, although setup reads zIndex. A consumer needing
  live z-index changes must inspect that lifecycle contract explicitly.
- No fine-pointer/touch capability gate was present in the sampled source. The native UI
  must remain usable without decoration; independent target work should define it.
- Continuous animation, canvas sizing, hidden-page work, and context failures need target
  measurement; no speed, memory, rendering quality, or conformance claim was verified.

The last path-specific commit returned for the sampled source was
`e237b5e98d14de07a6218c2867606bd58498351f`, `2026-02-03T10:09:25Z`, subject
`feat: update metadata and magnetic-cursor`. HEAD's later TOC chore is not evidence of a
cursor lifecycle repair or a reason to retire another source library.

## Duplicate decision

- **web-design:** its local router selects visual recipes including cursor trails.
  Keep it canonical for generic effect choice; Cursify owns this named source's
  permission assessment and integration inspection.
- **react-bits:** its local skill owns DavidHDev/react-bits integration/customization.
  Cursify is not a replacement catalog or a new name for a React Bits effect.
- **ui-component-patterns:** the provided catalog describes reusable primitive, slot,
  variant, and controlled-state contracts. Its expected local SKILL.md was absent;
  no unseen instruction comparison is claimed. The installed design-system skill is
  the actual route for shared primitive APIs, per the lead's routing decision.
- **optimize-web-animations:** its local workflow measures offscreen work and resource
  release. Delegate measured leak/performance work there rather than duplicating a profiler.

Retirement recommendation: **none**. The source-specific permission gate justifies a
narrow operator; existing visual, component, and performance owners remain.

## Reuse and approval boundaries

Permitted here: public source reading, factual reports, and original operating prose.
Component copying remains gated on documented rights. Installs, executable network CLIs,
target edits, deployments, paid services, and private account access require the task's
separate authority. Runtime verification belongs to an authorized target project.
