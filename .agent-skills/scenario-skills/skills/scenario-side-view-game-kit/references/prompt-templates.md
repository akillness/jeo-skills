# Prompt templates

The build's prompts with the subject replaced by slots. Fill every `{slot}` for your own game.
Parameter names in this file are the build's schemas' examples: read your picks with
`model_schema_get` and use the field names listed there, since they differ between models.

## Slots

| Slot              | Meaning                                                           | Example                                                                                                 |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `{character}`     | Full design: build, clothing, colors, weapon and where it is held | a small nimble fox knight in a dented steel breastplate and a short teal cape, a slender rapier in ...  |
| `{silhouette}`    | The two or three shapes that must read at sprite size             | pointed ears, bushy tail, rapier                                                                        |
| `{pose_a}`        | Left pose: the rest pose every ground clip starts from            | standing in a light fencing ready stance, facing right, knees slightly bent, rapier held low and ahead  |
| `{pose_b}`        | Right pose: the jump (hero) or the attack wind-up (enemy)         | the same character mid-air in a jump, facing right, knees tucked up, rapier arm raised back             |
| `{who}`           | Short name used in the motion prompts                             | fox knight                                                                                              |
| `{he}`            | Pronoun, capitalized                                              | He                                                                                                      |
| `{he_lower}`      | Pronoun, lower case                                               | he                                                                                                      |
| `{his_cap}`       | Possessive, capitalized                                           | His                                                                                                     |
| `{secondary}`     | Cloth, hair or tails that should trail during motion              | teal cape and bushy tail streaming behind him                                                           |
| `{weapon}`        | The weapon as it should be named in motion prompts                | slender steel rapier                                                                                    |
| `{strike}`        | One attack's swing, one phrase per attack clip                    | a wide horizontal slash forward at chest height                                                         |
| `{ranged_weapon}` | The drawn ranged weapon, for the shot clip                        | a small flintlock pistol from his belt                                                                  |
| `{stride}`        | An armed enemy's legs during the walk                             | short heavy strides on broad clawed feet, knees bending                                                 |
| `{held}`          | Where an armed enemy's weapon stays during the walk               | low behind him                                                                                          |
| `{n}`             | Number of poses on the pose sheet                                 | four                                                                                                    |
| `{pose_list}`     | The pose-sheet poses, left to right, separated by semicolons      | falling with the cape billowing up; clinging to an invisible wall on his right; ...                     |
| `{genre}`         | One phrase for the game, used by every environment prompt         | whimsical action platformer                                                                             |
| `{scene}`         | The level's place, with depth layers and light sources            | a giant mushroom forest at dusk seen straight on from the side: towering glowing caps, hanging moss ... |
| `{palette}`       | The level's palette in a few words                                | moss green, warm amber and soft violet on near-black                                                    |
| `{mid}`           | Framing for the midground: left edge, right edge, top edge        | huge dark mushroom stalks rise along the far left and far right edges, a canopy of caps across the top  |
| `{tex}`           | The material of solid walls and floors                            | packed dark earth with embedded roots and small stones, fine cracks, patches of moss                    |
| `{ledge}`         | The platform's material, trim line and what hangs beneath it      | a thick shelf fungus with a pale flat walkable top edge, glowing spores and roots hanging beneath it    |
| `{props}`         | Three props separated by semicolons                               | a crooked lantern post; a tree stump with a small door; a cluster of glowing mushrooms                  |

Keep the key color off every character: the scripts key strongly magenta pixels to transparency, so
no pink or purple cloth, flames or gems on a sprite. Environment layers use real transparency
instead and can use any color.

## 1. Two-pose still (text to image)

One image, two poses of the same character, so the design matches between them. Hero: rest pose and
jump. Ground enemy: rest pose and attack wind-up.

```
Pixel art game sprite sheet, two poses of the same character side by side, full body, on a perfectly flat solid magenta (#FF00FF) background, no shadows on the ground, no text.

Character: {character} Strong readable silhouette: {silhouette}.

Camera: classic 2D side-scrolling platformer, pure side profile view, orthographic, no perspective.
Left pose: {pose_a}.
Right pose: {pose_b}.

Style: crisp hand-placed pixel art like a modern 16-bit indie action platformer, 1px dark outline, limited palette of about 24 colors, soft top-left lighting, no pink, no purple, no magenta anywhere on the character, each figure about 60% of the image height, both figures the same size, generous empty space around each.
```

Settings in the build: 1536x1024 landscape, high quality, opaque background, two outputs to pick
from. Keep the take where both poses are on model, the magenta is clean and nothing on the character
is pink or purple. Name every pose "facing right": the game mirrors the sprite for the left.
`reframe_stills.py` writes the left pose as `<name>_rest.png` and the right pose as
`<name>_action.png`.

## 2. Motion prompts (image to video)

The first frame is the reframed still. A clip prompt is `MOTION + " " + FACING_AND_TAIL`, where the
motion sentence starts with `Pixel art game sprite animation` for locomotion and names the character
for the rest.

### Facing and tail (appended to every clip)

```
{he} always faces right in a pure side profile view like a 2D side-scrolling platformer, the same angle as the first frame, never turning toward the camera. {he} stays centered and does not travel across the frame. Locked static camera, flat solid magenta background, no ground shadow, crisp pixel art, same character design as the first frame.
```

### Negative prompt

```
front view, three-quarter view, facing the camera, turning around, camera movement, zoom, traveling across the frame, ground shadow, drop shadow, background change, extra characters, blur, 3D render
```

Add `, slowing down, stopping, standing still` for a run or walk. For an armed enemy's walk also add
`, swinging the weapon, raising the {weapon}, attacking, twirling`.

### Motion sentences

Run (first frame only):

```
Pixel art game sprite animation, like a treadmill: the {who} immediately starts running in place and keeps running for the whole clip, a steady fast repeating run cycle (knees high, arms pumping, {weapon} held low and back, torso leaning forward, both feet leave the ground between steps, {secondary}).
```

Idle (first = last frame):

```
The {who} stands idle in a light combat ready stance, a subtle breathing loop: chest rises and falls, a slight weight shift, {secondary} sway gently in a breeze. Feet stay planted.
```

Attack (first = last frame; write one per attack, each a different strike):

```
The {who} performs one fast {weapon} attack: {he_lower} steps into it and swings {strike}, then returns to the starting ready pose. Snappy anticipation, very fast strike, short follow-through.
```

Lunge, shot, hurt (first = last frame), each ending with "then returns to the starting ready pose":

```
The {who} performs one explosive forward lunge in place: {he_lower} drops low and leans far forward into a long horizontal thrust, then returns to the starting ready pose.
The {who} quickly draws {ranged_weapon}, fires one shot with a small bright muzzle flash and a sharp recoil kick, then holsters it and returns to the starting ready pose.
The {who} gets hit by an invisible blow from the front: {he_lower} flinches and recoils sharply backward, then recovers and returns to the starting ready pose.
```

Air spin (first frame = last frame = the reframed action still, `<name>_action.png`):

```
The {who} is airborne in the middle of a jump and performs one fast full forward somersault spin with the {weapon} held out, then comes back to the same mid-air pose as the first frame. {he} stays in the air in the center of the frame and never lands.
```

### Armed enemy walk

First frame only. The build's first armed walk swung its weapon mid-stride and could not loop; this
wording, with a lower guidance scale, fixed it:

```
Pixel art game sprite animation, like a treadmill: the {who} immediately starts walking in place and keeps walking for the whole clip, a steady repeating walk cycle: {stride}, {secondary} swaying with each step. {his_cap} arms stay still: {he_lower} keeps the {weapon} held {held} in the same grip for the entire clip and never lifts, swings or twirls it.
```

The run, idle and armed-walk sentences are the build's own wording; the attack, lunge, shot, hurt
and spin sentences keep the build's opening and closing words, with the middle written as slots.

### Clip settings

| Clip                             | First frame | End frame      | Duration | Why                                                          |
| -------------------------------- | ----------- | -------------- | -------- | ------------------------------------------------------------ |
| run, enemy walk                  | rest still  | none           | 3 s      | An end frame on short locomotion adds speed-up and slow-down |
| idle, attacks, lunge, shot, hurt | rest still  | the same still | 3 s      | Comes back to rest, so every action chains into idle         |
| air spin                         | jump still  | the same still | 3 s      | Stays airborne; the game plays it between rising and falling |

All clips square (1:1), audio off. In the build's schema these were `startImage`, `endImage`,
`duration` (the string `"3"`), `aspectRatio`, `generateAudio` and `negativePrompt`; the regenerated
enemy walk also set `cfgScale` to 0.7. Discover a clip model that takes a last frame with
`recommend` (`capability: "img2video"`, `features: ["endImage"]`), then confirm the field names with
`model_schema_get`.

## 3. Static pose sheet

Text to image with the chosen two-pose still as reference, for poses a clip cannot give cheaply:
falling, wall cling, plunge, air dash.

```
Pixel art game sprite sheet, {n} poses of the same character in one row, full body, pure side profile view facing right, on a perfectly flat solid magenta (#FF00FF) background, no shadows, no text, same character design, palette and pixel style as the reference image, wide empty gaps between the poses. Poses from left to right: {pose_list}.
```

This wording is a recommended template in the style of the others, not the build's verbatim prompt.
The build's list, in order: falling with the cloak billowing up; clinging to an invisible wall on
the right; a feet-first plunge with the weapon pointed straight down; a horizontal air dash with the
weapon thrust forward. Settings: reference image = the chosen two-pose still, 1536x1024, high
quality, opaque background (the key needs the magenta), two outputs. The poses may still overlap
horizontally; `side_sprites.py --poses` splits them by connected components, and `--pose-names`
(default `fall,wall,plunge,dash`) names them left to right.

## 4. Environment layer set

Text to image, five images per level, all at high quality in the build. The record gives no output
count: request one output each and re-render only a layer that fails its check. Generate level 1
only, look at it in the game, then run the other levels with the same templates and new slots.

Background (1920x1152, opaque):

```
Richly detailed high-resolution pixel art background layer for a premium modern 2D side-scrolling {genre} (the level of detail and lighting of the best contemporary pixel art games). {scene}. Atmospheric depth fog getting darker toward the edges. {palette} palette. Keep the lower third and the middle of the image darker and lower contrast so characters on top of it stay readable. Orthographic side view, no floor in the foreground, no platforms, no characters, no text, no UI.
```

Midground (1920x1152, transparent background):

```
Parallax midground layer for a 2D side-scrolling {genre}, richly detailed high-resolution pixel art, on a fully transparent background. {mid}. Lit softly from the center, very dark shadows. The entire center of the image and the whole lower middle are completely empty and transparent. Orthographic side view, no floor, no characters, no text.
```

Wall texture (1024x1024, opaque):

```
Seamless tileable square texture for the solid walls and floors of a 2D {genre}, richly detailed high-resolution pixel art. {tex}. Flat orthographic front view, even soft lighting from the top-left, no vignette, no strong shadows, no perspective, the pattern must repeat perfectly on all four edges.
```

The render will not tile reliably whatever the prompt says; `process_env.py` cross-fades the edges.

Platform strip (1536x384 requested, transparent background; the build's model returned 1536x512, and
`process_env.py` trims to the opaque strip, so either size works):

```
Game asset for a 2D side-scrolling {genre}, richly detailed high-resolution pixel art, on a fully transparent background: one long, thin, perfectly horizontal floating platform seen from the side, spanning the entire width of the image edge to edge. {ledge}. The top edge is perfectly straight and flat. The slab is about one quarter of the image height; everything above and below it is transparent. Orthographic side view, no characters, no text.
```

Props (1536x1024, transparent background):

```
Three separate decorative props for a 2D side-scrolling {genre}, richly detailed high-resolution pixel art, on a fully transparent background, evenly spaced in one row with wide empty gaps between them so they never touch, each standing on the same invisible ground line, pure side view: {props}. Each prop about 55% of the image height. No ground, no shadows, no characters, no text.
```

Sizes and the transparent option are the build's; request the nearest your pick's schema allows
(`background: "opaque"` or `"transparent"` was the build schema's field). Give each level its own
scene and dominant color, and end every palette "on near-black" so the sprites stay readable on all
of them.
