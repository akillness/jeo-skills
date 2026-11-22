# Prompt patterns

Ten generations make one look: a concept frame, eight pictures that take the concept as their
reference image, and a run clip whose first frame is the hero's reframed rest pose, never the
concept. The patterns below are the ones that worked for the three looks of the reference shot (a
red panda in a golden-hour jungle, a black cat on a moonlit Halloween street, a snow leopard cub in
a white winter valley). Replace the bracketed parts; keep the structure and the "no ..." lists, they
carry most of the work.

## 1. Concept frame (text to image, opaque, 16:9, two takes)

The one picture that locks the look. Write it as a screenshot of the finished game, not as an
illustration.

> In-game screenshot of a premium polished 2D side-scrolling mobile platformer, the art quality and
> finish of a top-grossing casual mobile game: bold clean cartoon shapes, glossy soft painterly
> shading, thick dark outlines on characters and props, [palette and light].
>
> Scene, strictly side view, layered for parallax: [sky]; [far layer, e.g. a calm sea with distant
> islands on the horizon]; [mid layer, e.g. jungle hills with ruins]; a ground strip of [material]
> with a clear flat walkable top edge running across the lower quarter; [foreground plants] in the
> foreground corners.
>
> Gameplay elements: [hero: species, size, two or three memorable details, a small accessory],
> running to the right; a floating [platform] with three [coins] above it; [a tree that will drop
> things]; on the right, a small tower stacked from [props that belong to this world].
>
> No text, no UI, no logo, no HUD.

Name the layers in the order the scene will stack them. "Strictly side view" and "flat walkable top
edge" are what make the frame usable as a game camera. Name the props you want, and say which
materials you do not want if a generic tower would read as some other game.

## 2. Layers (image edit with the concept as reference, one layer per call)

Every layer prompt starts the same way and differs only in what it keeps:

> [Role] layer for a 2D side-scrolling mobile platformer, in exactly the same art style, colors and
> [light] as the reference screenshot, on a fully transparent background. [What is in it, spread
> across the whole width]. [Where it sits in the image]. Everything above [its top] is completely
> transparent: no [the layers behind it]. No [the layers in front of it], no characters, no text.
> Wide panoramic layer, strictly side view.

| Role       | Background  | Size (px)   | What makes it work                                                                                                      |
| ---------- | ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| Sky        | opaque      | 2560 x 1440 | "ONLY THE SKY"; no land, sea or trees; the sun placed where the light comes from                                        |
| Far layer  | transparent | 3072 x 1152 | the horizon line "at about the middle of the image"; content "continues down to the bottom edge"                        |
| Mid layer  | transparent | 3072 x 1152 | "fills the bottom 55% solidly from edge to edge"; "slightly hazy and softer" to read as far                             |
| Ground     | transparent | 2048 x 768  | "a perfectly flat, level walkable top edge ... at about 30% from the top"; "no rounded end caps, so it can be repeated" |
| Foreground | transparent | 3072 x 1024 | five numbered clusters "each standing on its own base, with wide empty transparent gaps"                                |

Wide layers are tiled later ([prep_assets.py](../scripts/prep_assets.py) `tile`), so ask for content
"spread across the whole width" and keep any single landmark (a big arch, a castle) away from the
ends.

## 3. Props sheet and the tree (image edit, transparent)

> Game props sprite sheet for a 2D side-scrolling mobile physics platformer set in [world], in
> exactly the same art style, colors and lighting as the reference screenshot, on a fully
> transparent background. Every prop is drawn flat, strictly side view with no perspective and no
> shadow, each one separate with wide empty transparent gaps between them so they can be cut apart,
> arranged in a loose grid: 1) [pot]; 2) [tall vessel]; 3) [short jar with a flat lid]; 4) [small
> heavy statue]; 5) [round fruit that will fall]; 6) [coin with an emblem], seen face on; 7) a
> floating chunk of [island], flat walkable top, about three times wider than tall; 8) a flat
> [pedestal], wide and short. No characters, no ground, no text.

The numbered order is the reading order [prep_assets.py](../scripts/prep_assets.py) `cut` uses for
the names. Things that will fall from the tree are their own props: draw the tree separately and say
"NO [fruit] in the crown".

## 4. Hero, two poses (image edit, opaque magenta, two takes)

> Game character sprite sheet, two poses of the same character side by side, full body, on a
> perfectly flat solid magenta (#FF00FF) background, no shadows on the ground, no text. Character:
> the [hero] from the reference screenshot, in exactly the same polished cartoon style: [details].
> Camera: classic 2D side-scrolling platformer, pure side profile view facing right, no perspective.
> Left pose: standing ready to run, facing right, weight slightly forward, knees slightly bent.
> Right pose: the same character mid-air in a jump, facing right, knees tucked up, arms raised. Both
> figures the same size, each about 60% of the image height, generous empty space around each. No
> pink, no purple, no magenta anywhere on the character.

The magenta field is for keying; a character with pink or red parts (a scarf, a hat) needs the "no
magenta" line and care when keying. The left pose becomes the first frame of the run clip
([reframe_stills.py](../scripts/reframe_stills.py)).

## 5. Run cycle (image to video, first frame = the reframed left pose)

> 2D cartoon game sprite animation, like a treadmill: the [hero] immediately starts running in place
> and keeps running for the whole clip, a steady fast repeating run cycle: [how this body runs:
> knees high and arms pumping, or a four-legged gallop], both feet leave the ground between steps,
> body bobbing slightly, [tail, accessory] bouncing. [He] always faces right in a pure side profile
> view like a 2D side-scrolling platformer, the same angle as the first frame, never turning toward
> the camera. [He] stays centered and does not travel across the frame. Locked static camera, no
> zoom, flat solid magenta background that never changes, no ground, no ground shadow, same
> character design, colors and clean cartoon outlines as the first frame, no motion blur.

"Like a treadmill", "stays centered", "locked static camera" and "background that never changes"
each closed a failure. A five-second clip is enough: only one clean period (9 to 12 frames at 24
fps) is kept.

## A new look

Same ten roles, same order, a new concept frame. Keep the layer sizes, the hero's share of the frame
and the ground's walkable line close to the first look, so the measured numbers in `config.json`
change little.
