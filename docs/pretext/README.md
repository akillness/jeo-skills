# pretext — Fast Multiline Text Measurement & Layout

> No DOM reflow. Pure arithmetic on cached font metrics.

← [Back to README](../../README.md)

---

## What `pretext` owns

`pretext` is the skill for [@chenglou/pretext](https://github.com/chenglou/pretext), a pure JavaScript/TypeScript library for fast, accurate, and comprehensive multiline text measurement and layout — without triggering DOM reflow operations.

Use this skill when you need to:
- **Calculate paragraph heights** and line counts without DOM measurement
- **Build manual line layouts** for text flowing around floated images or variable containers
- **Handle rich text** with emoji, CJK characters, RTL content, and mixed languages
- **Render to DOM, Canvas, or SVG** with accurate pre-computed metrics
- **Implement soft hyphenation**, letter-spacing, or locale-aware word breaking
- **Avoid reflow** in performance-critical rendering loops

## Installation

### Plugin (Claude Code)
```bash
claude plugin marketplace add chenglou/pretext
```

### npm
```bash
npm install @chenglou/pretext
```

### Skill
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill pretext
```

---

## Core API

| Function | Purpose |
|----------|---------|
| `prepare(text, font, opts?)` | One-time analysis + font measurement (cached) |
| `layout(prepared, width, lineHeight)` | Pure arithmetic → `{ height, lineCount }` |
| `prepareWithSegments(text, font, opts?)` | Like `prepare` but with segment data for rich rendering |
| `layoutWithLines(prepared, width, lineHeight)` | Returns `{ lines }` for per-line access |
| `shrinkWrap(prepared, lineHeight)` | Minimum container width without wrapping |

---

## Quick start

```javascript
import { prepare, layout } from '@chenglou/pretext'

// Height measurement — no DOM reflow
const p = prepare('Hello 世界 🌏', '16px Inter')
const { height, lineCount } = layout(p, 320, 20)

// Manual line layout
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'
const ps = prepareWithSegments('Article text...', '16px Georgia')
const { lines } = layoutWithLines(ps, 320, 24)
```

---

## Options

| Option | Values | Description |
|--------|--------|-------------|
| `whiteSpace` | `'normal'` \| `'pre-wrap'` | `pre-wrap` for textarea-style whitespace preservation |
| `wordBreak` | `'normal'` \| `'keep-all'` | CJK word breaking control |
| `letterSpacing` | number (px) | CSS-equivalent letter-spacing |

---

## Requirements

- `Intl.Segmenter` API
- Canvas 2D `measureText` (browser or Node.js `canvas` package)
- Modern browsers or Node.js 16+

---

## Further reading

- [`.agent-skills/pretext/SKILL.md`](../../.agent-skills/pretext/SKILL.md)
- [chenglou/pretext](https://github.com/chenglou/pretext)
- [npm: @chenglou/pretext](https://www.npmjs.com/package/@chenglou/pretext)
