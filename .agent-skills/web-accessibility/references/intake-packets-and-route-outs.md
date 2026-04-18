# Accessibility Intake Packets and Route-Outs

Use this note after the main accessibility surface has been classified.

## 1. semantics-structure
Use when the core problem is missing or misleading HTML semantics.

### Focus
- landmarks, headings, lists, tables, links, and button semantics
- form label/control relationships
- replacing clickable `div` / `span` patterns with native controls
- simplifying ARIA that is compensating for bad markup

### Return
- highest-risk semantic gaps
- native-first replacement plan
- where headings/landmarks/form relationships must change first
- route-outs if the problem is really system governance or component API architecture

### Route-outs
- reusable primitive API ownership → `ui-component-patterns`
- multi-product token/pattern governance → `design-system`

## 2. keyboard-focus
Use when interactive flow quality is the main risk.

### Focus
- tab order and reachability
- visible focus states
- modal/dialog/listbox/menu/tab keyboard behavior
- initial focus, trapped focus, and focus return

### Return
- the highest-risk interaction failures
- exact focus movement rules to implement
- which widgets need native semantics versus custom interaction work
- manual keyboard proof required before sign-off

### Route-outs
- reusable primitive API redesign → `ui-component-patterns`
- broad UI critique unrelated to accessibility → `web-design-guidelines`

## 3. labels-announcements
Use when controls are technically present but meaning is unclear.

### Focus
- accessible names for icon-only or ambiguous controls
- field labels, helper text, required-state messaging, and error summaries
- live-region usage for async save/validation/status updates
- announcements that are technically present but not useful in context

### Return
- missing/weak names and relationships
- clearer instruction/error/announcement fixes
- where copy changes matter more than extra ARIA
- which updates must be verified with screen readers or AT

### Route-outs
- broad content/copy hierarchy review → `web-design-guidelines`
- form/system architecture beyond accessibility messaging → neighboring product/frontend skill

## 4. visual-perception-reflow
Use when visual access or layout adaptation blocks real task completion.

### Focus
- contrast, focus visibility, and state visibility
- zoom and reflow behavior
- reduced-motion handling and animation safety
- touch-target or visibility problems tied to responsive layouts

### Return
- the highest-risk visibility/reflow failures
- whether the issue is accessibility remediation versus layout-strategy ownership
- manual verification for zoom, motion, and real task completion
- route-outs when viewport/container strategy is the primary problem

### Route-outs
- breakpoint/container/layout strategy → `responsive-design`
- system-level color/motion/token governance → `design-system`

## 5. media-alternatives
Use when images, audio, or video lack useful alternatives.

### Focus
- informative vs decorative images
- alt-text quality in context
- captions, transcripts, and descriptions
- fallback text for charts/complex visuals

### Return
- which media need alternatives first
- quality bar for alt/caption/transcript work
- content or editorial ownership notes
- manual review needed because usefulness is contextual

### Route-outs
- editorial/content-strategy ownership → content/documentation skill
- broader media-production workflow → media-specific skill

## 6. routed-navigation-feedback
Use when client-routed apps lose browser navigation cues.

### Focus
- route-change title/heading announcements
- where focus should move after navigation
- loading/transition announcements in SPA or app-router flows
- route changes that leave focus on stale controls or old nav items

### Return
- preferred page-change feedback strategy
- exact focus-reset or announcement expectations
- which flows need manual screen-reader verification
- honest boundary between accessibility remediation and broader router/runtime design

### Route-outs
- generic routing/data-flow architecture without accessibility failure evidence → router/framework skill
- pure React/Next performance issues → `react-best-practices`

## Quick routing heuristic
- If the request starts from axe/Lighthouse output, classify the failure surface before suggesting fixes.
- If keyboard or focus breaks task completion, prefer `keyboard-focus` even when other issues exist.
- If the request says “screen reader users don’t know the page changed,” prefer `routed-navigation-feedback`.
- If the issue is mostly layout strategy or breakpoint choice, route to `responsive-design` and keep accessibility here only for verification/remediation spillover.
- If the issue is mostly reusable primitive ownership, split the answer with `ui-component-patterns` instead of stretching this skill.
