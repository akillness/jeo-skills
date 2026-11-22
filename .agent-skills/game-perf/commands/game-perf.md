---
name: game-perf
description: Scan code for 10 common frame-drop patterns (UI + Game Engine) and optionally auto-fix them
allowed-tools:
  - Grep
  - Glob
  - Read
  - Edit
  - Agent
argument-hint: "[path] [--fix]"
---

# /game-perf

Scan for frame-drop patterns in game/interactive app code.

## Usage

```
/game-perf                    # Scan entire project
/game-perf src/components/    # Scan specific directory
/game-perf src/store/         # Scan store files
/game-perf --fix              # Scan and auto-fix with confirmation
/game-perf src/ --fix         # Scan directory and auto-fix
```

## Instructions

You are a game performance specialist. Parse `$ARGUMENTS` to determine:
1. **Target path**: File or directory to scan (default: current working directory)
2. **Fix mode**: If `--fix` is present, apply fixes with user confirmation

Execute the detection and reporting flow defined in `skills/game-perf/SKILL.md`.

### Quick Reference — 10 Patterns

**UI Layer (React / State Management)**

| # | Pattern | Severity | Key Signal |
|---|---------|----------|------------|
| 1 | O(n²) Lookup in loops | CRITICAL | `.find()` inside `forEach`/`map`/`for` |
| 2 | Render-loop state | CRITICAL | `useState`/`useStore` for zoom/pan/mouse |
| 3 | setState in drag | WARNING | `setState` in `onMouseMove`/`onDrag` |
| 4 | Selector object return | CRITICAL | `useStore(s => ({...}))` without `shallow` |
| 5 | Unvirtualized list | WARNING | `.map()` → JSX, no virtualization import |

**Game Engine (Three.js / WebGL / Canvas / PixiJS / Phaser)**

| # | Pattern | Severity | Key Signal |
|---|---------|----------|------------|
| 6 | GC Alloc in Hot Loop | CRITICAL | `new Vector3()`, `[...spread]`, `.map()` in render loop |
| 7 | Missing GPU Dispose | CRITICAL | `scene.remove()` without `.dispose()` |
| 8 | Unbatched Draw Calls | WARNING | Per-object `bindTexture` + `drawArrays` in loop |
| 9 | No Object Pooling | WARNING | `new Sprite()` in update + `.destroy()` |
| 10 | Variable Timestep | WARNING | `pos += vel * delta` without accumulator |

### Output Format

Always output a structured report with:
1. Summary line: files scanned, issues found (critical/warning/info)
2. Findings grouped by severity (CRITICAL first)
3. Each finding: pattern number, file:line, code snippet, fix suggestion
4. Summary table

In `--fix` mode, after the report:
1. Show proposed fix for each finding
2. Ask user to confirm each fix
3. Apply confirmed fixes
4. Re-scan to verify
