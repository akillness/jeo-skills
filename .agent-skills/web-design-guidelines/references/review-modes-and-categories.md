# Review Modes and Categories

Use this document to keep `web-design-guidelines` broad enough to be useful and narrow enough to avoid overlap drift.

## Review modes

### 1. Launch-readiness audit
Use when the team needs a broad pre-release pass.

Focus on:
- hierarchy and scanability
- CTA clarity
- missing feedback states
- obvious accessibility basics
- responsiveness basics
- trust and loading signals

Good output:
- top risks
- quick wins
- follow-up redesigns
- explicit route-outs

### 2. Polish / consistency audit
Use when the product mostly works but feels uneven.

Focus on:
- spacing consistency
- typography hierarchy
- repeated component mismatches
- icon/button/state inconsistency
- noisy or low-signal visual treatment

### 3. Flow-friction audit
Use when users can technically finish a task but the interface creates hesitation or missteps.

Focus on:
- unclear next steps
- weak field sequencing
- missing progress feedback
- unclear destructive actions
- dead ends or ambiguous recovery paths

### 4. Heuristic audit
Use when the request is broad or early-stage and you need a judgment framework.

Common heuristic buckets:
- visibility of system status
- match to user language and mental models
- user control and escape paths
- consistency and standards
- error prevention and recovery
- recognition over recall
- aesthetic clarity and minimalism

### 5. Rule-overlay audit
Use when the team explicitly wants alignment with a rule source such as Vercel Web Interface Guidelines.

Rule overlays are helpful for:
- consistent terminology
- implementation-facing checks
- reminding you about focus, forms, motion, performance, or responsive basics

Rule overlays are **not** the entire review.
Always combine them with category-based judgment.

## Stable categories

### Hierarchy and scanability
Ask:
- Is the most important action visually obvious?
- Is the screen easy to scan in 5–10 seconds?
- Are related elements grouped clearly?

### Clarity and language
Ask:
- Are labels and CTAs specific?
- Is the next step obvious?
- Do error/help messages explain what to do next?

### Consistency and component behavior
Ask:
- Do repeated components follow one pattern?
- Are states consistent across hover/focus/disabled/loading?
- Are icons and badges used predictably?

### Interaction feedback and recovery
Ask:
- Is loading visible?
- Is success/failure obvious?
- Can users cancel, undo, or recover?

### Navigation and wayfinding
Ask:
- Do users know where they are?
- Can they move backward safely?
- Are tabs, breadcrumbs, sidebars, and section labels coherent?

### Responsiveness basics
Ask:
- Does the layout still read well on narrow screens?
- Are touch targets usable?
- Does content overflow, truncate, or collapse awkwardly?

### Accessibility basics
Ask:
- Is focus visible?
- Is keyboard navigation plausible?
- Is contrast readable?
- Is meaning understandable without color alone?

### Performance and trust signals
Ask:
- Are heavy assets or unstable loading harming confidence?
- Do skeletons/spinners help users understand waiting?
- Are layout shifts or jank damaging the experience?

## Prioritization rule
Prioritize by user friction and launch risk, not by how many categories a problem touches.

A single broken next step in checkout beats ten minor spacing inconsistencies.
