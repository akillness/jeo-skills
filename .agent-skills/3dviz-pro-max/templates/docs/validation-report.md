<!-- validation-report.md - copy next to the artifact and fill it in AFTER running things. Every
row needs evidence that exists on disk. If something was not run, write "not run" and why; an
unobserved frame is never reported as passing. Delete rows that do not apply to this scene. -->

# <Scene name>: validation report

Date: <YYYY-MM-DD> · Build: <commit or "working copy"> · Runtime: <three@0.180.0, vite@7.1.5>

## Checks

| Check | Method | Result | Evidence |
| --- | --- | --- | --- |
| Build succeeds | `pnpm build` | <pass / fail> | <paste the vite summary line> |
| Unit tests | `<node --test *.test.js>` | <n passed / n failed> | <log path> |
| Console clean | `capture.py` console + pageerror capture | <0 errors> | `captures/capture-log.json` |
| All authored views render | `capture.py --all-views` | <n views> | `captures/<name>.png` |
| Scene is alive | `capture.py --motion-check 2000 --expect-motion` | <differs: true/false> | `captures/default-motion.png`, `capture-log.json` `motion` |
| Controls change visible state | `capture.py --click "#control"` | <what changed> | `captures/click-0-control.png` |
| Reset restores the home view | manual / capture | <pass> | <path> |
| Anti-slop checklist | `checklists/visual-anti-slop.md` | <n/15, opt-outs recorded> | `design-system.md` §9 |
| Per-frame inspection | `checklists/inspection-per-frame.md` | <pass / issues fixed> | <paths> |
| Reduced motion | `prefers-reduced-motion` emulated | <starts still> | <path> |
| Frame time | <how measured> | <ms on what machine> | <path or "not measured"> |

## What ran

<The commands actually executed, in order, and where their output landed. Name the machine and the
browser if a frame was rendered.>

## What was observed

<What you saw in the captures, in plain sentences: composition, the hero's contrast, depth
separation, whether the scale cue reads, what a control changed. Name the issues you fixed and the
capture that shows the fix.>

## What is uncertain

<What was not observed and why: mobile layout, colour on a wide-gamut display, performance on
low-end hardware, any claim resting on a source you did not re-read. Say which of these a user
should check themselves.>

## Captures

| File | View or action | Notes |
| --- | --- | --- |
| `captures/default.png` | first frame after ready | <> |
| `captures/overview.png` | authored overview | <> |
| `captures/hero.png` | hero close-up | <> |
| `captures/click-0-control.png` | after `#control` | <> |
