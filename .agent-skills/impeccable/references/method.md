# Method: modes, critique, audit, severity

Distilled from the pinned upstream playbooks (`SKILL.src.md`, `reference/critique.md`,
`reference/audit.md`, `reference/polish.md` at `02523aec3e4c4580102d996d1b6a71fbe062e03f`,
Apache-2.0, © 2025 Paul Bakaus). This file paraphrases the method so the operator works
without the upstream skill installed. When the upstream skill is installed, its playbook
for the command at hand wins over this summary.

## Context files

| File | Owner | Holds |
|---|---|---|
| `PRODUCT.md` | `init` | Users and their situation, what the product makes possible, durable constraints, platform (`web`, `ios`, `android`, `adaptive`), stack |
| `DESIGN.md` | `document` (records) or new-work (creates/replaces) | Visual system: YAML tokens (`colors`, `typography`, `rounded`, `spacing`, `components`) plus fixed prose sections; tokens are normative |
| `.impeccable/design.json` | `document` | What the DESIGN.md token schema cannot hold: tonal ramps, shadows, motion, breakpoints, component snippets |
| `.impeccable/critique/*.md` | `critique` | Archived critique snapshots; `polish` reads the latest and closes it |
| `.impeccable/config.json` | `hooks`, `init` | Shared detector ignores, hook settings, `buildPath`, `telemetry` |

Read existing context before acting. Missing `DESIGN.md` does not make a project greenfield:
the shipped UI is still evidence of a visual world.

## Two rules that decide most disputes

- **The brief wins.** A pinned aesthetic, era, font or palette beats a detector warning and
  beats your taste. Redirecting a clear brief toward a default is a failure.
- **Refinement preserves; redesign replaces.** Refinement keeps identity, behavior, copy and
  everything outside scope. Redesign keeps product truth, content and function but treats the
  old look as evidence to replace. Do not polish a look you were asked to replace, and do not
  smuggle a redesign into a polish.

## Modes

Choose the mode from the surface being worked on, not from the product.

| Mode | Visitor success | Typical surfaces | Ambition shows as |
|---|---|---|---|
| Persuade | decides and acts | landing, marketing, campaign, pricing | a committed, distinct point of view |
| Operate | completes a task | app UI, dashboards, editors, admin, settings | precision, consistency, native expectations |
| Read | understands | docs, articles, guides, help, changelogs | structure for comprehension, then reading comfort |
| Experience | is inside the work | portfolios, galleries, showcases | the artifact leads; interface recedes |

A tool's landing page is Persuade; a fashion brand's docs are Read.

## Critique protocol

1. **Resolve one stable target.** Prefer a source path over a dev-server URL for the same
   surface; ports change. Honor `.impeccable/critique/ignore.md` if present.
2. **Run two independent assessments.**
   - *A, design review:* source plus a rendered look. Judge design specificity first (could an
     unrelated product ship this unchanged?), then hierarchy, IA, emotional fit, states, copy,
     cognitive load, heuristics.
   - *B, evidence:* the detector over markup files (or a URL/CDP scan) plus a browser overlay
     when available.
   - A must finish before B's findings reach the synthesis; deterministic output anchors judgment.
   - Use two isolated sub-agents when the harness has them. If you must run both in one
     context, the report's first line is `⚠️ DEGRADED: single-context (<reason>)`. On a native
     platform, run A alone; that is the complete method, not a degraded one.
3. **Synthesize, do not concatenate.** Say where A and B agree, what B caught that A missed,
   and which detector hits are false positives.
4. **Report in chat first.** Header line declaring the method, the heuristic table, the
   specificity verdict, 2-3 strengths, 3-5 priority issues (each with P-level, why it matters,
   concrete fix, suggested command), persona red flags, minor observations.
5. **Then persist** (engine mode: `impeccable critique-storage write`) and show the trend line.
6. **End with targeted questions** (priority, intent, scope; 2-4 questions with concrete
   options tied to findings), or the literal line `Questions skipped: <reason>` when there were
   fewer than 3 priority issues. Nothing follows the question.

### Heuristic scoring

Score Nielsen's 10 heuristics 0-4 each: visibility of system status; match with the real world;
user control and freedom; consistency and standards; error prevention; recognition over recall;
flexibility and efficiency; aesthetic and minimalist design; error recovery; help and
documentation. A 4 means genuinely excellent; most real interfaces land between 20 and 32 of 40.

On Persuade and Experience surfaces, heuristics 7 and 10 (and any other that truly cannot
apply) may be `n/a` with a one-line reason. The maximum becomes 4 × scored heuristics; never
print `/40` over a partial set. Read the band from the percentage:

| Percent of applicable max | Of 40 | Band |
|---|---|---|
| ≥ 90% | 36-40 | Excellent |
| ≥ 70% | 28-35 | Good |
| ≥ 50% | 20-27 | Acceptable |
| ≥ 30% | 12-19 | Poor |
| < 30% | 0-11 | Critical |

### Cognitive load

Check eight items: single focus, chunking (≤ 4 per group), grouping, visual hierarchy, one
decision at a time, ≤ 4 visible options per decision, no carried-over memory between screens,
progressive disclosure. 0-1 failures is low load, 2-3 moderate, 4+ critical. Report any decision
point with more than four visible options.

### Personas

Pick 2-3 by surface; name exactly what broke for each, not a generic profile.

| Surface | Personas |
|---|---|
| Landing / marketing | first-timer, stress tester, distracted mobile user |
| Dashboard / admin, data-heavy | power user, accessibility-dependent user |
| E-commerce / checkout | distracted mobile user, stress tester, first-timer |
| Onboarding | first-timer, distracted mobile user |
| Forms / wizards | first-timer, accessibility-dependent user, distracted mobile user |

Upstream names them Alex (power user), Jordan (first-timer), Sam (screen reader and keyboard),
Riley (stress tester) and Casey (one-handed mobile). Add 1-2 project personas only from real
PRODUCT.md audience data.

## Audit protocol

Document, do not fix. Score five dimensions 0-4:

| Dimension | Checks |
|---|---|
| Accessibility | contrast (4.5:1 body, 3:1 large), reduced-motion alternative that keeps state changes, ARIA roles/labels/states, keyboard focus and order, semantic HTML and headings, alt text, form labels and errors |
| Performance | layout thrashing, layout-property or unbounded filter animation, unoptimized/eager images, `will-change` left on, unused imports, needless re-renders |
| Theming | hard-coded colors, broken dark mode, wrong or mixed tokens, values that ignore theme switches |
| Responsive | fixed widths, touch targets (44px recommended; WCAG 2.5.8 floor 24px with its spacing exceptions), touch gestures that fail or fight page scroll, horizontal overflow, text scaling, missing breakpoints |
| Implementation integrity | detector findings verified in context, repeated shortcuts, design-system drift, decorative or misleading content |

Total out of 20: 18-20 Excellent, 14-17 Good, 10-13 Acceptable, 6-9 Poor, 0-5 Critical. Lead
with the integrity verdict, then the executive summary, findings by severity (location,
category, impact, standard, fix, command), systemic patterns and what works. End the
recommended commands with `polish` when any fix is recommended. Native projects use the native
audit variant; desktop apps scan through a loopback DevTools port (`detect --cdp`).

## Severity

| Level | Meaning | Action |
|---|---|---|
| P0 Blocking | prevents task completion | fix now |
| P1 Major | significant difficulty, confusion or a WCAG AA failure | fix before release |
| P2 Minor | annoying, workaround exists | next pass |
| P3 Polish | no real user impact | if time permits |

Unsure between two levels: would a user contact support about it? If yes, it is at least P1.
Keep P3s few.

## Polish triage order

Polish fixes causes at the narrowest correct level (missing token, one-off instead of shared
component, conceptual mismatch, or local defect) in this order: broken tasks, data loss,
misleading state and inaccessible paths; missing loading/empty/error/success/disabled/permission
states; flow, hierarchy, responsive and system drift; visual and motion inconsistencies; then
code and asset cleanup. Bring the whole path to one bar instead of perfecting one corner. A
current critique snapshot is one input, not the plan. If the concept itself is wrong, say so and
recommend redesign or `bolder` instead.
