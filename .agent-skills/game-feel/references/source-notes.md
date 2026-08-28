# Game feel source notes

## Game-feel framing

- Steve Swink, *Game Feel: A Game Designer's Guide to Virtual Sensation*
- Publisher page: <https://www.routledge.com/Game-Feel-A-Game-Designers-Guide-to-Virtual-Sensation/Swink/p/book/9780123743282>
- Use: game feel as the experienced interaction between player input, real-time control, and
  sensory response rather than a bag of effects.
- Do not infer: universal timing or amplitude values for a specific game.

## Upstream discipline audited

- Repository: <https://github.com/gamedev-skills/awesome-gamedev-agent-skills>
- Pinned commit: `7110607ab816ece9669274bc84937857a8819796`
- Candidate path: <https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7110607ab816ece9669274bc84937857a8819796/skills/disciplines/game-feel/SKILL.md>
- Useful discovery lanes: input response, motion, camera, feedback layering, and performance.
- Rebuilt here: one-mechanic scope, measured response chain, causal weak-link selection,
  simulation/presentation separation, accessibility replacements, controlled comparison,
  deterministic contract validation, and route-outs. No fixed effect count or timing target
  was copied.

## Engine timing references

- Unity, "Time and frame rate management":
  <https://docs.unity3d.com/Manual/TimeFrameManagement.html>
- Godot, "Fixing jitter, stutter and input lag":
  <https://docs.godotengine.org/en/stable/tutorials/rendering/jitter_stutter.html>
- Use: distinguish update, physics, rendering, frame pacing, interpolation, and input-related
  symptoms in the actual engine.
- Do not infer: one engine's loop or fix applies to every runtime.

## Accessibility references

- Xbox Accessibility Guideline 117, "Motion settings":
  <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117>
- Game Accessibility Guidelines, full list:
  <https://gameaccessibilityguidelines.com/full-list/>
- Use: motion, flashing, color, audio, haptic, and alternative-channel considerations.
- Do not infer: platform certification, legal compliance, or a universal pass from a checklist.

## Claim policy

- Latency stages are measured or labeled inferred.
- Durations, amplitudes, buffers, deadzones, ease curves, shake spectra, and event priorities
  come from the specific mechanic and target-device evidence.
- Game-feel polish does not replace a profiler, multiplayer authority contract, or mechanic
  design decision.
- Accessibility controls preserve information instead of simply deleting feedback.
