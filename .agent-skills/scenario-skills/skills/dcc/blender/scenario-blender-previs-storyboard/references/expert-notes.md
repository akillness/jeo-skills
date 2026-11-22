# Expert notes: previs, layout, storyboarding, camera language

The depth behind SKILL.md, by expert. Timestamps are [hh:mm:ss] in the source video (URLs in
sources.md). Items marked [added] are this skill's own additions, not the experts'.

## Hjalti Hjalmarsson, Blender Studio director (Charge, Sprite Fright)

Sources: BCON24 Animation Previs/Layout Workshop (XZtJ64g5VQQ, the anchor) and the Charge previz
overview (cTx-n4OZXYE).

**What the job is.** Convey the idea well enough that it can be judged (is it funny or not), with
the fewest poses that still carry every beat [00:15:33] [00:45:17]. "No matter how well you do, you
will always have a producer saying you could have done it cheaper" [00:48:40]. Previs is disposable
art: mannequins, primitives, props modeled inside the previs file because their survival is
uncertain, only stable characters linked (Charge [00:01:00] [00:01:34]).

**Process, script to edit** (workshop, ice-cream parlor script: Rex and Jay, a small cup vs a huge
sundae):

1. Half-page script, asset list from it [00:03:09] [00:05:52]. Invented proportions may be adopted
   by design ("80% of that") [00:06:30]. Props must be instantly recognizable (the sprinkle shaker
   was "a mistake in hindsight") [00:04:15].
2. **Beats list** [00:07:26]-[00:08:33]: "beats of information coming to the viewer", not story
   beats or animation poses; "the rule of thumb in filmmaking is one information at a time"; even
   chaos is one bit of information. Split or merge lines as needed. He always does it, nobody taught
   him [00:27:30] [00:32:27].
3. **Floor plan** before the camera [00:09:04]; later with camera positions (#1a, #1b, #2 to #8) and
   the action line [00:29:11]-[00:30:49]. Floor plans stop two people discussing "the shot" from
   opposite sides [00:32:27].
4. **Rig hygiene:** decide the bone subset previs touches and make a "layout" selection set. He
   skipped it for Jay: "a nightmare of clicking the wrong bone half the time" [00:09:36]-[00:10:41].
5. **Depth fog:** a plane with an Array modifier and a semi-transparent viewport color placed in
   depth, to separate backdrop from characters in unrendered previews; readability, not lighting
   [00:11:13]. Charge adds: scale it to adjust depth [00:04:32]. Measured on 5.2.1 Workbench
   [added]: the fog pulls what is behind it toward its own shaded value, so it separates a dim set
   from characters of the same value (backdrop 0.373 to 0.499 display, characters 0.374 unchanged)
   and does almost nothing on a mid-gray backdrop (0.529 to 0.533). `fog_for_shot` keeps it behind
   the subjects and keyed to one shot.
6. **Theater treatment first** (locked-off, Laurel and Hardy staging) to judge the acting without
   camera language [00:06:51]. Camera at eye height, split between two characters' eye heights; low
   or high is a statement; A/B from neutral [00:12:18]. Lens: 35 mm (more backdrop), 60 mm
   (isolation), back to 35 mm because the frame must contain the action's extremes: Jay walking in,
   Rex standing up and towering [00:12:50]-[00:13:23]. Camera rig: 35 mm, F5.6, clip 0.010 to 200
   (frame 00:13:01).
7. **Minimal version:** no faces, no fingers, "the cheapest version possible": 13 s, "already a bit
   dull" [00:13:52]-[00:15:33]. **Detailed version:** a few pose-library faces, extra steps so Jay
   visibly covers the distance, one added beat (the slam), a three-pose anger burst (anticipation,
   overshoot, settle; two lacked impact) [00:16:07]-[00:18:21]: 22 s.
8. **Export single images**, time them in the edit; only shots with an important or complex camera
   move are animated [00:18:21] [00:40:46].
9. **An oversimplified version is always too short** and viewers push to shorten it more; it hides
   logistics (Jay cannot cross that distance in 10 frames). Adding the missing beat troubleshoots
   later departments [00:19:30]-[00:20:37].
10. **Sound pass:** some beats got funnier, the cut got longer (25 s); then cherry-pick which gags
    to milk, because milking all of them is "long and boring" [00:20:37]-[00:23:05].
11. **Cinematic treatment:** "it's a medium not a genre" [00:23:37]. List the ways the scene could
    open, each relaying the same information differently (exterior establishing, interior wide,
    follow the ice cream, a waitress handoff, trucking over the display, Rex folding a menu); he
    chose the handoff, warning it is harder than it sounds [00:24:12]-[00:26:56].
12. **Re-order the beats and group them into shots:** 8 shots, shot 1 carrying 11 beats (slide
    00:29:36: 25 beats in total) [00:27:30]-[00:28:37]. Crude thumbnails, optional [00:31:21]
    [00:47:31].
13. **Shot 1:** plausible height for a camera coming off a handoff; a wider lens made the foreground
    slam bigger but pulled in background information ("in 2D you just draw whatever you want, in 3D
    you get the actual information"); a tilt up after the slam made the cherry the subject and
    implied Rex envied the cherry. Settled flatter, "60 or something" [00:34:07]-[00:36:21].
14. **Cheats:** the sundae is not on the table, the table is resized, Rex floats, Jay hovers in the
    reverse, a taller sundae is swapped in so it towers over Jay's head, characters stretched or
    squished to fix leg cut-offs; the waitress is a crude tray with a Noise modifier placed to hide
    Rex's hovering feet; a focus pull across the handoff [00:36:21]-[00:39:38]. "As long as it's
    being conveyed properly and it's plausible in the shot I'm happy" [00:36:54].
15. **Solve prop problems in story:** Rex tosses the shaker away, in character
    [00:39:38]-[00:40:46].
16. **Edit v1:** kept one angle instead of a side cut because the side view went to silhouette and
    lost menace [00:41:47]. **v2 after feedback:** faster, less emphasis on what he found funny;
    fixed a reveal with two focal points by having Jay sit in front of the sundae
    [00:42:19]-[00:45:10].
17. **Edit comparison** (slide 00:46:01): theater simple 13 s, detailed 22 s, detailed + sound 25 s;
    cinematic v1 47 s, v2 + sound 40 s. "Twice the length, sometimes three times", because every cut
    puts people in a new perspective they must read and puts emphasis on something
    [00:46:23]-[00:46:58].

**Takeaways he lists** [00:47:31]-[00:49:45]: always write the beat list; A/B lenses and angles at
the start because poses built for one lens must be redone after a switch [00:48:05]; fewest bones;
give the idea just enough to live (a cheap smile can make or break a joke) [00:49:12]; sound will
change the edit.

**On screen, not narrated:** one .blend with a scene pair per iteration (`01_blend theatre simple` /
`01_edit theatre simple` up to `05_blend cinematic v2` / `05_edit cinematic v2 +sound`), blend
scenes 1 to 1500 with markers labeling blocks, shots numbered in tens (010, 020, 050, 070, 080),
collections parlor, CH-jay, CH-rex, CA-camera_rig, extra; edit scenes 1920x1080, 24 fps. Playback:
never judge timing on "play every frame" [00:39:05].

**Charge recipe** (cTx-n4OZXYE): floor-plan sketches to understand the space for acting beats and
camera [00:00:00]; a global screen-direction rule (Anar left to right all the way to the battery,
right to left home) [00:00:22]; method chosen per project, "it depends" (Agent 327 mixed media,
Spring concept art plus previs, Sprite Fright drawn animatic, Charge 3D previs without a storyboard
artist) [00:00:22]-[00:00:55] [00:06:27]; mannequins with a Subdivision Surface modifier, fewest
bones [00:01:00]; aspect ratio locked "as soon as possible because it heavily affects the
cinematography" [00:02:11]; camera sensor set, **opaque passepartout** ("a more accurate
representation of the composition"), a few shades of gray [00:02:11]; Ctrl+B binds the camera to a
marker [00:02:44]; auto-key on, key all main things, all keys Constant; an alternative version on
the next frame, toggle for A/B, keep the winner on the first frame of "a full decade"
[00:02:52]-[00:03:24]; "a maximum of 10 frames per shot, this way I force myself to treat every
frame like a drawing and a storyboard", 20 only when warranted [00:03:24]; frames exported with
incremental numbering, never overwritten [00:03:24]; a separate edit file to time images "until it
feels just right" [00:03:59]; next shot = duplicate the camera, bind it 10 frames later, cheat
freely but key everything you touch first [00:03:59]-[00:04:31]; "camera movement can get in the way
of timing the acting beats in the edit": simple dolly-ins are animated on the still in the edit
[00:04:32]; stop when you run out of improvements or the producer drags you away [00:05:11]; layout
rebuilds every shot from scratch in its own file with previs as the guide [00:05:50].

## Dillon Gu, animation director

Source: BCON22 How to improve your cameras (AfWETpPKq-Q). He keeps the animation fixed and changes
only cameras to hit three moods, stating the reason for each choice. Few numbers.

**Stance.** "The audience is actually part of your scene; every time you film something they are
there" [00:09:15]: people read a shot as if standing where the camera is (someone taller than the
camera makes you feel weaker) [00:09:46]. Purpose first: decide what the audience should feel, then
choose lens, height, motion [00:08:10]. "You can fill in the same space, you can get the rule of
thirds, but you could have the wrong focal length and you give a different vibe" [00:07:38]. Eye
level plus a medium lens is neutral, used only when you want nothing in particular [00:16:44]. Work
within the animation you have; framing hides what was never animated [00:13:34] [00:38:08].

**Mood 1, vulnerable (watched, unaware).** Creeper POV: camera somewhere unexpected, a corner
looking up, handheld, so we know something she does not [00:05:29]-[00:06:34]. Wide lens from far
(she is small, the watcher keeps distance), then a quick zoom in, "mimicking a camera operator" and
someone fixing on a target [00:10:17]-[00:11:22]. The next cut to the exterior killed the danger,
"when you're outside you're not in the action anymore": replaced by interior close-ups that hide
information (feet round a corner) [00:12:29]-[00:14:06]. Feet close-up on a longer lens that
flattens it, "more of an informational type of shot" [00:14:38]. Window shot low "because they're
hidden", slight handheld, linear interpolation for a slide [00:15:11]-[00:15:43]. The eye-level
medium city shot was too safe: top view with a slow zoom ("you do want some motion"), a dolly zoom
with linear keys then exaggerated [00:16:44]-[00:22:51]. Review: constant zooming and moving shots
add urgency; the dolly zoom makes her world spin out of her control; the top view "feels like
someone's coming down on top of her" [00:23:34]-[00:25:47]. Compare with the original on equal
terms, sound off [00:24:07]. A clip start of 5.5 cut through a ceiling light, then clipped her head
[00:20:35] [?].

**Mood 2, daily routine.** Off-center and from behind implies isolation and "something's a little
weird today": replace it [00:27:45]. Do not show the face: her reaction does not matter, just
another day [00:28:22]. Keep the painful hand off to the side so it draws no attention [00:29:27].
Centered, even, middle distance: too far feels isolated, too close means "something important is
going to happen" [00:30:32]-[00:31:40]. "Sideways movement, it's the most neutral way you can move
across the screen" [00:33:21]; his opinion: a neutral side angle on a grieving character kills the
tension unless you want distance, as in comedy [00:33:54]. Less camera motion, the audience "doesn't
want to run and jog alongside"; keep shots alive longer [00:34:32]-[00:35:42]. Ignore what used to
be significant: significant things at the frame edge, sound design instead of visual design
[00:35:42]. Over-the-shoulder is intimate; slight handheld when too still [00:36:44]. A jump cut
from sitting to standing signifies elided everyday time [00:38:08]. 180-degree rule: the
over-the-shoulder stays on her right shoulder because the camera was already on her right side; keep
the camera on one side so the audience always knows where she is [00:39:17]-[00:40:21].

**Mood 3, coffee commercial.** In her face, handheld and slightly dizzy for grogginess, the camera
animated with her shoulder drop [00:42:36]-[00:43:46]; blown-out exposure for "I hate mornings"
[00:44:19]; shakier walk for agitation [00:45:23]; rejected a TV insert because "two inanimate
objects in a row" lower the tension [00:45:57]; an extremely low focal length "where it doesn't
really make sense" to show she is not okay [00:46:28]; the product shot is the most stationary shot
of the piece [00:48:45]; cut the calm shots, "people aren't calm in the mornings" [00:49:25].

## Pablo Fournier (Blender Studio) and Falk David (Blender developer)

Source: BCON25 The development story of Story Tools (4flnlr39S1U).

- The historic blocker: "you can edit your sequence but you can't do both at the same time"
  [00:02:21]. The 5.0 answer is minimal: a scene selector for the Sequencer and scene-time sync
  [00:11:48]-[00:12:56]; a separate sequence data-block stays long-term [00:36:21].
- **Setup trio** (Pablo): Sync on in the footer, "otherwise nothing will work" [00:15:49]; pin the
  Edit scene or you export the wrong thing [00:16:24]; auto-key on in shot scenes, off in Edit, "two
  kinds of auto keys" [00:17:30].
- Scene assets live in their own files (duplicates break in the same file) and need the library path
  set [00:19:07] [00:19:39]. Shift+D on a scene strip is a full copy, Alt+D a linked one [00:22:30].
- **Coverage:** one scene, one action, two cameras: split the scene strip, a camera per piece, the
  animation updates in both; drag the cut to move the camera switch, slip to shift the action:
  retime "by doing two shortcuts" instead of moving keys [00:23:03]-[00:25:59]. In this skill: a
  `live` shot plus `cover=True` shots, cut by `animatic` as one soft-split scene strip, retimed with
  `retime_cut` (moves the marker too); verified pixel-identical to the previs frames (test_04).
- **2.5D boards:** Grease Pencil strokes on rigs parented to the characters, drawn over rough poses,
  so strokes follow without animating their position; thumbnails placed on the camera to match
  timing [00:26:33]-[00:32:26]. 3D translation is "the easy part" once the 2D beats are right
  [00:29:54].
- Deleting a scene strip never deletes the scene: "scenes don't have users" [00:39:37]. Compositing
  and NLA are respected inside scene strips [00:42:23]. First playback after a scene switch is slow
  (depsgraph build) [00:49:46]; heavy scenes: edit rendered image sequences.
- Features called future in the talk (strip-range Dope Sheet overlay, a storyboarding app template)
  ship in 5.2.1 (verified).

## Renato Roldan, storyboard artist (The Third Floor, Star Wars)

Source: BCON24 Live Storyboarding Session (CPprHO2R0VI).

- "If it works for the camera, it works" and "the faster the better" [00:16:19]; "nobody's going to
  move the camera and see all your tricks" [00:24:32]; legs placed in front of bodies for parallax
  [00:23:21].
- Boards should carry timing, framing and camera movement even if the editor changes them
  [00:18:41].
- Flat drawing split into Grease Pencil objects at different depths plus a camera move gives
  parallax for little effort [00:12:17]-[00:15:11]; red as the one popping color [00:17:28].
- Sculpt a 2D drawing for secondary motion and loops instead of redrawing [00:20:25]-[00:22:13]
  (tablet only).
- Parent a drawing to a moving 3D plane proxy; plan the proxy's motion from the camera: edge-on
  means the shot will be hard for 2D animation, and the board has already told you
  [00:25:10]-[00:28:38].
- Posable mannequins through the real lens solve extreme wide-lens drawing and give 2D artists a
  matching layout [00:29:06]-[00:31:25].
- First-person narrative boards: remove competing attention near the speaking character [00:33:06].

## Paul Coulthard, Spitfire Storyboards

Source: Grease Pencil 2D/3D hybrid storyboard animatic (H10rQoSg41c, Blender 2.8x era).

- A GP object is "a 2D animation layer of as many drawings as you want contained within a
  three-dimensional object" [00:04:03]: lay out the performance in real space, then shoot it with
  any camera.
- Order: draw the path on the floor (Surface placement, raise the offset to stop clipping)
  [00:15:58] [00:08:33]; key the object along it (keys about 40 frames apart in the demo)
  [00:14:43]; rough poses on a new layer with onion skin [00:18:09]; commit to a camera, only then
  refine [00:19:47]-[00:20:21]. Default drawing plane: Origin plus View [00:05:13] [00:43:12].
- Constant interpolation for foot contact, linear only for flying or sliding [00:32:23]-[00:33:28].
- A 3D proxy man carries hard paths (terrain, flight); parent the drawing with Keep Transform;
  redraw when the proxy's rotation makes the flat art look wrong [00:34:10]-[00:44:22]. The proxy
  also survives hand-off to departments using other software [00:36:04].
- Camera: Lock Camera to View to fly it; 24 mm in the example; low mm = wide, distortion close up;
  high mm compresses and intensifies two characters; wide for vistas [00:25:26]-[00:27:05]. Track To
  on the proxy (-Z, up Y) keeps it centered while the path is edited [00:41:44].
- Very high angles read as cardboard cutouts but the spatial information stays valid for layout
  [00:31:25]. Cuts by markers bound to cameras [00:44:46].

## BouncyBrain, story artist (billed as DreamWorks)

Source: Storyboarding in Blender masterclass (Xx68qcqMXS4), mostly wordless time-lapse.

- "Drawing on glass": the hero drawing and the camera are both children of a circle empty over the
  subject; orbit by rotating the circle, dolly by moving the camera along its local Z (the drawing
  changes size); world-space effects (an explosion) stay in the world [00:09:45]-[00:12:01].
- Boards at 6 fps, retimed in an editor [00:08:03]; shots as duplicated scenes [00:08:37]. His F1 to
  F4 mode keymap is not worth copying (F2 and F3 are defaults people rely on) [added].

## Disagreements and deciding conditions

| Choice                         | Option A                                                      | Option B                                                                                                      | Decides                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Animate the camera in previs   | no: stills, push-ins faked in the edit (Charge [00:04:32])    | yes when the move carries story: handoffs, focus pulls (Hjalti [00:18:54]); zooms as mood (Dillon [00:10:49]) | is the move the meaning or incidental?                                                                                                                                   |
| Lens for a two-character scene | 35 mm to contain the extremes, locked off (Hjalti [00:13:23]) | 60 mm to isolate and compress (Hjalti [00:35:46]; Spitfire [00:27:05])                                        | theater framing vs cinematic isolation; in 3D a wide lens imports background you must manage                                                                             |
| Wide lens meaning              | drama, vistas, big foreground (Spitfire, Hjalti)              | distance and stalking from far; "not okay" when extreme and close (Dillon)                                    | camera distance                                                                                                                                                          |
| Frames per shot                | 1 still, 10-frame blocks (Charge)                             | a few more beats per shot to test logistics (Hjalti detailed [00:16:07])                                      | idea vetting vs checking actions physically fit                                                                                                                          |
| Method                         | 3D previs, semi-storyboard (Charge)                           | drawn boards into an animatic; hybrids (Renato, Spitfire, Pablo)                                              | team skills, budget, deadline, final style; an agent without a tablet defaults to 3D                                                                                     |
| Camera switching               | markers bound to cameras (Charge, Spitfire, Hjalti)           | scene strips split per camera (Pablo)                                                                         | stills and 10-frame blocks: markers; one continuous action seen from several angles, retimed in the edit: a coverage run (`cover=True`), which keeps the markers in step |
| Where the edit lives           | separate edit file (Charge)                                   | scene pairs in one file (Hjalti on screen) or an Edit scene with sync (5.0+)                                  | Blender version, scene weight, hand-off                                                                                                                                  |
| Hero drawing placement         | glass on the camera rig pivot (BouncyBrain)                   | world space on proxies (Spitfire, Renato)                                                                     | camera follows one character and never sees it side-on vs action seen from several angles                                                                                |
| Neutral vs statement camera    | neutral start, A/B (Hjalti)                                   | statements when the mood is chosen (Dillon)                                                                   | is the mood decided? Neutral side angles on grief kill tension (Dillon)                                                                                                  |
| Lens across a cut              | change per shot (Hjalti, Dillon)                              | no lens jump on a cut (render-to-real guide)                                                                  | human edit vs a render-to-real model's guide video                                                                                                                       |

## Additions in this skill [added]

- Size table (visible height as a multiple of subject height), distance = visible height x lens /
  sensor height, headroom band, eye tolerance 0.15 m, 70-degree edge-on threshold, 5 % screen-width
  threshold for screen direction: standard framing grammar and practical thresholds, calibrated on
  the S6 contact sheet, not from the talks.
- Runtime budget of about 1.6 to 1.9 s per beat: derived from Hjalti's slide (25 beats, 8 shots, 40
  s and 47 s). S6 landed at 1.63 s per beat.
- Ray-cast occlusion gate: added after the S6 contact sheet showed a door and a counter hiding the
  hero that no numeric check had flagged.
- POV cameras just off the line on the camera side, cheated forward and up past foreground
  furniture: S6 finding.
- Color: grays plus one pop color follows Charge and Renato; the saturated identity palette of
  render-to-real guides is for video models, not for directors.
- Cost gates in `audit` (from the S6 blind grade, which flagged an answer that animated every shot
  continuously, lit for mood and used full Rigify rigs): camera moving inside a still shot, keys
  between block starts outside live shots, a non-Workbench engine are problems; lights are a
  warning. Grounded in Charge [cTx-n4OZXYE 00:04:32] (camera moves get in the way of timing) and
  Hjalti [XZtJ64g5VQQ 00:18:54] (export single images) and [00:48:40] (the cheapest version).
- Rigify is off under `--factory-startup` (its metarig operator "could not be found"):
  `ensure_rigify` before any Rigify proxy. `rigify_proxy` (Basic Human, bone-parented boxes,
  `layout` bones torso, chest, head, IK hands and feet) is for briefs that ask for Rigify; Hjalti
  and Charge use the simplest rig that poses.
- Passepartout: `build_shots` and `passepartout()` set it opaque, `audit` flags any shot camera
  without it (Charge [00:02:11]); it is a viewport display setting, so it matters in a live session,
  not in headless renders.
