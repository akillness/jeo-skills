# Responsive Intake Packets and Route-Outs

Use this file after the intake is classified. The goal is to pick **one primary responsive packet** and keep neighboring frontend work outside the main answer unless it is truly primary.

## Packet router

| Packet | Use when | First decisions | Common route-outs |
|---|---|---|---|
| `page-layout` | The page shell, nav, sidebar, grid, or section density changes with viewport width | mobile-first baseline, intrinsic grid/flex rules, minimal viewport breakpoints | `web-design-guidelines` for broad launch review, `design-system` for shared breakpoint policy |
| `component-slot` | A reusable card, panel, toolbar, or module behaves differently based on parent width | intrinsic component layout vs container queries, slot-based adaptation | `ui-component-patterns` if the component API/structure is the real problem |
| `dense-data` | Tables, dashboards, toolbars, filters, or long-label UI need intentional small-screen behavior | preserve tabular meaning vs summarize/stack/scroll, density fallback, overflow rules | `web-accessibility` when reflow/reading order becomes the main issue |
| `media-behavior` | Images, video, embeds, or art direction drive the responsive problem | `srcset` / `sizes`, aspect ratio, crop strategy, embed sizing, art-direction edge cases | `react-best-practices` only when runtime/perf behavior becomes primary |
| `verification-reflow` | The main risk is uncertainty about zoom, reflow, localization, or screenshot-only proof | verification matrix, long-copy stress, 320px/400% zoom checks, manual follow-up | `web-accessibility` for semantics/keyboard/focus remediation; `web-design-guidelines` for broader launch polish |

## Selection rules
1. Pick the packet that answers the **current decision**, not every possible downstream concern.
2. If both page-shell and component-slot work are involved, choose whichever change is blocked right now and list the other as follow-up.
3. If the only honest answer is “the screenshot proves too little,” choose `verification-reflow`.
4. If the real problem is component contract sprawl, token governance, or accessibility remediation, route out early instead of hiding it under responsive language.

## Invariants
- Prefer intrinsic layout before breakpoint sprawl.
- Use viewport queries for page-shell shifts and container queries for reusable slot behavior.
- Treat tables and crowded toolbars as explicit fallback-design problems, not generic CSS bugs.
- Keep manual verification visible: narrow widths, zoom/reflow, long copy, localization, overflow, and responsive media checks.

## Output reminder
A good responsive answer ends with one short packet:
- primary packet
- first slice
- layout decisions
- verification plan
- route-outs
