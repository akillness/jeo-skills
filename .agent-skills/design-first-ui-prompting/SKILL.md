---
name: design-first-ui-prompting
description: >
  Use when you need design-first, spec-driven, skimmable prompts for UI generation. Covers
  prompt structure, constraints, variations, typography/spacing rules, and iteration workflow
  for consistent UI outputs.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Prompt-authoring workflow; works with any UI-generating agent or model. No local dependencies.
license: MIT
metadata:
  tags: design, first, prompting, mengto-skills, ui-prompting, design-first
  version: "1.0"
  source: https://github.com/MengTo/Skills/tree/main/agent-skills/ui/design-first-ui-prompting
---

# Design-First UI Prompting Skill

This skill is for **design-first prompting**: turn fuzzy ideas into a tight spec that produces consistent UI.

## When to use this skill

- Turning a fuzzy UI idea into a tight, skimmable spec using the GOAL / FORMAT / LAYOUT / TYPE SYSTEM / COLOR+MATERIAL / IMAGERY / COPY / CONSTRAINTS / NEGATIVE PROMPT skeleton.
- Locking a single "system" (layout, hierarchy, copy) first, then iterating by changing **one variable at a time** (angle/crop, accent color, card arrangement, background tone).
- Working around unreliable AI-generated typography with the 2-pass workflow: generate without text, then typeset the copy separately (e.g., in Figma).
- Building a "constraints card" (FONT / STYLE / MODE) to anchor a model's output like a mini style guide, or maintaining a local, gitignored reference pack instead of expecting the model to "remember" taste.
- Running the fast-iteration checklist (spacing, contrast, one-hero-line hierarchy, single accent color, texture) or the vague-user question list to clarify what a UI generation request actually needs.
- Not for defining or governing a shared design-token/visual-language system across pages and products (route to `design-system`), not for responsive/breakpoint layout strategy or verification (route to `responsive-design`), and not for reusable component API architecture (no dedicated owner skill currently exists in this repo — treat as a `design-system` boundary question).

## Core principle
**Prompt like a design system, not a wish.**

## Prompt Structure (copy/paste)
Use this skeleton, then fill the blanks.

```text
GOAL
- What are we making? (e.g., landing page hero / onboarding / dashboard / carousel slide)
- Who is it for? (persona)
- What’s the success criteria? (clarity, conversion, vibe)

FORMAT
- Size/aspect: (e.g., 1080x1350)
- Safe margins: (e.g., 90px)

LAYOUT (wireframe in words)
- Grid: (e.g., Swiss 6-col)
- Placement: (e.g., type-left / image-right)
- Hierarchy: H1 → subhead → body → CTA

TYPE SYSTEM
- Font vibe: (e.g., Söhne / Neue Haas / SF Pro)
- Weights: (H1 700, body 400)
- Leading: (tight for H1, readable for body)
- Tracking: (micro labels wider)

COLOR + MATERIAL
- Background: (hex or description)
- Text: (white/ivory/charcoal)
- One accent only: (cyan/lime/purple)
- Texture: (subtle grain, no plastic HDR)

IMAGERY / UI STYLE
- UI style: (minimal / glass / editorial / playful 3D)
- If photo: lighting + crop + texture rules
- If 3D: materials + lighting + softness

COPY (render EXACTLY)
- Line 1:
- Line 2:
- ...

CONSTRAINTS (change 1–2 things only)
- FONT: ___
- STYLE: ___
- MODE: ___

NEGATIVE PROMPT
- No logos, no watermarks
- No extra text beyond provided lines
- No gibberish typography
```

## Rules that improve consistency

### 1) Lock one “system”, then iterate with variants
- First output: nail **layout + hierarchy + copy**.
- Variants: change **ONE variable** at a time:
  - angle / crop
  - accent color
  - card arrangement
  - background tone

### 2) Treat typography as fragile
If the model keeps misspelling:
- Use **2-pass workflow**:
  1) Generate without text (reserve a clean text-safe area)
  2) Typeset in Figma

### 3) Use “constraints cards”
When you want the model to obey a style:
- Add a small “Constraints” panel with explicit values.
- It anchors the output like a mini style guide.

Example:
```text
Constraints
FONT  CANELA
STYLE  MINIMAL
MODE  DARK
```

### 4) Keep a local reference pack
Don’t ask the model to “remember” taste.
- Save references into a gitignored local reference folder, such as `refs/...`
- Point prompts to the reference style

## Fast iteration checklist (what to tweak)
- Spacing: margins, leading, baseline rhythm
- Contrast: background vs text
- Hierarchy: one hero line, one support line
- One accent only (don’t rainbow)
- Texture: add grain, remove smoothing

## Questions to ask (when user is vague)
- What’s the single message of this screen?
- What’s the hierarchy (H1 / sub / CTA)?
- Which style lane: minimal editorial vs playful 3D vs glass UI?
- Any must-keep constraints (font vibe, color, spacing, grid)?
## References

- Upstream source: [MengTo/Skills — design-first-ui-prompting](https://github.com/MengTo/Skills/tree/main/agent-skills/ui/design-first-ui-prompting)
- [ARTICLE.md](./ARTICLE.md) — longer-form article version of this workflow
- [REFERENCES.md](./REFERENCES.md) — external inspiration/reference sources (Mobbin, Bento Grids, Figma Community, Iconify, Simple Icons)
