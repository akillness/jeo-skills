# Storyboard and cinematic grammar

## Concept first, anchored to the canon

Write a one-page concept before any panel: what happens, what turns, the closing image, and the
named famous-ad pattern it adapts or subverts. When web access exists, read teardowns of the
category's iconic ads before concepting; otherwise anchor to these verified patterns:

- Kenzo World (2016, dir. Spike Jonze): open inside the category cliche, then break it with one
  violent turn. The default move at `twist` creativity.
- Volvo Trucks "Epic Split" (2013): one claim, proven by one unforgettable demonstration. The
  consideration-objective default.
- Honda "Cog" (2003): product truth staged as spectacle, mechanism as story.
- Levi's "Launderette" (1985) and Jonathan Glazer's "Odyssey" (2002): one strong music choice
  carries the whole film.
- Old Spice "The Man Your Man Could Smell Like" (2010): direct-address comedy, gaze straight into
  the lens.
- Chanel No. 5 "The Film" (2004, dir. Baz Luhrmann) and Dior J'adore: the luxury dream-world
  register, and the source of its cliches.

Cliches to subvert knowingly rather than repeat: perfume (ballgown on a beach, whispered French, a
lone figure in a desert), car (winding mountain road, wet neon asphalt at night, salt-flat donuts,
spec-list voiceover), fashion (slow-motion fabric with no idea behind it). Discarding every code at
`wild` is legitimate but flag the cost: a category stripped of all its codes stops reading as the
category.

Show the concept to the user: it is the cheapest place to be wrong. When nobody can answer, record
the chosen anchor and its one-line rationale, then continue.

## Beats and panels

- 6s: hero shot, brand beat. 15s: hook, build, product proof, brand beat plus CTA (4 to 6 panels).
  30s: hook, world, turn, proof, payoff, brand beat (6 to 8 panels plus 2 to 3 inserts).
- The brand beat (logo, tagline, CTA) takes the last 2 to 3 seconds. Design the hero shot first: the
  product at its most desirable, then build beats around it.
- Each panel specifies: what the camera sees; the camera's side of the action line, held constant
  across the board so a rolling car or a reaching hand keeps its screen direction from cut to cut;
  one camera move with tempo; a lighting note; the conditioning mode (below); on-screen text, kept
  for the overlay pass with the frame's center band left clear; a sound note; the slot duration.
- Plan inserts deliberately: 2 to 3 cutaways give the edit cover, and clip-boundary artifacts
  disappear when cuts land on action or occlusion.
- Generation length is not edit rhythm. Generate 3 to 5 seconds for fidelity-critical product shots,
  5 to 10 for coverage, a second or two over the slot as a trim handle, then cut faster in assembly.
- Cuts are hard and made in assembly unless the brief asks for one take or a seamless flow: then
  chain adjacent approved stills as first and last frame anchors where the schema takes them (shot N
  runs from still N to still N+1), so each join is a frame both sides share and reads as a camera
  move, not a cut. Anchor to approved stills only, never to a rendered last frame: it is generated
  product. The same anchors close the loop that auto-looping placements (TikTok, Reels, Shorts)
  reward: end the final shot on the opening frame.

## Camera, light, people

| Intent               | Move                   |
| -------------------- | ---------------------- |
| Desire, reveal       | slow orbit             |
| Intimacy, focus      | slow push-in           |
| Authenticity         | subtle handheld        |
| Authority, packshot  | locked-off static      |
| Scale                | crane up, tilt up      |
| Craft detail         | macro extreme close-up |
| Context, consequence | pull-back reveal       |

One move per clip, tempo stated, movement first in the prompt: "slow push-in over 4 seconds".
Default the tempo to slow: it hides what the model cannot render cleanly, where speed exposes it.
Handheld takes a degree the way other moves take a tempo ("subtle handheld drift"), never bare
"handheld". Reliable across video models: push-in, dolly, pan, tilt, tracking, pull-back, handheld.
Budget retries for: orbit, crane, rack focus, whip pan. Some schemas expose a camera enum;
`model_schema_get` decides whether the move is a parameter or a prompt clause.

Lighting is locked at the still stage, so it belongs in the image prompt: dark-field for glass and
liquid (bright edges on a dark ground), backlight for transparency and sheer fabric, steep side
light to rake texture, large soft sources for paint and polished metal, rim light for separation,
golden hour for car bodywork.

People, when the concept needs them: gaze directed at the product pulls the viewer's attention to
it; a gaze into the lens is for direct address and CTAs only. Hands hold the product in a natural
use grip and never cover the label. Faces and hands fail first in generation and carry the 20x retry
floor, so prefer silhouettes, over-shoulder framing, and product-only sensory shots.

## Vertical presets

- Perfume: sensuality lives in the product, not on a body. Macro bottle hero, atomizer mist, liquid
  macro, fabric floating detached from any body, liminal wide. Sound: intimate orchestral, whispered
  sign-off. Policy: no undressing, sheer fabric on skin, or lingering body close-ups; ad review
  judges the cut's cumulative effect.
- Car: low front three-quarter hero, rolling shot with background blur, light sweeping over
  bodywork, interior detail, drone over an empty road. Sound: engine and surface carry the emotion,
  no spec list. Policy: speed is never the message, nothing that reads as a public-road stunt,
  seatbelts visible, numeric claims (range, fuel economy) only as market-qualified overlay supers.
- Fabric and fashion: the material dictates the cut. Macro weave under raking light, backlit sheers,
  drape billowing in slow motion, hem lift on a turn; structured tailoring cuts fast, soft drape
  holds long. Policy: no before-and-after or body-transformation framing, no second-person body
  copy; some markets require retouching labels when a body is altered, so surface it rather than
  deciding silently.
- Game: spectacle the genre earns, characters held by a reference sheet (see
  `scenario-consistency`), world reveal, capture-style framing free of invented UI. Policy: footage
  must not misrepresent gameplay; label dramatizations.

## Prompting image-to-video

Each shot prompt is self-contained: the model knows nothing of adjacent shots. Movement first, then
the subject's state, then atmosphere. For any shot that must END on the pristine product (a landing,
a settle, a return to the packshot), generate the opposite motion from the product photo as the
first frame and reverse the clip (`search` query `"video reverse"` surfaces the tool): the final
frame is then the untouched photo by construction. State product stillness positively, once: "the
bottle rests fixed in place". Negative commands ("do not morph") do nothing and can trip filters.
Put the hardest detail first. Conditioning: pass the approved still as the first frame when the shot
must open on it; use reference images when only identity, world, and palette must hold (the trade is
the subject of `scenario-seedance`). Where the schema offers an audio toggle such as
`generateAudio`, set it false: the soundtrack is built in assembly.

## The fidelity gate

Every clip showing the product or a character passes this before it may enter the edit:

1. Extract frames: `model_scenario-video-to-image-seq` is Scenario's single deterministic
   video-to-frames tool, so the id is a constant; take first, middle, last, plus any frame where the
   subject is largest.
2. One `asset_analyze` call (batching contract in `scenario-asset-analysis`): the approved reference
   first, then the frames, with an instruction of the shape: "Play spot the difference. Against
   image 1, list every visible difference in label text and placement, logo geometry, cap and
   silhouette shape, material and tint, palette. Per image: pass or fail, then the differences."
3. A brand-critical difference fails the clip. Regenerate from the same approved still with a
   tightened stillness clause, or demote the shot to an insert where the subject is smaller. Never
   anchor the next attempt to the drifted output.

Build the checklist once at brief time with `asset_analyze` on the product shot, with an instruction
naming the fields to inventory (label text and typography, cap, bands, silhouette and proportions,
materials, palette). `asset_describe` is the wrong tool for this: it returns a reusable style
synthesis for prompts, not a detail inventory.

Proportions are the check that feature lists miss: a composite can keep every named feature (color,
light signature, wheels, label) while quietly re-proportioning the product, and "silhouette
consistent" passes it. Make the checklist carry measured ratios (length to height, cabin to body,
wheel size relative to body, label size relative to face), state them in the still prompts, and have
the gate compare those ratios against the reference rather than judging plausibility.
