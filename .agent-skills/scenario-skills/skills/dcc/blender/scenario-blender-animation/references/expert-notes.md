# Expert notes: animation (by expert, with sources)

Video ids and timestamps point to `references/sources.md`. Claims are the expert's unless marked
[added] (my addition, measured or reasoned) or [verified] (checked in Blender 5.2.1). Most tutorials
were recorded on Blender 2.93 to 4.1: UI details are translated to 5.2 at the end.

## Rik Schutte (Blender Studio animator; Sprite Fright, Wing It director; earlier Smallfoot, Spider-Verse)

Sources: jLkc4EgHWj8 (BCON22 cube show), NEZVF93fKsM (BCON23 facial), zhktftWbumE (Snow acting
recap), hnHemwjznPc (acting live pt.3, splining), sRYVR92FqSw (acting live pt.4, lip sync).

**Workflow**

- Explore the rig first; a new production starts with a week of rig learning plus pose libraries and
  a character bible of do's and don'ts (jLkc4EgHWj8 [00:47:02]). Plan constraints (hand resting on
  the bar, glass pick-up) before blocking or you fight your setup later (zhktftWbumE [00:02:34]).
- Blocking 1: the main beats with the torso bone only, "like playing with a Lego puppet", to test
  rhythm and energy before posing anything else; do not push that base bone too far (zhktftWbumE
  [00:03:42]-[00:04:48]).
- Blocking 2: decide what leads each beat (brows here, head there) and put it in the blocking as
  notes to self (zhktftWbumE [00:05:43]). Start the shot in the middle of an action, not waiting for
  the line [00:05:21].
- Key everything (Location, Rotation, Scale, Custom Properties) on every key so holds lock to a
  frame (jLkc4EgHWj8 [00:26:47]; hnHemwjznPc [01:15:50]); 398 keys on frame 1 of the Snow rig
  (hnHemwjznPc [00:18:29]). Exception: adding a one-channel overlap to a splined curve, where keying
  everything damages the other curves [02:23:37].
- "Animate drunk, edit sober" (jLkc4EgHWj8 [00:27:21]). Show rough work early [00:41:12]. Blend to
  Neighbor is his tween machine, "multiple times per minute" [00:28:34]; restricted to one channel
  and one axis it is "breakdowner 2.0" (hnHemwjznPc [00:29:06], [02:43:31]).

**Blocking to spline** (hnHemwjznPc [00:14:12]-[00:23:36]; zhktftWbumE [00:09:42]-[00:18:58])

- Select all and switch to Bezier is the classic mistake: "floaty spaghetti", hard to recover. "The
  preparation of going into spline is the most important thing."
- Separate face and body: hide face and finger controls, spline only the body; the face stays
  stepped because lip sync redoes it. Hide unused controls too.
- Pillars: for every pose that should hold, key all controls again at the end of the hold. Big
  deliberate moves are left to interpolation; snappy moves hold then move in about 3 frames (held to
  44, arrives at 47). "Instead of going from here to here which creates a slow floaty movement, you
  want to hold the key and then it's moving faster" [00:20:44]. Rule of thumb 2 to 3 frames, "a bit
  arbitrary" (sRYVR92FqSw [01:26:43]).
- A sub-part (head, hand) can have its own holds; put a head key a couple of frames before its next
  pose to avoid float [00:21:18].
- After splining: fix wobbly arcs and IK/FK space-switch pops per move [00:23:36].
- Verified in 5.2.1 [verified]: with AUTO_CLAMPED handles a pillar gives an exactly flat hold and
  the move completes in the chosen frames; without it the value drifts from the start of the
  interval.
- [added, measured] A contact inside continuous motion (landing of a jump) is not a hold; pillaring
  it brakes the body to almost zero speed at impact.

**Contacts, pivots, texture** (hnHemwjznPc)

- Contacts slide, they do not glue and do not lift: a leaning elbow slides a little with the body; a
  lifted elbow "is not a resting pose" [00:28:00]-[00:30:12]. If it slides in too early, add a
  not-fully-arrived breakdown [00:31:54].
- Weight shift raises the loaded shoulder and hides limb stretch [00:46:41].
- Pin with a Copy Location (not Copy Transforms) to a helper bone at influence 0.5 for a little
  give, key influence to 0 where contact breaks, when manual keys fight the IK pole and stretch
  [01:19:52]-[01:26:06]. Toggle it off to see the unconstrained pose [01:34:48].
- Rotate around the physical contact point (3D cursor as pivot) for a glass tipping on a table, then
  clean translation with Blend to Neighbor [01:39:15]-[01:46:59].
- Remove starts and stops ("ticks to the right and then goes down"); a staccato move needs
  anticipation [00:55:08]. Delete down to essentials when keys fight: "don't be afraid to delete
  keys" [01:05:47]; sRYVR92FqSw [00:34:23].
- Attention hierarchy: the face is where the audience looks; an elbow must not steal it [00:53:58].
  Stretch the camera does not show is acceptable [01:27:53]. Only the camera view matters on an
  acting shot, "it's not a video game" (zhktftWbumE [00:27:32]).
- Texture = small rhythm inside beats: the head rises and slows while the eyes move faster; head dip
  on the stressed word, shifted a frame; arrive a couple of frames early into a pose to get a
  resting moment [02:04:58], [02:20:26], [02:38:02]. Do not over-texture the body before lip sync
  exists [01:55:35].
- Fingers: little overlap, no bounce; the thumb barely drags; floppy hands look broken (zhktftWbumE
  [00:29:24]).
- Blocking-only is valid by style: many Sprite Fright shots were on twos (about 12 fps) and never
  splined; they are just harder to adjust later [01:30:18].

**Face** (NEZVF93fKsM)

- Anatomy first: frontalis pulls the brow on a diagonal (ask riggers to pre-tilt brow bones)
  [00:01:43]; corrugator pulls inward; muscles fire together; raising one brow fires part of the
  other [00:03:58]; volume is kept (lips thin when spread) and a smile pushes the cheeks into the
  eyes [00:04:34].
- Eyes: the fastest muscle, dart in 1 to 2 frames; slower reads floaty; eyes stagger in steps when
  scanning unless tracking a moving object [00:05:43]. Lids follow the cornea bulge [00:06:17]. Eye
  direction through the camera is an illusion: pose graphically, avoid wall-eyed or cross-eyed reads
  [00:06:49]; re-aim the far eye after a head turn [00:33:19].
- Brows: 3 to 10 frames; inner brow moves more; a slight inner curl already reads worried
  [00:07:22].
- Lip sync: blend phonemes, do not chatter; M, B, P at least 2 frames closed, closed before the
  sound [00:07:58]-[00:08:34].
- Appeal is readability, not attractiveness [00:08:34]. Involuntary expressions tend to be
  symmetric, voluntary ones allow asymmetry [00:09:08]. A big mouth opening pushes up the lower lids
  [00:09:42].
- Closed eyes: U curve relaxed, reversed curve intense [00:13:38]; pressure needs straight shapes
  [00:15:21]; straight lines tension, curves relaxation [00:35:01].
- Upper lid resting on the iris reads relaxed (the fix for a Spring smile) [00:21:02]; for annoyed
  or skeptical looks never below half the iris or it reads sleepy [00:43:44].
- Sub-beats: notice, react, realize, respond, each shown [00:22:43]. Reaction about 6 frames after
  the stimulus, "that's where it enters the brain" [00:30:26]. Never rotate the head on one axis
  only [00:27:56]. Go a couple of frames past the extreme and push, then settle [00:34:26]; push the
  whole face on the settle key for a pop [00:37:20]. Blend to Neighbor on rotation only, eyes closed
  about 80% in a sigh [00:46:39]. Block overlap and offsets into the blocking itself [00:47:54].
- Pose library: poses never include the eyes or the head hinge and body, so applying one keeps the
  eye line [00:32:11].

**Lip sync passes** (sRYVR92FqSw; zhktftWbumE [00:19:34]-[00:28:04])

1. Jaw only, stepped: "like animating a muppet" [00:08:21]; open a little before the first word so
   the inhale reads [00:06:39]; a breath gets a small opening [00:17:41]; fast syllables blended,
   not hit [00:30:28]; some passages are "a lot with the lips instead of the jaw" [00:20:57]. The
   most common mistake is opening the jaw on every beat [00:04:44].
2. Corners (width): in when the jaw opens, out again; Relative X-Mirror, or both sides by hand when
   mirroring fights existing keys [00:39:13]-[00:44:36].
3. Shapes from the pose library on the lower face minus the jaw, dialed back (a pronounced F is too
   big in a sentence; no "full M") [01:07:03]-[01:13:22].
4. Accents and design: corners never dead center (favor up or down), arc corners between shapes,
   subtle asymmetry and a sneer for personality (overdone reads drunk), register fast words without
   accenting them [01:34:56]-[01:44:01].
5. Tongue: one middle control first; R toward the back, N hidden against the roof so it does not
   read as L, T and L against the upper teeth; delete flashy flicks [01:51:41]-[02:06:08].
6. Then spline the face; polish contacts, fingers, fleshy squash in the face [02:10:50].

- Off-sync: "don't simply offset your lip sync but look at the preparation of your phonemes"
  [00:25:47]. Milk M, B, P, F a little: "a pop of air that ties the beats together" [00:38:38]. Big
  opens need jaw translation, not only rotation [00:11:45]. Keep the smirk from blocking; a neutral
  mouth reads too serious [00:45:07]. He gives no fixed global lead in frames.
- Stylized characters: use the accepted appealing mouth shapes; copying reference frame by frame
  reads like bland mocap [00:50:36].

## Hjalti Hjalmarsson (Blender Studio veteran animator; many open movies)

Sources: fbfODZ8PO4E (panel), eOxVdBgoehk (reference).

- Pipeline: Planning, Blocking, Blocking+, Splining, Polish; long planning and blocking, very short
  splining, modest polish. Junior anti-pattern: short blocking, long splining, very long polish:
  "everything swimming", hard for feedback (fbfODZ8PO4E [00:37:25]-[00:40:56]).
- "Please stop splining too early... you'll get these poses in between that are coming from the
  computer and not from you" [00:38:08]. He once handed off a shot on ones still stepped underneath
  [00:39:48].
- Key-type colors as a confidence map: Extreme (pink) for poses he is sure of, Breakdown (blue),
  Jitter (green); uncolored = in progress [00:46:30].
- Reference is a rehearsal and a conversation with the director; blind copying gives a rotoscoped
  look; never use other people's finished animation as reference (eOxVdBgoehk
  [00:00:38]-[00:04:20]).
- Listen until "your ears bleed", write dialogue phonetically with emphases; write the beats down
  [00:06:34]-[00:07:42]. Shoot at 24 fps, tripod, fitted contrasting clothes, simple light, mimic
  the shot's camera angle [00:07:58]-[00:11:19]; full body for mechanics, medium shots for face
  [00:11:19]. All beats present in order (about 8, up to 20) [00:13:40]. Do the real mechanics (a
  heavy box, real sawing) [00:14:14]. Perform open to camera [00:15:19]. 3 to 5 takes per recording
  [00:18:26]. Edit the reference with the layout inset and a frame counter [00:19:32].

## Pablo Fournier (Blender Studio animator)

Source: fbfODZ8PO4E.

- Plan with a rough Grease Pencil animatic of a simple shape (a ball with two legs) to find timing
  and beats before posing the rig [00:06:47]. (Grease Pencil planning:
  scenario-blender-grease-pencil.)
- Pose library in preproduction: an animation default pose (not the rest pose), emotions at maximum
  range so mixing has room, lip-sync shapes if needed, hands included, pose one side at 3/4 then
  mirror [00:12:00]-[00:13:42].
- Blocking+: Blend to Neighbor for delay, root favoring pose B while an arm favors pose A
  [00:15:27]. 20/80 rule: slow-in in-betweens at 80% of the remaining way, slow-out at 20%
  [00:15:27].
- Arcs are the most important check (root, hands, feet, nose), in camera view as a 2D plane
  [00:16:04].
- Smears: lines, multiples, blobs, shapes; follow the arc between the poses before and after;
  colored like the part; small far from the object, big near it; 1 frame, sometimes 2: "you need to
  feel, not see" [00:09:05]-[00:10:52]. Stylized shows only.
- Do not fall in love with your poses; show broken work early [00:47:04].

## Raymond Luc (DillonGoo Studios; Mandalorian, Ahsoka)

Source: fbfODZ8PO4E.

- Burst spacing: make the frame just before contact stick to the previous frame so the gap to
  contact is large; the brain reads the missing data as a harder hit; Free handles [00:04:31].
  [verified] `bouncing_ball(burst=0.6)` widened that gap 1.5x.
- Flatten handles for a mechanical chug, after timing and weight are final [00:05:03]. "The goal is
  to have the audience feel it but not see it" [00:04:19].
- Proportional editing in the Graph Editor sculpts many keys at once, on mocap and baked cycles
  [00:02:50]. Mouse muppeting (real-time recording of mouse moves) for rough passes and handheld
  cameras [00:01:41].

## Dillon Gu (founder, DillonGoo Studios)

Source: fbfODZ8PO4E.

- Lead with the action bone: COG for body mechanics, head or eyes for acting, hands for a cartwheel;
  layer the rest as "a conversation between bones" [00:27:37].
- Layered body mechanics (COG arc, legs, arms) as an alternative to pose to pose [00:27:37].
- Stair-step: drag each FK chain link's keys a frame or so after its parent for tails, ears, hair,
  simple cloth [00:29:45].
- Vector handles on a bouncing ball's contacts from the Dope Sheet; the Bounce easing with two keys
  ("don't tell your teachers") [00:30:52]-[00:31:58]. [verified] Both are shortcuts: VECTOR contacts
  deviate up to 0.09 m from a parabola on a 1.2 m drop, and Bounce easing puts its contacts between
  frames so no squash frame is ever shown.
- He worked six years with the Dope Sheet and handle types only [00:30:16].

## Tony Garcia (DillonGoo; animation, rigging, action design)

Source: fbfODZ8PO4E.

- Pivot tricks: Active Element to rotate IK limbs like FK; pivot a flip around the chest; "Only
  Locations" to widen a stance or scrunch brows without rotating controls [00:19:55]-[00:22:39].
  [added] Headless equivalent: `world_pose(pivot=...)`.
- Depth sells action: 35 mm and below; roughly 50 to 60% of dynamic motion in action scenes goes
  toward or away from the camera; fake depth with limb scale if the lens is locked
  [00:23:13]-[00:24:19]. (Lens choice itself: scenario-blender-previs-storyboard.)
- Simplify with viewport max subdivision 0 took a production scene from 5.05 to 24 fps [00:17:43].

## Alex Nagy (character animator, "Alex on Story")

Source: p8Bi7k60IS0.

- Start from "how do I want the audience to feel?" [00:01:06]. Key poses are the ones held longest;
  work all poses roughly together [00:04:18]. Formula: key pose, breakdown, settle, repeated;
  optional blending after approval [00:08:40].
- Setup: camera view clean, passepartout 0.99, audio waveform in the VSE, scrubbing on, end frame =
  audio length [00:09:43]-[00:15:15]. Key Location and Rotation only [00:20:22].
- First the strongest, longest-held pose, then the biggest extreme away from it; work backwards when
  the ending is the anchor [00:19:17]. Build COG, feet (offset, weight under them), hips, chest,
  arms, hands; drag built into the pose (wrist bent back) [00:21:26]-[00:32:16]. Hit the pose just
  before the audio spike [00:24:09].
- Flip between poses; he increased travel after flipping showed too little contrast [00:27:22].
  Holds: copy the pose 6 frames later (7 to 13) [00:32:16]. Overshoot pose after a big extreme
  [00:38:15].
- Push a pose with the computer: two identical keys spaced apart with Automatic handles overshoot;
  take the pushed frame [00:42:54]. [verified] AUTO overshot a 4.0 hold to 5.0; AUTO_CLAMPED stayed
  flat.
- Key poses on odd frames, even spacing between them, so middle frames exist [00:45:05]. The
  breakdown defines the arc first, the timing second; COG dips in the middle over the support leg;
  feet: extend contact, peel heel then toe; delay arms, hands and head; the later the breakdown
  favors the end, the faster that part finishes and the more the eye goes there
  [00:44:32]-[00:50:55], [01:11:43]. Push past a pose in the breakdown for energy; snap into an
  overshoot with a Vector key for a harder hit, then Auto Clamped into the final pose [01:09:31].
- Settles: a key inside the hold with Automatic handles gives a moving hold; 1 to 2 frames usual, 4
  for soft [00:52:34]-[01:03:08]. Aggressive change: 4 frames instead of 8 [01:03:42]. TV style
  stops at pose, breakdown, settle; style is set by pose aggression and the number of in-betweens (4
  vs 12) [00:53:40].
- Blending pass (optional): keys one frame after each pose, delete the original poses (keep the foot
  timing) so the body never stops; only after approval [01:13:45].
- Face: eyes pose to pose with blinks as breakdowns; mouth layered: jaw through the dialogue, then
  corners, then shapes, all on the jaw's timing [01:18:08].

## Joey Carlino (Blender educator)

Source: nRtT7Gr6S2o (Blender 2.93).

- One step then flip; mirror the full cycle only at the end [00:08:45]. 30 fps (his habit), step 20
  frames, cycle 40; first key on frame 0 so frame 10 is the middle [00:07:10]-[00:08:45].
- Contact 0: front heel down, leg almost straight, body centered [00:05:04]. Down 5: hips lowest,
  front foot flat, back toe past 45 degrees [00:10:43]. Passing 10 [00:09:24]. Up 15: hips highest,
  back leg almost straight [00:12:38]. Hips rotate toward the lowest foot and yaw with the forward
  leg; shoulders counter [00:13:52]. Arms last (FK for arcs), opposite arm to leg
  [00:15:24]-[00:19:49].
- Key only needed channels for a clean graph [00:09:24]. Head rotation lag 2 to 3 frames, more looks
  odd [00:24:41].
- Slip-free: the planted heel's forward curve must be straight during contact (Vector, linear, or
  his Free handles with zero-length contact-side handles); the root travels exactly the heel's
  distance, linear, Cycles Repeat with Offset [00:25:25]-[00:33:41]. [verified] AUTO_CLAMPED contact
  keys slipped 5.8 cm per step, VECTOR 0.0.
- Heel drifts back a little as it lifts (overshoot) [00:36:10]; the body drops faster than it rises,
  "shark fin" [00:40:15]; variations: turned-out feet, deeper downs, inverted bob for sneaking
  [00:38:39].

## Leo Silly-Pelissier (animation director, Flow)

Source: fxz6p-QATfs.

- Naturalistic, not realistic: real behavior with "a touch of freedom and randomness" [00:08:14].
- Four steps validated one by one: Block A (intention: key poses, expressions, shifts, constraints
  and paths set, references shown), Block B (transitions, library actions, cycles; no notes on
  intent after this), Spline (re-inject energy: timing, overshoot, desynchronized parts, variation,
  ears, eyes, tails, because splining softens), Polish (bugs, penetration, tails; little change)
  [00:13:39]-[00:17:06].
- Poses must work from every direction: the camera moves and the director may re-frame after
  animation [00:25:18]-[00:26:26].
- Behavior rules written down: cats turn the head (a "head dart") rather than look sideways with the
  eyes; ears move before the head; tail rises on jumps [00:20:15]. Rig controls for shape variation
  rather than animation layers [00:33:50]. Action library per character in the asset browser
  [00:23:29]. Long shots: split at moments without characters or during camera moves; the lead
  character animated furthest ahead [00:36:40]. 2 s per animator per day; average shot 380 frames
  [00:05:59].

## Pierrick Picaut (art director, lead rigger and animator, Noara)

Source: yIPMxxTueIM.

- Cinematics can cheat for the camera; gameplay cameras cannot, especially top-down
  [00:02:46]-[00:05:14]. Gameplay timing wins: release within about 1/3 s, hits every 5 frames from
  frame 15; freedom lives in recovery [00:06:24]-[00:07:30].
- Micro-anticipation: push the last 1 or 2 frames before a hit or release to an extreme [00:09:42].
  Directionality: every part points the same way [00:10:14]. Deaths snappy: "the first frame is that
  you're dead" [00:10:47].
- Align the silhouette with the motion path, checked from several camera angles; motion paths "all
  the time" [00:12:59]-[00:14:40]. Fit a move to a simple shape (a circle for a spin) [00:15:13].
  Stretch limbs toward the target and the landing point [00:16:18].
- Smears during polish: stretch toward the previous frame, whip joints, bend rigid props along the
  arc [00:24:07]-[00:30:35]. Locomotion first: contacts linear, match ground speed [00:05:49].
  Export dense baked keys, one NLA strip per clip [00:31:08]. He regretted 30 fps for cinematics
  [00:51:24].

## Nacho de Andres (game animator; Blizzard, Manor Lords; tool developer)

Source: M2J_fQNLDfg (BCON26).

- Dense (baked, mocap) animation edited by propagating a pose change over a frame range with a
  falloff (10 to 50 frames) instead of re-keying [00:18:58]-[00:23:57]; procedure P11.
- Arcs judged in space and relative to the body ("wormhole": past left, future right) [00:22:16];
  `onion_skin(spread=...)`.
- Why native motion paths are slow: the depsgraph evaluates one point in time per cycle [00:04:31];
  the Graph Editor is an abstraction from before real-time paths [00:30:03].

## Animation and Rigging module (Sybren Stuvel, Christoph Lendenfeld, Nathan Vegdahl)

Sources: ypWk6ZgQ-iM (BCON25), TxqnoafBdzg (BCON26).

- Slots: one action can animate several IDs, each with its own channelbag; name slots consistently
  (the character's name) because Blender picks slots by remembered name; it deliberately does not
  auto-assign an action's only slot to a new user (ypWk6ZgQ-iM [00:07:35], [00:13:12]). Slots are
  not for layering [00:15:29].
- Layered actions exist in the data model but are not exposed; use the NLA until layers reach parity
  (TxqnoafBdzg [00:11:49], [00:45:39]). 5.2 adds in-between tools in Object Mode, Graph Editor local
  view `/`, playback loop modes (TxqnoafBdzg [00:04:28]-[00:10:08]); 5.3 (not 5.2) adds paste-pose
  blending, rotation-mode conversion of animation, range world-space copy.

## Disagreements and the deciding condition

| Choice                | Position A                               | Position B                                                                                   | Decide by                                                                                                      |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Which views must work | camera only (Rik, Picaut cinematics)     | all directions (Leo, Picaut gameplay)                                                        | locked final camera or not                                                                                     |
| Blocking method       | stepped pose to pose (Hjalti, Rik, Alex) | layered COG first (Dillon); sculpt dense data (Nacho)                                        | acting shot for a director vs solo body mechanics vs editing mocap                                             |
| When to spline        | as late as possible, even never (Hjalti) | body after pillars, face stepped (Rik); Bezier blocking with Automatic pushes (Alex)         | spline once notes on intent stop (Leo)                                                                         |
| Graph Editor          | heavy use (Raymond, Tony, Joey)          | Dope Sheet and handle types only (Dillon); never, edit paths (Nacho)                         | curve-shape problems (spacing, cycles, heel curves) need it; blocking and retiming do not                      |
| What to key           | everything, every time (Rik)             | needed channels only (Joey, Alex)                                                            | stepped blocking and holds: all; cycles and curve work: minimal; one-channel overlap on a spline: that channel |
| Arms in cycles        | FK for arcs (Joey, Alex)                 | IK moved like FK with a pivot (Tony)                                                         | FK when arcs matter, IK when hands contact things                                                              |
| Frame rate            | 24 (Hjalti, Rik)                         | 30 (Joey habit, games)                                                                       | the delivery medium                                                                                            |
| Variation             | rig controls (Leo)                       | additive layers (module)                                                                     | 5.2 has no action layers: NLA ADD or rig controls                                                              |
| Handles               | Automatic for pushes and settles (Alex)  | Auto Clamped holds, Vector hits (Alex, Dillon), Free burst and flat contacts (Raymond, Joey) | the job of that key                                                                                            |
| Contact solution      | manual keys                              | Copy Location helper with animated influence (Rik)                                           | switch when keys keep fighting IK pole and stretch                                                             |
| Reference for mouths  | reference for acting and beats (Rik)     | accepted appealing shapes, not reference (Rik, stylized)                                     | stylized character: library shapes                                                                             |
| Mirror posing         | Relative X-Mirror                        | both sides by hand                                                                           | when existing per-side keys differ, go manual (Rik)                                                            |

## Production numbers

| Item             | Value                                                                   | Source                        |
| ---------------- | ----------------------------------------------------------------------- | ----------------------------- |
| Big studio pace  | about 3 s of animation per week                                         | Rik sRYVR92FqSw [01:00:54]    |
| Acting shot pace | 5 to 6 s per week (10 to 12 s shot in about 1.5 weeks)                  | Rik [01:01:26]                |
| Flow             | 2 s per animator per day; average shot 380 frames; longest 6,606 frames | Leo [00:05:59], [00:38:23]    |
| Reference        | 24 fps, tripod, 3 to 5 takes                                            | Hjalti [00:08:01], [00:18:26] |
| Beats per shot   | about 8, up to 20                                                       | Hjalti [00:13:40]             |

## 5.2 translation of old UI in these videos

- `I` keys the preference channels directly (Location, Rotation, Scale, Custom Properties by
  default, Rik's setup); `K` opens the keying menu; "Only Insert Available" is on by default in 5.2.
- Up arrow = previous key, Down = next (reversed in 5.0).
- Pose Mode Shift+E Breakdowner, Shift+Alt+E Blend to Neighbor (Rik's Shift+E is a custom binding);
  Graph Editor Blend to Neighbor exists.
- Bone layers and groups are bone collections (4.0); the Bone Selection Sets add-on is not bundled
  in 5.2.1: use bone collections or name lists.
- Pose library lives in the asset shelf (4.0); `poselib.apply_pose_asset(blend_factor=...)` needs an
  asset context.
- Copy Global Transform is built in (5.0). Grease Pencil is v3 (4.3).
- Scripts: slotted actions (4.4) and no `action.fcurves` (5.0); see the SKILL.md 5.2 notes.
