# Darkbone Visual Language — the craft bible (REQUIRED in every Open Design handoff)

> Purpose: transfer the game's **craft level** to the design model. The preservation contract says what NOT to
> break; **this document says what GOOD looks like.** The generation target is a gorgeous, game-feel-first
> artifact — compliance alone is failure. Copy this file into every handoff folder and cite it in DESIGN.md.
> A live exemplar (`exemplar-craft.html`) accompanies this document: **match that craft level or better.**

## 1. Identity in one line

冥骨魂殿 (Bone Halls): a **funerary war altar** in a gothic Egyptian underworld — bone, tarnished gilt,
soul-teal fire. Every surface is carved, engraved, lit from within. **Never a web dashboard.**

## 2. Real palette (use these exact tokens; do not invent new hues)

```css
/* 刻金线 gold linework — frames, edges, titles */
--sig-au:#cfa94f; --sig-au-hi:#f4dd92; --sig-au-dim:#7d6526; --sig-au-edge:#2c2410;
/* 魂火 soul teal — life, magic, primary action energy */
--sig-soul:#3fc7b6; --sig-soul-hi:#78eadc; --sig-soul-deep:#249f92; --sig-soul-edge:#58d8c2;
/* accents */
--sig-cyan:#5fc8ff;              /* rare / alt-magic */
--sig-carn:#e0673c; --sig-carn-deep:#8a3a26;   /* danger red-copper */
/* dark plates (backgrounds are BUILT, not flat) */
--sig-plate-top:#0e1314; --sig-plate-bot:#070a0b;
/* structure */
--sig-ch:13px;      /* corner chamfer — octagonal cuts, never plain rounded rects */
--sig-edge-w:2px;   /* engraved gold frame thickness */
/* rarity family (cards/frames) */ common #D7D2C0 · rare #5fc8ff · epic #b07be0 · legendary #e6b23e · mythic #C77BFF
/* 羁绊四系 (bond colors) */ 迅捷 #5beaff · 坚壁 #f8d979 · 群巢 #7ee29a · 射手 #ffb14a
```

## 3. Material recipes (copy these CSS patterns — they ARE the art direction)

**刻金板 engraved gilt plate** (every button/panel frame):
```css
.plate{ position:relative; clip-path:polygon(/* chamfered octagon via --sig-ch */);
  background:linear-gradient(180deg,var(--sig-au-hi),var(--sig-au) 55%,var(--sig-au-dim));
}
.plate::before{ /* dark engraved well inset by --sig-edge-w */
  content:""; position:absolute; inset:var(--sig-edge-w); clip-path:inherit;
  background:linear-gradient(180deg,var(--sig-plate-top),var(--sig-plate-bot));
  box-shadow:inset 0 1px 0 rgba(244,221,146,.24), inset 0 2px 6px rgba(0,0,0,.5);
}
```
**魂火呼吸 breathing soul glow** (alive, not blinking — 3.8s period):
```css
@keyframes glowSoul{ 0%,100%{box-shadow:0 0 6px rgba(63,199,182,.35)} 50%{box-shadow:0 0 16px 3px rgba(63,199,182,.7)} }
```
**符文行进 rune-border march** (7s, slow ceremonial travel of dashed gold rule):
```css
.rune{ background-image:repeating-linear-gradient(90deg, rgba(207,169,79,.30) 0 8px, transparent 8px 16px);
  animation:runeTravel 7s linear infinite; }
```
**Sheen sweep** (3.8s specular pass across a plate, ::after skewed gradient) · **暗角 scrim** (radial vignette
grounding every full screen) · **骨白 bone text** #e8e2d6 with 1px dark emboss shadow — never pure #fff.

## 4. Layout grammar (what makes it a GAME screen)

- **Chamfered octagon slots** for icons/units (clip-path), engraved plate wells — never plain circles/squares.
- **Command plates & medallions** instead of web buttons; press feedback .09s scale+darken.
- **Section seals**: centered title between two engraved rule lines (`— 标题 —`), not bare `<h2>`.
- **Corner chips** for rarity/status (fixed top-corner pills outside text flow).
- **Composed scene, not column**: on wide viewports content is a staged altar (primary object center-stage,
  rails as side dossiers) — never a centered mobile column with dead margins.
- Numbers are chunky monospace with glow; progress bars are engraved troughs with lit fill + end-cap gem.

## 5. Motion personality

- One **orchestrated entry** per screen (350–550ms, staged: scrim → plate → object → chips), then restraint.
- Breathing (3.8s) for "alive/active", rune march (7s) for "ceremonial persistent", press .09s for "stone-solid".
- Reveals are **ceremonies**: gather-light → flash → settle (合星/融合/收魂 all follow this three-beat shape).
- Easing: ease-out entrances, spring only on small chips; nothing floaty/bouncy on large plates.

## 6. Game-feel checklist (self-check before returning ANY artifact)

1. Squint test: does it read as a dark-fantasy altar, or as a SaaS dashboard? (gradients+engraving vs flat cards)
2. Is every container chamfered/engraved/material — zero plain `border-radius:8px; background:#222` boxes?
3. Does the primary object (hero/unit/mask/reward) dominate — bigger than all chrome around it?
4. Is at least one surface breathing/marching (alive) without being noisy?
5. Are titles set as seals/plaques with gold linework — not bare left-aligned text?
6. Do numbers/currency read chunky+lit (game HUD DNA)?
7. Would a player screenshot this to show a friend?

## 7. DO / DON'T

| DO | DON'T |
|---|---|
| Chamfered plates, engraved wells, gold linework | Rounded-rect cards with drop shadows (web) |
| bone #e8e2d6 text with emboss | pure #fff / #aaa flat text |
| breathing soul-glow on active elements | opacity blink / spinner-as-life |
| staged entry choreography | everything fades in at once |
| side dossiers/rails on wide screens | centered 400px column on 1440px |
| rarity/bond colors from token table | bootstrap blue/green/red |
| textured scrim + vignette grounding | flat #000 background |
