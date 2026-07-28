# Darkbone Meta UI Design Contract

## Screens And Player Jobs

| Screen | The player must understand immediately | Primary visual object |
|---|---|---|
| Home | Who am I playing, what makes this hero distinct, and how do I deploy? | Large selected character rig/portrait |
| Map Select | Where am I going, what is the risk/reward, and what unlocks next? | Journey/map art plus route progression |
| Talent | Where am I in the build, what can I afford, and what changes if I invest? | Legible character-specific talent constellation |
| Masks | What is equipped, what is owned/locked, and how does a mask alter the run? | Real soul-mask art and loadout relationships |
| Fusion | What materials are consumed, what can be protected, and what outcome/risk am I accepting? | Ritual inputs-to-result transformation |
| Victory | What did I achieve, what changed, and where do I inspect the run? | Staged verdict, recovered rewards, growth, and report handoff |

## Required Viewports

```text
852x393    phone landscape, touch, very short vertical budget
1180x820   iPad landscape, touch/trackpad hybrid
1440x900   desktop baseline, mouse/keyboard
1920x1080  Steam/wide desktop, couch-distance readability
```

Do not scale one phone composition. Define composition changes:

- Phone landscape: use the short height aggressively; keep the primary object and command visible without a long vertical stack.
- iPad: allow a primary stage plus one stable information rail; touch targets remain at least 44 CSS px.
- Desktop: use the width for simultaneous context, comparison, and direct actions. Keep content centered as a composed scene, not a narrow mobile column.
- Steam/wide: increase the visual object's presence, information grouping, and controller focus readability; do not let all controls drift to distant corners.

## Player-Lens Review Order

1. **Three-second read:** identify screen, selected object, progression state, and primary action.
2. **Fantasy:** the screen must feel like operating a funerary war altar, commander roster, or tomb journey, not a web account dashboard.
3. **Hierarchy:** visual object first, current choice second, consequence/reward third, global navigation last.
4. **Relationships:** proximity and alignment must explain which controls affect which object.
5. **Interaction:** touch, hover, keyboard focus, controller focus, disabled, locked, selected, loading, and confirmation states must be obvious without explanatory copy.
6. **Detail:** icon scale, label wrapping, hit area, motion timing, contrast, and material treatment must survive every viewport and locale.

## Responsive Component Rules

- Replace extremely long desktop buttons with a compact command plate, medallion, radial command, or icon-plus-label control when the action remains clear.
- Scale important icons and character/map/mask art by role, not by a global CSS multiplier.
- Keep compact controls dimensionally stable so label changes do not move adjacent UI.
- Use side rails, anchored dossiers, comparison strips, and staged overlays to exploit desktop width.
- Avoid cards inside cards and avoid floating card containers for whole page sections.
- Reserve cards for repeated selectable objects, details, and modals.
- Keep the selected object physically close to its stats and actions.
- English may require wider labels and shorter copy; Chinese may require better vertical rhythm. Never stack both languages in one render.

## Motion Contract

- Current runtime motion is the baseline source of truth. Standalone omission means unspecified/preserve,
  never delete. Open Design may replace motion only when the component authority matrix explicitly assigns
  that axis and rendered video proves an upgrade.
- Use one orchestrated screen-entry moment per surface, plus restrained state feedback.
- Home character switch: roster selection, silhouette/rig entrance, mask orbit settling, and dossier update share one 350-550 ms sequence.
- Map select: path focus and map reveal should imply travel direction, not generic fading cards.
- Talent: investment should visibly travel from currency/point source to node and then through affected links.
- Masks: equip changes should show slot ownership and relationship to the selected hero.
- Fusion: input commitment, protection lock, merge, result reveal, and three-choice resolution are separate beats.
- Victory/settlement: verdict, reward modules, count-up/growth, unlock, and dashboard handoff remain a complete
  sequence on desktop/Steam; a static result state is not a replacement design.
- Respect `prefers-reduced-motion`; preserve state clarity without looping ambient motion.

Identity-critical runtime signatures are mandatory preservation targets unless explicitly upgraded:

- Home: live character rig idle/rotation, character-switch entrance, rotating ritual floor, floating mask
  sigils/sockets, and animated level/talent emblems.
- Talent: detailed golden Wedjat/Horus eye nodes, five branch-colored pupils, vertical legacy trunk, teal living
  links, breathing ranked state, and investment reveal.
- Fusion: sacrifice, colored vortex, detonation, birth, proclaim, affix, and settled collection beats.
- Victory: staged verdict and reward reveal, growth/count-up impact, unlock celebration, and dashboard transition.

## Input Contract

- Touch: 44 CSS px minimum actionable target, no hover-only information.
- Mouse: useful hover preview without layout shift.
- Keyboard/controller: one visible focus ring language, deterministic directional order, no focus traps outside modals.
- Controller primary/secondary actions remain spatially stable across screens.
- Escape/B returns one level, never silently discards a committed choice.

## Open Design Artifact Contract

Return one self-contained HTML artifact named `darkbone-steam-meta-ui-concept.html` with real HTML/CSS/JS, not a static image. It must include:

- six switchable screens: `home`, `mapselect`, `talent`, `masks`, `fusion`, `victory`;
- `zh` and `en` locale switching;
- representative default/detail/locked/insufficient/confirmation states where relevant;
- responsive behavior at all required viewports;
- hover, focus-visible, keyboard, and reduced-motion behavior;
- no runtime repository edits and no framework/build dependency;
- a visible but compact designer review toolbar that can be hidden for screenshots;
- query support: `?od-screen=<id>&od-lang=<zh|en>&od-state=<id>&od-review=0`;
- this automation surface:

```js
window.DARKBONE_DESIGN_REVIEW = {
  ready: true,
  screens: ['home', 'mapselect', 'talent', 'masks', 'fusion', 'victory'],
  locales: ['zh', 'en'],
  setScreen(id) {},
  setLocale(id) {},
  setState(id) {},
  hideToolbar() {},
  snapshot() {},
};
```

`snapshot()` should return the active screen, locale, state, and important responsive mode so Playwright can verify what it captured.
