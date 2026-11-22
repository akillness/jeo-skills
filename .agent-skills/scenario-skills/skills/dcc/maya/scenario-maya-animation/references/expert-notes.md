# Expert notes: animation (by expert, with sources)

The depth behind SKILL.md. Timestamps are `[hh:mm:ss]` in the video named in `sources.md`; frame
references `f_00582` are contact-sheet frames of that video. Items marked [added] are this skill's
own method or physics, not the expert's words. Captions of most videos are auto-generated; where
they were garbled the note says so.

## Sir Wade Neistadt (ex-DreamWorks production trainer)

**Workflows** (GMTet6nd_iM, 2021)

- No single workflow; change it per shot and hide it: "the workflow that you use should not be
  obvious to someone watching your shot" [00:07:02] [00:32:21].
- Seven workflows: pose to pose (thumbnail first, "it's faster to draw it than it is to pose it"
  [00:02:42]); straight ahead, usually in spline [00:08:27]; layered, one component finished before
  the next (ball: translate Y until perfect, then X) [00:11:36]; 2D sketch blocking [00:14:21];
  reference blocking, poses every 2, 4, 5 or 7 frames [00:19:09]; extremes per body part and
  channel, keys scattered but organic [00:25:35] [00:27:45]; key categories in layered passes
  [00:28:37].
- Blocking is complete when all five key categories exist: main keys, anticipations, overlap and
  follow-through (overshoots), breakdowns, holds [00:29:08] [00:31:48]. Holds are a category: the
  character must "get somewhere and stay there, act in the pose, give the audience time to breathe"
  [00:31:14].
- Even spacing of key poses is always wrong: 1, 10, 20 is floaty [00:05:24]. Keying the whole body
  on the same frames is the pose-to-pose tell [00:07:02].
- Reference: key the landmarks (contacts, takeoff, apex, landing, blinks, eye darts) to capture
  rhythm, then push [00:23:38]. Rotomated too closely, his own Hiccup shot "looked like mocap data"
  [00:21:30]. Style decides how far: stylized features push, Call of Duty pushes only for clarity,
  VFX stays close [00:20:25] [00:20:57].
- Rigs arrive neutral and symmetric: never act from the default pose; decide the asymmetric shape
  first [00:16:02] [00:17:07].
- Anticipation is optional in games: a jump may start on the button frame [00:30:10].

**Dialogue** (5cIxEZwZmS4, 2021)

- Break the line down on paper: phrases, emotional cues, then every sound with a hard rule: M closes
  at least one frame [00:08:49]; B and P are built-up pressure released [00:09:21]; O is a circle; J
  and CH compress with air [00:09:53].
- Components in order: jaw, corners in/out, lip shape, tongue [00:13:42]. The jaw alone ("muppet
  version") must read the rhythm [00:21:19]; it can go past neutral into compression on closures
  [00:20:16]; group sounds, do not flap on every syllable [00:21:52]; jaw reversals are flags to
  check [00:22:25].
- The blanket "two frames early" is not detailed enough: a sound made when the shape forms (M)
  differs from one made when it breaks (B, P, K, L) [00:15:30] [00:17:06]; B/P lips closed before
  the sound frame, opening on it [00:19:14].
- Corners follow the neighboring sounds more than the current one [00:23:31]; no width changes
  inside a word [00:30:34]. Never record slow mirror reference [00:25:11].
- Tongue: L raised early, released with a big one-frame spacing; "the tongue is a very very fast
  muscle, it does not do a lot of easing"; R floats mid-mouth [00:37:24] [00:39:33]. Skipping the
  tongue makes "half the words not make any sense" [00:36:18].
- Four polish steps: breath, connectivity and fleshiness (lips fight the jaw, the M peel), graphic
  appealing shapes, mouth flow across the face [00:41:27] to [00:45:40].

**Graph Editor** (TMSpauVphNs, 2022, Maya 2020.4 on screen)

- Set Key reshapes the curve around a new key; enable Set Key > Set key preserves curve shape, or
  insert keys [00:01:45] [00:02:18]. A keying command that changes neighboring curves is a workflow
  bug, not something to live with. [added] The agent inserts (`A.insert_key`) and proves it with
  `A.curve_diff` on sampled snapshots before and after: existing keys and the curve outside the new
  key's two segments unchanged (the body digest's "Set key damage" gate).
- Stacked view is "an essential tool", especially for cycles; absolute view squashes everything
  under one traveling control [00:02:48] [00:03:55]. [added] `curve_lanes_png` is the agent's
  stacked view.
- Weighted tangents: shape by weight, never re-point handles: collapse the contact weights, lengthen
  the apex weight for hang time; "you change the weight, you never ever need to change the
  direction" [00:06:57] [00:07:29] [00:08:00]. Ball in f_00582: contacts near frames 1, 24, 47, apex
  frame 12.
- [added math] A gravity parabola between contact and apex is a cubic Bezier with one-third handles,
  contact slope 2H/T and a flat apex; Wade's recipe adds hang beyond gravity. Stylized or light: use
  it. Heavy or realistic: no.
- Palette (f_00933): translates red, green, blue; rotates orange, yellow, cyan; scales pinks and
  violets; select curves by channel name across all controls so no curve is forgotten [00:11:15]
  [00:15:37].

**Heavy weight** (ZYKAMCZq2UI, 2024; captions read like a machine-translation round trip)

- Two numbers first: object weight and character strength [00:00:00] [00:09:03].
- Resistance before release, even for gods: "It's impossible to fully reveal a character's strength
  until you show what they're facing" [00:01:49]; a boulder lifted without effort reads as styrofoam
  [00:06:37].
- Weight is "this break in the flow, this delay in motion", acceleration from rest [00:03:05];
  strength is fewer frames from resistance to full extension [00:05:00] [00:06:20].
- Throws: the object lags the hand; "if it moves with your hand the whole time, it's not that heavy"
  [00:05:48]. Punches: lean in, then a short A to B [00:08:04].
- Force from the core outward (back, shoulders, arms), never all on one key [00:07:39] [00:09:34].
  Scale and interpenetration can sell compression [00:08:32]; locked animation can be helped by
  sound, shake, dust [00:07:09].

**animBot catalog** (G49wexNmQ-Q, 2020)

- Learn every operation in bare Maya first [00:01:38]. Native S drops auto keys into stepped
  blocking; smart key inserts and keeps the range's tangent type [00:06:22] [00:07:57].
- Tween by blending toward a neighbor, not to the 50% midpoint [00:12:31] [00:14:10]; Euler-filter
  while tweening [00:15:10].
- Share keys so pole vectors and floating controls do not interpolate across the shot [00:21:41]
  [00:23:19]. After scaling a range keys sit on sub-frames; Maya's snap will not resolve two keys
  competing for one frame [00:29:34] [00:30:07].
- Suspend viewport refresh while editing heavy rigs [00:33:42]; checkpoints for recovery [00:20:01].

## Ere Santos (animation supervisor, Walt Disney Animation Studios; ex-Pixar, Sony) (S1MRs3XJVPI, 2024)

- "Lip sync isn't about animating words, it's about animating sounds" [00:03:55]. Fast speech
  collapses words [00:44:31].
- Lead by place of articulation: bilabials (M, B, P) on the frame, alveolars (D, T, L, S, SH) about
  one frame early, sounds further back earlier; every open shape exists before its sound [00:06:08]
  [00:07:47]. The back-of-mouth number is implied (2 frames in his quiz options), not stated
  [00:06:41].
- Passes: body first [00:30:07], mask (eyes, brows) before the mouth [00:24:13]; phrase pass
  (subtext, action verb, one shape per action) [00:09:26]; muppet pass (jaw rotate X only, tentpoles
  biggest; three tentpoles in his five-second line) [00:13:20] [00:34:28]; big five (jaw, corners,
  top and bottom lip: "90% of your lip sync") [00:15:31]; polish with the tongue first [00:52:16].
- Corners: translate X in/out, Y up/down, never Z ("a disaster") [00:48:24]. Runs of M, B, P: jaw
  tight, bottom lip rises; visible gums need a reason [00:46:44] [00:47:17].
- Keep keys stacked until polish; early offsets scatter keys and make notes expensive [00:48:59].
- Connection by curve copy: corners onto nostrils one frame later, scaled down and dampened
  selectively; corners' TY onto brows, cheeks onto lower lids [00:37:40] [00:55:01].
- Upper teeth stay anchored to the skull; hide a teeth move inside a big head move [00:36:03]. The
  tongue must not flash on one frame [00:52:49].
- "Would I draw it this way?": four-sided, asymmetric mouths, no football [00:39:18] [00:40:25].
- Pose libraries are reference; pose complex mouths by hand [00:28:25]. Animation layers helped a
  chewing-while-talking gorilla: chew on one layer, lips on another, bake before polish [00:26:13].

## Arslan Elver (senior animation supervisor, Framestore; Rocky in Project Hail Mary) (jzuxAmadcm8, 2026)

- Polish is triage: list what could improve, "put my money into the most important ones", one
  section at a time on a short timeline [00:03:49] [00:04:22].
- COG first; everything is a bouncing ball, chest and hips two balls [00:02:44] [00:07:40]. Ball
  proxy: a sphere parent-constrained to the COG without offset, character hidden [00:06:34]. When
  stuck, hide all but the torso [00:37:57].
- Physical shots in spline from the start, his personal way [00:03:18]; delete keys that fight an
  arc even in polish [00:09:55].
- Arcs and momentum in camera space: "it might look like a perfect arc but in the camera space it
  might not work well" [00:08:17]; a character matching the camera's speed reads as stopping
  [00:06:01] [00:35:45]; motion trails are "a little bit like a fake thing" [00:36:50].
- Falls spaced frame by frame, never even [00:09:55]. Peel-off, "a big deal for me": on the frame
  after a takeoff the tip of the toe points to where it took off, even with the leg stretched a lot;
  it gives "a great push feeling" and students overlook it [00:10:32] [00:11:04] [00:11:38]. [added]
  Vector check: `A.peel_angle(ball, toe, takeoff_point)` on the first airborne frame (gate
  `peel_off`, 30 degrees). Leg silhouettes separate in the air [00:12:46].
- Impact: a jump that "doesn't have any impact" reads linear; push the squash moments, keep the body
  down a touch and give a bigger hold [00:13:19] [00:13:54] [00:14:29]. [added] Gate `impact_hold`:
  frames around the deepest compression moving under 10% of the incoming speed, warn under 3; the
  agent lengthens the hold and compares playblasts, since he gives no frame count.
- Retime in the Dope Sheet: key everything at 134, tighten the 134 to 152 section by two frames
  [00:16:44] [00:17:18].
- Eyes: locked mode, linear tangents, "whenever I see something on spline that's wrong", holds then
  2-frame darts [00:19:29] [00:20:02]. Blinks close 2 / open 4 or 3 / 5, small then big spacing, a
  cushion frame, one more frame for big eyes [00:20:02] to [00:21:44]. Brows lead lids by a frame or
  two, never five [00:22:16]; inner brows never drift for 15 frames [00:30:43].
- Asymmetry along the look direction [00:23:21]; hide an accidental camera look with a blink a frame
  earlier [00:25:37]; head turns tracked on the nose frame by frame [00:26:10].
- Render with motion blur before final polish: blur softens moves that look too fast; adjacent keys
  with a big jump blur badly, fix with a half-frame key [00:27:19] [00:39:35].
- Snappy without popping: 3 frames on an arc plus an overshoot, never a one-frame jump; a
  micro-anticipation of the anticipation [01:02:04] [01:02:38].
- Weight: "if I do more up and down it's more heavy. No, it's more balloon" (about bigger bounces,
  not apex hang); a sudden caught stop plus residual jiggle; heavy takes longer to speed up and slow
  down [00:58:13] [00:59:53].
- Live action: squash from the pose silhouette, not deformation [00:45:32]; "cannot stop
  immediately" [00:54:54]; Rocky had no ease but a sharp bounce-back [00:55:25]; continuity across
  cuts need not be perfect [00:56:30]. Interpenetration can break CFX downstream [00:54:19].
- Layers: never in blocking or polish; only a late drastic note or an additive tremble, then bake
  (baking puts every control on ones) [00:48:48] [00:50:24]. People who work with mocap "don't
  hesitate to just delete chunks" of keys [00:48:14].
- Silhouette: press 7 in a scene without lights for black shapes [01:03:43].

## Jeremy Lazare (animator, Pixar) (m8YPvVtfLhw, 2024; 11 Second Club critique)

- Review order: acting, then mechanics, then detail; replay each shot [00:00:37].
- "Wherever the most movement is happening, that's where you're inviting the audience to look"; "if
  you can get away with nothing, do that" [00:05:07] [00:03:27].
- Double beat to progression: get there, overshoot, settle, then go further in the same direction;
  stay in the fist and tighten it [00:08:28] [00:10:48] [00:18:25]. Straight jabs read aggressive,
  circles soft [00:10:14].
- Lead with what you want read (hand before body) [00:14:09]; arrive a frame or two early so the
  pose registers [00:17:17]. "The stuff in between is just noise" [00:29:54]; hold the payoff at
  least 6 frames longer [00:34:25].
- Lip sync late at speed: shift everything 1 to 2 frames earlier; punch the opens (near full on the
  first frame instead of three soft ones) [00:19:33] [00:21:21].
- Mechanics: hips land and level out with a sharper drop [00:37:20]; a planted hand must not slide,
  splay the fingers on impact [00:38:33]; the neck continues the line of action [00:40:55];
  secondary objects land 1 to 2 frames later [00:32:07]; restage occluded actions [00:43:58].

## Harvey Newman (AAA animation and game director)

- **Dailies** (7r_Czt3-SKE, 2026): four buckets, Intent, Body mechanics, Performance, In-game
  integration [00:05:23] to [00:07:20]; "they can look beautiful on a 2D plane, but until I don't
  see it in game..." [00:07:20]. Lingo: "the anticipation reads thin" = bolder [00:09:43]; "the eyes
  are doing too much" = dial down [00:10:16]; "one beat instead of two" = hold the sub-poses
  slightly [00:10:49]. Bottle the notes where others can reuse them [00:11:50].
- **Idea to blocking** (QiOGugW8Ips, 2020): a 5-second clip is the middle of a shot, not a shot
  [00:03:46]; draw-overs every 2 to 3 frames [00:10:00]; fast parts keyed on ones, slow parts 2 to 4
  keys apart [00:15:27] [00:16:30]; pull elements out of stepped (the ball first) to judge arcs
  [00:14:39].
- **Blocking to spline** (TIBzcsOt2FU, 2021): "Maya is the worst in-betweener in the world"
  [00:04:53]; the spline test on a range (mush means back to stepped) [00:07:00]; "spline should be
  just about making your animation better" [00:07:52]; first pass hips first, translates before
  rotates, translate Z first [00:10:01]; holds with a slight slope [00:10:34]; axis-facing camera to
  see snaps [00:11:06]; a hard landing with broken tangents, "you feel it but you don't really see
  it" [00:13:56]; correlated spine controls edited together before offsets [00:16:58].
- **Layers** (5RmqWjfU80s, 2020): all real animation on the base layer [00:02:35]; key before
  moving, pre-key the frames to change, a protective key after the last change ("don't mess with
  anything after this") [00:03:08] [00:05:07]; never clean on a layer ("false positives")
  [00:07:24]; merge with Smart Bake or the result "looks like mocap" [00:08:23]; time-box 30 to 40
  minutes [00:10:29].
- **Mocap vs hand key** (7gZt3RCmgfM, 2020): preserve momentum and tempo, "that's what the studio is
  paying for" [00:07:31]; the cascade makes it "not hand key and not mocap" [00:08:03]; typical
  defects: feet through the floor, broken wrists, flat hands [00:05:56]; quick hand-key blocking
  half a day with 4 to 6 keys, polish 2 to 3 days [00:10:25] [00:11:31].
- **Re-edit mocap** (JzwfomndbMA, 2021): big notes on a layer with sparse keys (8 or 9 on an arm)
  [00:04:09]; merge, Euler filter first [00:08:31]; delete keys down to extremes, then favor, hold,
  overshoot [00:10:07] [00:11:11]; some wobbles are the performance [00:09:03].
- **Plug-ins** (t-YsIXaPvEg, 2021): about five tools; 50/50 tweens teach even timing [00:05:07];
  hands in IK "at all times pretty much", no IK/FK or parent switching [00:07:25]; props tracked to
  the wrist with an offset over the held range only [00:10:45] [00:11:50].
- **Ghosts and trails** (Ajx1p5cAzXU, aNYr9nc9iM4, 2021): ghosts show spacing and rotation a trail
  cannot [00:10:17]; ghost the controller, merge layers first [00:09:12] [00:16:03]; trail settings:
  Time Slider range, increment 1 for mocap or the blocking interval, 10 frames pre and post, Always
  Draw, thickness 2, key size 3 [00:03:39] to [00:05:14]; edit mocap trails on a layer [00:05:45].
- **Gameplay** (-vUpqWi8b50, 2020): several clips per file, one bookmark each [00:06:12]; judge in
  cached playback at real rate [00:02:14].
- **Metrics** (w4F6vbmcxZ8, 2024): metrics before motion, player first, round numbers in a shared
  document [00:06:59] [00:11:09]; walk 1 then 2 m/s, run 4 then 6, sprint 12 then about 15 for a
  stylized game [00:04:45] to [00:06:29]; variable jumps are takeoff, a stretchable loop and a
  landing with engineering parabolas [00:14:51].
- **Sequencer 2027** (SGjxnw6c-IQ, 2026): shots from the Time Slider or the options dialog with
  name, range and camera [00:06:20]; lock every camera [00:08:33]; Time Scale gives slow motion
  "without editing your animations" [00:17:24]; Ripple Edit once the structure is settled
  [00:20:20].

## Alessandro Camporota (lead animator, Riot Games; ex-Sony Imageworks, Ubisoft)

- **Walk** (ynXadXE9UjU, 2019): legs and the four poses every 3 frames (contact, down, pass, up) on
  a 24-frame cycle [00:05:15]; loop with Cycle infinity before any polish [00:04:08]; first error:
  too much bounce, scale the curve down [00:03:35] [00:12:05]; side shift peaks between pass and up
  [00:05:29]; the swinging foot arcs out [00:07:26]; heel to flat "doesn't happen in three frames,
  basically almost in one frame", with toe drag and compression on the push-off scaled by style
  [00:09:26] [00:09:59] (the body digest's gate allows 1 or 2; [added] applied to every touch-down,
  gate `heel_to_flat`); supporting-side hip goes up, the reverse is the student mistake [00:10:45]
  [00:11:27]; spine counters the pelvis on Y and Z [00:15:22] [00:16:31]; breakdowns favor the next
  key [00:20:13]; arm offsets 1 and 2 frames, head 1 [00:22:33] [00:32:02]; head in neck space
  [00:30:07]; knee pops show on a motion trail of the knee [00:14:42].
- **Jump** (FA7fPB7qUhE, 2019): two boxes first, because posing a big action first "may take weeks"
  if the timing is wrong [00:00:38]; anticipation eases in slowly and snaps out [00:01:18]; first
  passes overdo it: on his own proxy "the anticipation is a bit too much", reduced in the Graph
  Editor [00:03:11] [00:03:46] (agent: `A.scale_curve(..., time=crouch)` about the rest value); the
  last air key sits slightly higher because the legs reach [00:02:32]; land, a no-overshoot key,
  then an overshoot [00:02:32]; cartoony means fewer frames on takeoff and landing [00:04:21];
  rotation 1 to 2 frames behind translation [00:04:58]; lights-off silhouette panel always on,
  fingers included [00:06:07]; "always make sure you animate the roll here on the feet", those
  details "help the compression of the weight" [00:07:55] [00:08:28]; in a big jump the spine keeps
  dragging on the way down, "only the arms going down" (frame: bent over, arms hanging) [00:08:28];
  no flat shoulder or hip lines [00:14:13]; in-between pelvis, spine and legs first, directly in
  spline, pops later [00:15:32] [00:16:59]; the landing is used as an overshoot, spine pushed in the
  direction of travel [00:18:17].

## Autodesk Maya 2027 Help and Epic (documentation)

- Tangents (animation__graph-editor-tangents-curves): Plateau keeps extremes on keys; Clamped fixes
  pelvis and foot slip in cycles; Stepped Next jumps early; Quaternion curves with clamped tangents
  interpolate stepped; filters (Euler, Key Reducer, Smooth Butterworth keeps min and max, Gaussian,
  Peak Removal, Resample, Simplify) work on time curves only; Enable Stepped Preview on the Time
  Slider.
- Layers (animation__animation-layers): Additive sums, Override replaces, Passthrough makes weight
  an opacity; booleans and enums always override; mute an empty Override layer before keying it;
  muted layers are locked by default; wrist stabilized with an Override layer and IK Blend 0, 0, 1
  at frames 0, 20, 27 on linear keys; merges follow stack order.
- Cached Playback (animation__cached-playback): on by default, needs the Evaluation Manager; yellow
  means Safe Mode; motion blur, Trax, classic dynamics disable it; playblast remains the review
  medium.
- Ghosting and trails (animation__ghosting-motion-trails): skinned meshes need Cached Playback; no
  ghosts of simulation; trails editable only on keyframes; do not mix editor ghosts with layer or
  Time Editor ghosts.
- HumanIK (animation__humanik-retargeting): bake from the HumanIK window; a Control-rig layer
  overrides the bake; Match Source gives a large character tiny steps; Knee/Elbow Max Extension 50
  damps snapping; Mass Center Compensation 80; custom rig mapping (IK effectors T and R, FK R only,
  up vectors translation only).
- Time Editor (animation__time-editor): clips, transitions, relocators on similar frames; never with
  animation layers; remap needs identical skeletons and bone lengths.
- Sequencer and playblast (animation__sequencer-playblast-2027): playblast defaults to the active
  view, the Time Slider range, scale 0.5; `-frame` for single frames; `-offScreen`; a playblast
  faster than the viewport means the viewport was not real time.
- Root motion (animation__unreal-root-motion, UE 5.8): off until enabled per asset; Z root motion
  ignored while Walking or Falling; extraction runs on the Game Thread.

## Disagreements and the deciding condition

| Choice                | Option A                                                                             | Option B                                                                                                                                                        | Deciding condition                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Stepped or spline     | stepped until every key category is in (Wade [00:29:08]); spline test first (Newman) | spline from the start on physical shots (Elver [00:03:18]); core in spline after the proxy (Camporota [00:15:32])                                               | acting and unproven timing: stepped; physics with proven spacing: spline early                                                   |
| Proxy or poses first  | two boxes (Camporota [00:00:38])                                                     | poses first, thumbnails (Wade)                                                                                                                                  | big, fast or camera-driven moves: proxy; acting beats: poses                                                                     |
| Offsets               | early inside a cycle (Camporota [00:22:33])                                          | stacked until polish (Santos [00:48:59])                                                                                                                        | cycles wrap offsets; shots that will get notes offset late                                                                       |
| Layers                | useful for separable additive motion (Santos [00:26:13])                             | never in blocking or polish (Elver [00:49:20]); one idea at a time (Newman)                                                                                     | late global note or additive tremble: layer then bake; anything else: base layer                                                 |
| Lip lead              | global 1 to 2 frames earlier (Lazare)                                                | per sound, by place of articulation (Santos, Wade)                                                                                                              | per sound first; global only if every shape is late                                                                              |
| Hang at the apex      | weighted apex (Wade [00:07:29])                                                      | gravity-true parabola [added physics]; Wade's heavy video: heavy is slower overall [00:03:05]. Elver's "balloon" line is about more bounce, not hang [00:59:53] | light or cartoony: hang; heavy or realistic: gravity-true                                                                        |
| Anticipation size     | first passes overdo it, dial it down (Camporota [00:03:46])                          | "the anticipation reads thin" means bolder (Newman 7r_Czt3-SKE [00:09:43])                                                                                      | the read on the proxy or stepped playblast; the animator's own first pass tends to err big, a director's thin note asks for more |
| Reference closeness   | push, avoid mocap look (Wade [00:21:30])                                             | work close first to learn (Elver [00:12:46])                                                                                                                    | style and destination; learning shots close                                                                                      |
| Squash and stops      | cartoony can "go bonkers", dead stops in full CG                                     | live action: pose squash, no dead stop, sharp bounce-back (Rocky)                                                                                               | integration with a plate and the director's taste                                                                                |
| Anticipation in games | on the button frame (Wade [00:30:10])                                                | "reads thin" is a standard note (Newman)                                                                                                                        | gameplay responsiveness vs readability; decided in engine                                                                        |
| Ghosts or trails      | ghosts for spacing and rotation (Newman 2021-08)                                     | trails fast enough to replace plug-ins, best for path edits on a layer (Newman 2021-12)                                                                         | judge spacing with ghosts, reshape a path with a trail; the agent measures both                                                  |
| Retarget route        | MotionBuilder or Red9 (Newman [00:04:17])                                            | HumanIK custom rig in Maya (doc)                                                                                                                                | tool availability; identical skeletons can use Time Editor remap                                                                 |
| Mocap edits           | Additive offsets on a layer (Newman)                                                 | Override plus IK to pin a contact (doc)                                                                                                                         | timing and offsets: Additive; absolute plants: Override                                                                          |

## Body-mechanics rules for any jump, hop, landing or weight shift

The same rules hold beyond the box jump; the gates read them wherever the plan names the window
(`crouch` may be a list, `impacts` lists every landing, every touch-down and lift-off of every foot
is checked). The generalization is [added]; each rule's source is the expert's.

| Rule                                                              | Expert                                                         | Gate (`evaluate_gates`)                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Foot roll animated in every crouch or load                        | Camporota FA7fPB7qUhE [00:07:55] [00:08:28]                    | `foot_roll`: rig attribute range (plan `foot_roll`) or heel-to-toe pitch range above 1 degree [added]         |
| In a big drop the spine drags behind the hips; only the arms drop | Camporota [00:08:28]                                           | `spine_drag`: chest (plan `spine`, default `chain[0]`) lags the COG by 1+ frame in the crouch [added measure] |
| First passes overdo the anticipation                              | Camporota [00:03:11] [00:03:46]                                | none: judged on the playblast; `scale_curve(time=)` is the dial                                               |
| Toe points back to the takeoff spot on the first airborne frame   | Elver jzuxAmadcm8 [00:10:32] [00:11:04]                        | `peel_off_<side>`: `peel_angle` at most 30 degrees [added]                                                    |
| Feet flat within 1 to 2 frames of touch-down                      | Camporota ynXadXE9UjU [00:09:26]; body digest gate             | `heel_to_flat_<side>`: touch-down to heel and ball planted, at most 2 frames                                  |
| Push the squash, a bigger hold after the impact                   | Elver [00:13:54] [00:14:29]                                    | `impact_hold`: 3+ near-still frames at the deepest compression [added]                                        |
| Insert keys; neighboring curves must not move                     | Wade TMSpauVphNs [00:01:45] [00:02:18]; G49wexNmQ-Q [00:06:22] | `curve_diff(before, after, ignore)` after any scripted keying                                                 |
