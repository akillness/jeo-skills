# The video prompt

The prompt that turns an approved board into a delivery, for the scripted lane: one run carrying the
whole sequence, with the plates, board and key frames passed as `referenceImages`. Seven labeled
sections, in this order. The wording below is measured, not stylistic: the sections marked
load-bearing each fixed a failure that cost a full video run to find. Fill in the specifics and keep
the structure.

In the chained lane, five of the seven carry over per shot: STARTING STATE, TIMELINE (one beat, not
eight), CAMERA, MUST REMAIN UNCHANGED and CONSTRAINTS without its audio paragraph. Drop REFERENCE
ROLES and GUIDES ARE NOT CONTENT. That lane passes no `referenceImages` and never shows the model a
board, so there are no reference roles to assign and no guides to rule out, and the boundary stills
carry identity and look instead. See [chained-lane.md](chained-lane.md).

## REFERENCE ROLES

Say what each reference governs and, just as important, what it does not.

> @image1 is the performer reference and controls only the character's identity: face, hair,
> costume. @image2 is a pencil storyboard, a planning document only: play its eight numbered panels
> in order, one shot per panel, three seconds each. It controls the order of the shots, the shot
> size of each, and where bodies sit in frame, and nothing else. @image3, @image4 and @image5 are
> concept art: photographic key frames that define the look of the finished film, its lighting, its
> color, its film grain and its texture. Match the concept art for rendering and the storyboard for
> staging. Every delivered frame is a single full-bleed photographic frame in the register of the
> concept art.

Two or three photoreal key frames earn their cost twice: they set the delivered look, and they give
the model a photographic source for appearance so it does not mine the drawing for one. Generate
them from the same plates before the run, at the delivery ratio, and name them in the prompt as
concept art.

## GUIDES ARE NOT CONTENT

Load-bearing. A prohibition does not work here; a definition does. Three runs carrying "no arrows,
symbols or annotation marks of any kind in frame" still rendered a drawn arrow into the delivery,
and deleting that clause changed only the arrow's color. What worked was telling the model what the
marks are:

> The storyboard's frame borders, panel numbers, caption text and motion arrows are planning guides
> drawn on paper by the director. They describe the shot, they are not objects in the world. None of
> them exists in the scene and none of them appears in any delivered frame. No text, no captions, no
> logos, no numbers, no arrows, no symbols, no storyboard panels, borders or grid visible in frame,
> no split screen, no pencil or paper texture anywhere.

Keep both halves. The first sentence does the work the list never did on its own.

## STARTING STATE

One sentence of place and one of the opening pose, so beat 1 has an entry state to begin from.

## TIMELINE

Load-bearing, and the section the shot list feeds directly. One entry per beat, and every entry
carries all five of: the timecode, `Panel N`, the shot size with angle and lens or move, the entry
pose, and the exit pose.

> TIMELINE, one shot per panel, each beat beginning in the pose the previous beat ended. 0-3s Panel
> 1, EWS high angle 24mm static: begins chin down, arms low, hands closed. She holds still, only the
> candle flames drift. Ends chin down, arms low. 3-6s Panel 2, FS eye level 35mm slow dolly in:
> begins chin down, arms low. Weight settles onto the right foot, then both arms sweep up and the
> spine arches, and the ruffled sleeves lag behind the arms and settle a beat after the arms stop.
> Ends arms crowned overhead, wrists turned out.

Naming the panel raises how faithfully that panel is reproduced, which is why the board must be a
clean plan: binding the beats to a heavily drawn board pulled more of the drawing through, including
its arrows.

Write the action as physics, not as adjectives. Name the approach, the contact, the transfer of
force, and the recovery, and give soft matter its lag: sleeves settling a beat after the arms stop,
dust thrown up on heel contact and falling back, a train reaching its arc after the pivot has
finished. Those all rendered correctly from prose alone in every run, which is why motion never
needs an arrow.

## CAMERA

Real rigs only, dolly and tripod, no drift where static is specified, and a shutter to fix the
motion blur ("consistent with a 1/48 second shutter on 35mm film").

## MUST REMAIN UNCHANGED

The identity list, restated as invariants: the same performer, costume, and location with its
lighting in the same places, first frame to last. Add the anatomy count ("two arms, two legs, and
five fingers on each hand in every frame"), which is cheap and catches the common failure.

## CONSTRAINTS

Only failures the timeline cannot express: duplicated limbs, feet sliding without weight transfer,
teleporting between positions, watermarks or timecode, slow motion, speed ramps, freeze frames.

Ask for sound, and be specific about which sound. This paragraph is scripted-lane only: one run
means one continuous audio bed, so the ask belongs in the prompt. A chained run scores the assembled
master instead and lays every shot picture-only, per [chained-lane.md](chained-lane.md). A silent
delivery is a defect in a production cut either way, so `generateAudio: false` is the fallback after
a refusal, not the default. The parameter defaults on, so sound needs no flag and only silence has
to be asked for. What gets a run refused is naming an instrument or a genre, which invites the model
to synthesize music and can fail the whole job on an output-audio copyright violation. So list the
sources the scene itself makes, and only those:

> Diegetic sound only: heel taps on the boards, fabric, breath, room tone.

Measured on two runs of the same sequence: that line, then followed by "No music, no score.",
delivered a clean audio track, while the same line with "a distant guitar" added failed on
`OutputAudioSensitiveContentDetected`. The exclusion has failed that check on other runs, so leave
it out. Name the surfaces, the cloth, the breath and the room, never the instrument and never what
to omit.

Nothing tool-side confirms the delivered track, so the audio check is eyes and ears: play the file
and listen for the beats the timeline named. A refusal arrives as a failed job with its own code,
but a run that succeeds while generating nothing useful arrives looking exactly like a run that
worked.
