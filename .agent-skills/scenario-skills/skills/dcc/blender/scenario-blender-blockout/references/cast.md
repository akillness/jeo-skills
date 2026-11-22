# Cast styles: what stands in for a character

A video model copies whatever moves in the guide clip. A figure with limbs hands it a gait; a figure
without limbs hands it only a position, a height, a pace and a heading, and the model invents the
body. So the stand-in style is a choice about who animates the character: the blockout or the video
model. Pick it per character, per model, and tell the user which one you picked and why.

## The dial

`K.figure(name, height, location, facing_deg, rgb, style=..., features=...)`, one style per figure.

| Style       | What it is                                                                              | The model copies                     | The model invents                    |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------ |
| `capsule`   | a colored capsule with a ball head, no limbs; `walk_path` adds a step bob and a sway    | position, height, pace, heading      | body, limbs, gait, clothing          |
| `featured`  | a capsule plus a few signature features from `K.FEATURES`, each in its own color        | the above, plus which one is which   | body, limbs, gait; features shape it |
| `jointed`   | thirteen rigid color parts; `walk_path` steps them with planted feet                    | the above, plus limb timing and pose | surface, face, clothing              |
| `mannequin` | a gray mannequin skinned to an armature, fixed proportions, torso in the identity color | the above, plus limb timing and pose | surface, face, clothing              |

Without `style`, a figure is a capsule, or a jointed figure when `fidelity` is shaped or detailed
(the old mapping). A figure keeps its style: rebuilding a name in another style raises.

In between: a featured capsule with `arms` (two swinging arm capsules, no legs) gives the model hand
positions without a gait to copy. A jointed figure can carry a prop on its forearm, a mannequin on
its `forearm_R` bone.

Features (`K.FEATURES`): worn ones merged into the capsule mesh (`hair`, `long_hair`, `hood`, `hat`,
`helmet`, `goggles`, `nose`, `scarf`, `backpack`, `cape`, `coat`, `skirt`, `belt`, `ears`, `tail`,
`bag`, `sword`) and held ones built as child objects that swing with the stride and take `K.pose`
keys (`arms`, `lantern`, `staff`, `shield`). Two or three features per character are enough: they
exist to tell characters apart and anchor the one object the story needs (the lantern a girl
carries, the staff of the tallest), not to model a costume. `colors={"hood": (r, g, b)}` overrides a
feature's color; defaults are a darker shade of the figure's color or a material color.

## Which style, by model

Read the model before choosing: on the hosted route `recommend` and `model_schema_get`, on the
plugin lane `list_models` and `model_schema`. The families below were tested; a new model gets the
same A/B before a long pass (see "Test before the long pass").

| Video model family                                                         | Hero characters                                                 | Extras               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------- |
| Reference-video models that track the clip's motion closely (Seedance 2.5) | `featured` capsule; `capsule` when characters are far apart     | `capsule`            |
| 3D-to-video models that read each proxy literally (H3 Max)                 | `jointed` or `featured`; check the running order in close shots | `capsule`, `jointed` |
| Render-to-real models with one image input (LTX 2.3)                       | any style; the first frame carries identity                     | `capsule`            |

Why the split: a reference-video model follows the clip's motion closely, limbs included. In our
film work a rigged walk loop came back as sliding feet; in the test below, stepped jointed runners
came back upright with short walk-like strides even with a running clause in the prompt, while
capsules came back running. A 3D-to-video model turned every style into people here, so the stand-in
mattered less than identity; an earlier H3 Max take turned a capsule hero into a cylinder for part
of a close shot, so check close shots there.

A `mannequin` is the choice when the limb motion itself must come from the blockout (a dance, a
fight beat, a specific gesture) and the model copies limbs well. Give it real animation then: a
rigged mannequin walked by procedural keys is still a procedural walk. Rig a generated character and
retarget an animation through Scenario (`scenario-3d`, Rigging and animation), or key the beat with
`K.pose` (scenario-blender-animation for the craft); `K.walk_path` only covers travel. Keep its
torso in the identity color: an all-gray mannequin playblast was refused once by a provider's input
screen ([handoff](handoff.md), tested limits).

## Motion

- `K.walk_path(fig, [(frame, (x, y)), ...], stride=...)` for every style. Default stride 0.42 x
  height (a walk); about 0.7 for a run. A capsule bobs once per step and sways once per stride,
  scaled by speed, and its arms and held props swing; `bob=False` turns that off, but a capsule that
  only glides was rendered sliding. A jointed figure or a mannequin plants each stance foot; a
  stride past 0.5 x height slides the stance foot by the excess, and the model copies that slide.
- `B.audit_ground` reports the capsule bob as off the ground (up to 3.7 % of the height at a run).
  Audit capsules in their own call with `tolerance=0.04 * height` of the tallest.
- A runner's lean: tip a capsule root forward with `root.rotation_euler.x` (about 7 degrees); pose a
  jointed torso or a mannequin's `torso` bone with `K.pose`.
- `K.pose(fig, frame, **joints_deg)` keys gestures: jointed parts, mannequin bones (same names) or a
  featured capsule's `arm_L`, `arm_R`, `lantern`, `staff`, `shield`.
- On raised or sagging ground add the deck height to the root's z keys; do not replace them, they
  carry the bob.
- Riders: `K.pedal(fig, bike, frames)` seats any style on a `K.vehicle` bicycle
  ([contract](contract.md), Vehicles). A jointed figure or a mannequin pedals with the cranks. A
  capsule or featured rider only sits and leans, so the model invents the pedaling.
- Which of those holds a pedaling motion on each model is untested. With cyclists in a long pass,
  run the A/B in "Test before the long pass" with riders first.

## Prompt clauses

The hand-off sheet lists `K.cast()` (name, style, color, height, features, extra). The prompt then
carries, for a capsule or featured cast:

1. **Stand-in clause**, once: "In @video1 each character is a colored capsule stand-in with a ball
   for a head and no arms or legs: it only marks where that person is, their height, their pace and
   which way they move. They are real people with natural human motion." With features, add: "The
   few small shapes on some capsules (goggles, a scarf, a hood) only say which one it is." This is
   the one place the prompt names a proxy shape: it says what the shape is not.
2. **Mapping and order**: "the red one in front = the leader girl with goggles and a long red scarf;
   blue = ...", tallest and smallest named, running order stated.
3. **Gait clause** for every shot where a character travels close enough to see: "They walk (or run)
   naturally at the pace the capsules move: heel then toe, each foot planted before the other lifts,
   weight shifting from foot to foot, arms swinging. Their feet never slide, glide or float."
4. **Exclusion tail**: add "no capsule-shaped bodies".

For riders, the stand-in clause says each capsule sits on a bicycle. The gait clause becomes a
pedaling clause: "They pedal steadily at the pace the bikes move, feet on the pedals, knees rising
and falling in turn, hands on the handlebars. The bikes never coast without pedaling unless the shot
says so."

For a jointed or mannequin cast, keep the motion-first grammar of [handoff](handoff.md) unchanged
and add the gait clause if the model copied a stiff gait.

## Judge the cast

On the side-by-side sheet from [handoff](handoff.md), per character: a body with limbs (no capsule,
cylinder or bowling-pin shape surviving), feet that land and push off (look at a strip of six
consecutive frames at the feet), the features in the right place (goggles on the head, the lantern
in a hand), identity and order held across cuts, and the closest shot of each hero. A survivor shape
in one model is a reason to switch that character's style for that model, not to add detail.

## Test before the long pass

Before a long or expensive pass with a model not listed above, render the same short window (one or
two shots, 4 to 6 s) twice: once with `featured` capsules and once with `jointed` figures or
mannequins, same references, same prompt except the stand-in clause. Keep the same speed: a legged
runner plants at most 0.5 x height per step, so it takes shorter, quicker steps than a capsule at a
run stride. Use the model's draft or lowest resolution when it has one. Tell the user what each
style costs in control (gait and gestures from the blockout versus from the model) and that the
legged variant's cadence differs too. Then say which one won on this model, and offer the other as
an option.

## Results (Sky Islands, October 2026)

Example 4 (five children run across a rope bridge, four shots, 12 s) built in each style from the
same script, with the same style frame, cast sheet and set sheet, and the same prompt except the
stand-in clause and the gait clause. One take per cell: an indication, not a measurement.

| Model, window                                            | `jointed`                                                                    | `capsule`                                                                       | `featured`                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Seedance 2.5, 12 s (480p drafts; featured also at 1080p) | upright, short walk-like strides in near lockstep; same with the gait clause | a real run (forward lean, knee lift, both feet off the planks, own rhythm each) | the same run, plus all five identities and the running order held across four cuts                |
| Seedance 2.5, identity                                   | held                                                                         | in the tracking shot the tallest took the leader's place                        | goggles, scarf, backpack, hood and staff where the features were; a slingshot added from the text |
| H3 Max 768P, 6 s wide and tracking                       | five running children, order held                                            | the same; no capsule shape survived                                             | the same, framed tighter than the clip                                                            |
| H3 Max 768P, 6 s close front and crane                   | lead girl with the right child behind her                                    | lead girl rendered whole; the smallest moved up to second place                 | the same as capsule                                                                               |
| LTX 2.3 720p, 6 s wide and tracking                      | running children; one wore another's backpack                                | running children, identities held                                               | running children, identities held                                                                 |

A gray `mannequin` with colored torsos on H3 Max (6 s, wide and tracking) also came back as five
running children, and added a second sky whale. LTX left set proxies visible in every style
(ball-topped posts), as it did before.

So: on Seedance the stand-in decides the gait, and features decide whether identities hold with
several similar characters; on H3 Max and LTX the style changes little and the usual checks apply.
