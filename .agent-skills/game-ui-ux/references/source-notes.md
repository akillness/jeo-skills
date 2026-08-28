# Game UI/UX source notes

## Upstream discipline audited

- Repository: <https://github.com/gamedev-skills/awesome-gamedev-agent-skills>
- Pinned commit: `7110607ab816ece9669274bc84937857a8819796`
- Candidate path: <https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7110607ab816ece9669274bc84937857a8819796/skills/disciplines/game-ui-ux/SKILL.md>
- Useful discovery lanes: anchored layout, safe areas, focus navigation, screen stacks, HUD
  hierarchy, localization, event-driven updates, and accessibility.
- Rebuilt here: real-runtime preservation, player-decision mapping, explicit input/focus state,
  target-derived layout constraints, permission/stale/error bindings, dynamic verification,
  deterministic contract validation, and route-outs. No fixed resolution or universal size
  was copied.

## Accessibility and navigation

- Xbox Accessibility Guideline 112, "UI navigation":
  <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/112>
- Game Accessibility Guidelines, full list:
  <https://gameaccessibilityguidelines.com/full-list/>
- Use: input access, focus, navigation, visual/audio/motion alternatives, settings, subtitles,
  and barrier review.
- Do not infer: certification, platform compliance, or legal compliance from this skill alone.

## Engine references

- Unity `Screen.safeArea`:
  <https://docs.unity3d.com/ScriptReference/Screen-safeArea.html>
- Godot, "Keyboard/Controller Navigation and Focus":
  <https://docs.godotengine.org/en/stable/tutorials/ui/gui_navigation.html>
- Use: current engine concepts for safe-area bounds and focus navigation when those engines
  own implementation.
- Do not infer: that engine defaults satisfy the product's full UI/UX contract.

## General web accessibility boundary

- W3C Web Content Accessibility Guidelines overview:
  <https://www.w3.org/WAI/standards-guidelines/wcag/>
- Use: relevant semantics, keyboard, perception, reflow, and media considerations when a game
  UI is DOM/web based.
- Do not infer: every native or canvas game requirement is covered by WCAG alone.

## Catalog consolidation decision

This skill is the generic owner for the pictured `game-ui-design`, `game-ui-ux`, and
`threejs-game-ui-designer` intent. Existing project or engine owners remain:

- Darkbone Archer visual concept/handoff/takeover: `open-design-game-ui-*`;
- Three.js scene, interaction, animation, and rendering implementation: `threejs-*`;
- responsive web layout: `responsive-design`;
- broad web accessibility remediation: `web-accessibility`;
- moment-to-moment interface feedback: `game-feel`;
- Unity UI APIs: `unity-technologies-skills`.

## Claim policy

Target dimensions, text size, touch targets, margins, safe insets, localization expansion, and
focus geometry come from current platform guidance and measured devices. The skill does not
invent one universal reference resolution or certification threshold.
