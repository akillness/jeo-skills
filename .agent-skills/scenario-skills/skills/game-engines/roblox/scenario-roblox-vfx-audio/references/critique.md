# Critique rubric (scenario-roblox-vfx-audio)

Judge your own output with this before calling an effect or a mix done. Visual items are judged on
contact sheets (at most 1,600 px wide), never on single frames one by one. Audio items split in two:
what the agent proves through the graph and analyzers, and what only a person can hear.

## Effects: freeze-frame sheet (Edit)

Capture with `rbx_vfx_audio.timeline` at about 0.05, 0.15, 0.35 and 0.7 s, plus one frame just past
the longest particle lifetime (scale to the effect's `lifetime()`), from the camera the player will
use.

| Check                         | Pass when                                                                        | Source                            |
| ----------------------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| First frame                   | a bright core reads at once; the silhouette says what happened                   | Twist VFX, zlKdwujvP2A [00:44:26] |
| Flash duration                | the flash shape is already gone by about 0.15 s                                  | Twist VFX [00:44:26]              |
| Layering                      | at least three distinct layers (core, smoke or debris, sparks) at the peak       | Twist VFX [00:00:13-00:06:13]     |
| Color                         | one hot-to-cool ramp (white-yellow, orange, dark red) and a dark layer for depth | Twist VFX [00:07:50]; [added]     |
| Fade                          | no layer pops out at full opacity; sizes or transparency reach the end value     | Twist VFX [00:03:29]              |
| Last frame                    | nothing left on screen at `lifetime()`; smoke thin or gone                       | [added]                           |
| Ground contact                | a shockwave or ring lies flat, not edge-on to the camera                         | [added]                           |
| Readability against the scene | the effect reads on both the brightest and darkest backdrop of the map           | [added]                           |
| Brightness                    | no frame is a white blob: `image_checks` `clipped` stays under 0.25              | [added]                           |

## Effects: play captures (playtest)

| Check              | Pass when                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projectile         | the head is visible in every in-flight capture and the trail tapers behind it                                                                                                                      |
| Motion             | consecutive captures differ (`compare` changed fraction above 0.001)                                                                                                                               |
| Impact             | the impact shows at the projectile's end point, not at its origin                                                                                                                                  |
| Clean up           | client `workspace.Fx` back to 0 children after `lifetime()` plus padding                                                                                                                           |
| Server             | server `workspace.Fx` stayed at 0 for the whole test                                                                                                                                               |
| Distance           | an effect beyond `cullDistance` is skipped on that client                                                                                                                                          |
| Under lag          | with 100 ms each way set before Play, the projectile path stays continuous and the impact lands where the server's ray hit; the caster's own delay is noted, or hidden by local prediction [added] |
| One-player effects | a Camera post effect or Highlight flash shows on the client that owns it; nothing under Lighting changed                                                                                           |

## Effects: numbers (VfxAudit)

- 0 errors, 0 warnings on the library; each warning kept needs a written reason.
- Rate per emitter within 400 per second (100 on mobile targets); Lifetime within 20 s.
- Every Beam and Trail has two attachments; beams with many keypoints have enough segments.
- Always-on emitters and beams counted per scene; the budget is a team number and goes to
  scenario-roblox-performance.

## Audio: what the agent proves

| Check     | Pass when                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Wiring    | every `Wire.Connected` is true (`AudioAudit` rule `wire-disconnected` absent)                                                 |
| Route     | `AudioKit.paths(source)` contains `AudioDeviceOutput`                                                                         |
| Listener  | a playtest client has an `AudioListener` (Camera or Character) and an `AudioDeviceOutput`                                     |
| Playback  | `IsPlaying` true and `TimePosition` advancing; one-shots fire `Ended`                                                         |
| Level     | an analyzer on the bus reads `RmsLevel` above 0 while playing and `PeakLevel` below 1                                         |
| Space     | `GetAudibilityFor` at the gameplay distances follows the intended curve; the right listeners are in `GetInteractingListeners` |
| Ducking   | the ducked level is at least 3 dB under the undisturbed level, measured at the same `TimePosition`                            |
| Files     | `check_audio` ok: format, size, length, sample rate, channels; true peak at or under -1 dB                                    |
| Footsteps | about one step per stride; the set follows `FloorMaterial`; the legacy Running sound muted                                    |

## Audio: the ear pass (a person)

The agent cannot hear. Hand these to the user with the place, the test name and the moment to listen
to:

- Balance: music under dialogue and effects; nothing masks the cue a player must react to.
- Timing: the impact sound lands on the flash frame; footsteps land on contact frames.
- Tone: effects match the art style; no harsh resonance or hiss after `prepare_audio`.
- Repetition: footsteps and hits do not sound like one sample looping; pitch jitter is enough.
- Space: distance falloff and stereo position feel right when walking around a source.
- Ducking: the dip is felt, not heard as pumping.
- Loudness against other games and against the Roblox menu sounds.
- Voice and microphone features (AudioDeviceInput): need a real microphone and a second person.
