---
name: pretext
description: >
  Fast, accurate, and comprehensive multiline text measurement and layout library
  for JavaScript/TypeScript — without DOM reflow. Use when the user needs to
  calculate paragraph heights, line counts, manual line layouts (text flowing
  around floated images), or rich text rendering (emoji, CJK, RTL) on DOM,
  Canvas, or SVG targets. Covers npm install, core API (prepare/layout,
  prepareWithSegments/layoutWithLines), and options (whiteSpace, wordBreak,
  letterSpacing). Triggers on: pretext, text measurement, text layout, paragraph
  height, line layout, text reflow, canvas text measurement, DOM reflow.
allowed-tools: Read Write Bash Grep Glob WebFetch
metadata:
  tags: pretext, text-measurement, text-layout, typography, canvas, dom, svg, reflow, multiline, cjk, emoji, rich-text, javascript, typescript
  platforms: Claude Code, Codex CLI, Gemini CLI, OpenCode
  keyword: pretext
  version: latest
  source: chenglou/pretext
  license: MIT
---

# pretext — Fast Multiline Text Measurement & Layout

> No DOM reflow. Pure arithmetic on cached font metrics.

`pretext` is a pure JavaScript/TypeScript library for fast, accurate, and comprehensive multiline text measurement and layout — without triggering `getBoundingClientRect`, `offsetHeight`, or any other DOM reflow operations.

## Installation

### Plugin (Claude Code)
```bash
claude plugin marketplace add chenglou/pretext
```

### npm
```bash
npm install @chenglou/pretext
```

### Skill (any platform)
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill pretext
```

## When to use

- Calculate **paragraph heights** and line counts without measuring in the DOM
- Build **manual line layouts** for text flowing around floated images or variable-width containers
- Handle **rich text** with emoji, CJK characters, RTL text, and mixed-language content
- Render measured text to **DOM, Canvas, or SVG** with accurate metrics
- Implement **soft hyphenation**, letter-spacing, or locale-aware word breaking
- Avoid layout reflow in performance-critical rendering loops
- Server-side text measurement (SSR-friendly)

## Do not use when

- You need full CSS text engine fidelity → rely on DOM measurements directly
- You need OpenType feature support (ligatures, kerning tables) → use a dedicated font shaping library
- You need PDF text layout → route to a PDF generation library
- Your target environment lacks `Intl.Segmenter` and Canvas 2D support

## Core API

### Use Case 1: Height Measurement

Calculate paragraph height and line count with pure arithmetic — no DOM touch after `prepare()`.

```javascript
import { prepare, layout } from '@chenglou/pretext'

// One-time analysis + font measurement (cached)
const prepared = prepare('AGI 春天到了. بدأت الرحلة 🚀‎', '16px Inter')

// Pure arithmetic — no DOM interaction
const { height, lineCount } = layout(prepared, 320, 20)
// width: 320px container, lineHeight: 20px
```

### Use Case 2: Manual Line Layout

Access individual lines for custom rendering (e.g., text around floated images).

```javascript
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

const prepared = prepareWithSegments('Text here', '18px "Helvetica Neue"')
const { lines } = layoutWithLines(prepared, 320, 26)

for (const line of lines) {
  // line.text, line.y, line.width, line.segments
}
```

### Use Case 3: Shrink-wrap width

Find the minimum container width that fits the text without wrapping.

```javascript
import { prepare, shrinkWrap } from '@chenglou/pretext'

const prepared = prepare('Hello world', '14px system-ui')
const { width } = shrinkWrap(prepared, 26)
```

## Options reference

| Option | Type | Values | Description |
|--------|------|--------|-------------|
| `whiteSpace` | string | `'normal'` \| `'pre-wrap'` | `'pre-wrap'` preserves whitespace (textarea-style) |
| `wordBreak` | string | `'normal'` \| `'keep-all'` | `'keep-all'` prevents mid-word breaks in CJK text |
| `letterSpacing` | number | pixels | CSS-equivalent letter-spacing |

```javascript
const prepared = prepare(text, font, {
  whiteSpace: 'pre-wrap',
  wordBreak: 'keep-all',
  letterSpacing: 1.5,
})
```

## Requirements

- `Intl.Segmenter` API (locale-aware word/grapheme segmentation)
- Canvas 2D text measurement (`CanvasRenderingContext2D.measureText`)
- Works in modern browsers and Node.js 16+ (with canvas package for Node)

## Output targets

| Target | Notes |
|--------|-------|
| DOM | Use `lines` + absolute positioning or `transform: translateY` |
| Canvas | Use `lines[i].y` + `ctx.fillText` |
| SVG | Use `lines[i].y` + `<text y=...>` elements |
| SSR | Heights computed server-side; hydrate positions client-side |

## Operating rules

1. Call `prepare()` / `prepareWithSegments()` once per unique (text, font) pair — it's the expensive step
2. Cache `prepared` objects when the same text is measured at different widths
3. Call `layout()` / `layoutWithLines()` freely — it's pure arithmetic with no side effects
4. Always check `Intl.Segmenter` availability before initializing in non-browser environments
5. Use `shrinkWrap` to find minimum width before measuring at a fixed container width
6. Prefer `prepareWithSegments` over `prepare` when you need per-line segment access for rich rendering

## Examples

```javascript
import { prepare, layout, prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

// Basic height check
const p = prepare('Hello, 世界! 🌏', '16px sans-serif')
console.log(layout(p, 200, 20))  // { height: 20, lineCount: 1 }

// Variable-width layout (text around floated image)
const ps = prepareWithSegments('Long article text...', '16px Georgia')
const { lines } = layoutWithLines(ps, (lineIndex) => {
  return lineIndex < 5 ? 200 : 320  // narrower for first 5 lines
}, 24)
```

Source: [chenglou/pretext](https://github.com/chenglou/pretext) — MIT License
