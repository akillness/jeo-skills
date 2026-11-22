# GUI paths (scenario-roblox-vfx-audio)

The same work through Studio's interface, for a person or a computer-use agent. The agent's code
path is in [procedures.md](procedures.md). Menu names are from the October 2026 Studio on macOS;
plugin panels vary by version.

## Before judging any effect

- **Editor Quality Level:** File > Studio Settings > Rendering > Editor Quality Level. Set it high
  (MoldySugar uses 21, 9dQR7FySSLg [00:00:06]) or effects look wrong in Edit. No Luau setting exists
  for it; captures from an agent use whatever the person set.
- **Slow motion:** select the emitters and lower `TimeScale` in Properties (0 freezes). VFX plugins
  expose the same as "Retime" or multipliers (MoldySugar, 9dQR7FySSLg [00:04:18]).

## Particles, beams and trails

| Task                                | Path                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Insert an emitter                   | Explorer: hover the Part or Attachment, click the + button, pick ParticleEmitter (particle emitters docs)                            |
| Edit Size or Transparency over life | Properties > Size (or Transparency) > the "..." button opens the NumberSequence editor                                               |
| Edit Color over life                | Properties > Color > "..." opens the ColorSequence editor                                                                            |
| Fire a burst in Edit                | a VFX plugin's Emit button with Count, Delay, Duration; without a plugin, toggle Enabled or run `emitter:Emit(n)` in the command bar |
| Flipbook                            | Properties > Flipbook: FlipbookLayout (Grid2x2, Grid4x4, Grid8x8), FlipbookMode, FlipbookFramerate                                   |
| Beam between two points             | add two Attachments, insert a Beam, set Attachment0 and Attachment1, then CurveSize0 and CurveSize1                                  |
| Trail                               | two Attachments on the moving part, insert a Trail, set both attachments; move the part in Play to see it                            |
| Store emit counts                   | Properties > Attributes > + > Name `EmitCount`, Type Number (Twist VFX, zlKdwujvP2A [00:00:29])                                      |

Common VFX plugins (Creator Store, none required by this skill): VFX Suite or Forge (emit, retime,
curve editor), Zonito Visuals (texture library), Particle Scaler. The code substitute is `VfxKit`
(build, emit, scale, freeze).

## Audio

| Task                                 | Path                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import audio or images               | Asset Manager (Window menu or Home tab, asset-manager docs) > the import button; or Creator Hub > Development Items > Audio > Upload Asset. A person does this: uploads are never done by the agent                                                                                                                                                                                                       |
| Listener location                    | Explorer > SoundService > Properties > DefaultListenerLocation (Camera or Character)                                                                                                                                                                                                                                                                                                                      |
| Character sounds on the Audio API    | SoundService > Properties > CharacterSoundsUseNewApi                                                                                                                                                                                                                                                                                                                                                      |
| Acoustic simulation                  | SoundService > Properties > AcousticSimulationEnabled                                                                                                                                                                                                                                                                                                                                                     |
| Build a graph                        | insert AudioPlayer, effects, AudioEmitter or AudioDeviceOutput, then a Wire under any of them; set Wire.SourceInstance and TargetInstance in Properties                                                                                                                                                                                                                                                   |
| Preview a player                     | select the AudioPlayer > Properties > Play (or press the play icon in Explorer)                                                                                                                                                                                                                                                                                                                           |
| Footstep markers                     | Animation Editor with your copy of the run clip > settings icon right of the timeline > Show Animation Events; drag the scrubber to a contact frame; Edit Animation Events > + Add Event, name `footstep`, Parameter `left` or `right` > Save (animation events docs). GnomeCode's 2022 editor used right-click > Add Animation Event (PNYtTkMidE8 [00:04:42]). Then publish the clip (a person's upload) |
| Replace the default character sounds | Explorer > StarterPlayer > StarterPlayerScripts > + > LocalScript, rename it `RbxCharacterSounds`, leave it empty (observed: legacy Sounds 9 to 0)                                                                                                                                                                                                                                                        |
| Legacy SoundGroup                    | create a SoundGroup under SoundService, then set each Sound's `SoundGroup` property (parenting does not assign it)                                                                                                                                                                                                                                                                                        |

## One-player effects and hit flash

| Task                             | Path                                                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview a one-player post effect | Explorer > Workspace > Camera > + > BlurEffect or ColorCorrectionEffect. In a game, create it from a client script: each client has its own Camera ([copy-ready.md](copy-ready.md#4-post-effects-for-one-player)) |
| Global post effects (everyone)   | Explorer > Lighting > + > the effect; recipes belong to scenario-roblox-environment                                                                                                                               |
| Hit flash look                   | Explorer: hover the character Model > + > Highlight; Properties > FillColor, FillTransparency, DepthMode (Twist VFX, zlKdwujvP2A [00:42:01])                                                                      |

## Test under lag

| Task                              | Path                                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network Simulator                 | File > Beta Features > enable New Device Simulator, restart Studio; Test > Device Simulator; the Network pill above the viewport; pick a preset or type latency, jitter and loss; Apply before Play (network-simulator docs) |
| Same values without the simulator | File > Studio Settings > Network (network-simulator docs)                                                                                                                                                                    |
| Code substitute                   | `settings().Network.InboundNetworkMinDelayMs` and `OutboundNetworkMinDelayMs` in Edit ([copy-ready.md](copy-ready.md#6-test-the-fireball-under-lag))                                                                         |

## What stays GUI-only

- Editor Quality Level.
- Uploading textures, flipbook sheets and audio (Asset Manager or Creator Hub; Open Cloud with the
  user's API key is the scripted alternative, not run here).
- Animation events in the Animation Editor. Code substitute: a `KeyframeSequence` with
  `KeyframeMarker` children registered through `KeyframeSequenceProvider:RegisterKeyframeSequence`
  (owned by scenario-roblox-animation).
- Listening. The agent measures; a person hears.
