# Generate every asset with fal

Rule of the project: every image, 3D model, sound and music track in the game is generated on fal, from the
video's own frames as references, so the assets share the video's style. Nothing is drawn by hand or downloaded.

Run each call with `scripts/fal_asset.py`, which uploads local files, downloads the outputs and appends to
`fal_log.json`. One job at a time: open the result, judge it against the video, then ask for the next.
Check endpoint ids and parameters in the live catalog (fal.ai/models) before a first call; do not guess them.

## What the 31 games of the gallery used

1,013 calls in total, about 6 USD per game (median 6.13, from 0.79 to 15.48).

| Job | Endpoint (calls) |
|---|---|
| Concepts, sprites, textures, sky, parallax layers | `fal-ai/nano-banana-pro/edit` (388), `fal-ai/nano-banana-pro` (73) |
| Background removal | `fal-ai/birefnet/v2` (74), `fal-ai/bria/background/remove` (12) |
| Image to 3D (GLB) | `meshy/v7.1/image-to-3d` (81), `tripo3d/h3.1/image-to-3d` (40), Trellis 2 (23), `fal-ai/hunyuan-3d/v3.1/pro/image-to-3d` (17), Rodin (15) |
| Rigging and animations | `fal-ai/meshy/rigging/multi-animation` (24) |
| Sound effects | `fal-ai/elevenlabs/sound-effects/v2` (165), Stable Audio 3 SFX (41), Sonilo SFX (26) |
| Music | `elevenlabs/music/v2.5` (22), `google/lyria-3.5` (8) |
| The gameplay video itself | `minimax/h3-max/text-to-video` (30), `bytedance/seedance-2.5/text-to-video` (1) |

## The character pipeline

1. **Concept from the video.** `fal-ai/nano-banana-pro/edit` with 1 to 3 frames where the hero is clearest as
   `image_urls`, and a prompt like: "the same character alone, full body, A-pose, arms slightly away from the body,
   neutral expression, plain light grey background, even studio light, same art style and colors as the reference".
   A-pose (not T-pose) rigs better and keeps sleeves and capes readable.
2. **Optional turnaround.** Same model, "front, side and back views of the same character on one sheet", for
   multi-view 3D models and to check the design from behind (the camera mostly sees the back).
3. **Cut it out.** `fal-ai/birefnet/v2` on the concept. A clean alpha gives a clean mesh.
4. **To 3D.** `meshy/v7.1/image-to-3d` (`image_url`, options for A/T pose and PBR) or `tripo3d/h3.1/image-to-3d`
   for characters; Hunyuan 3D Pro (`input_image_url`, plus optional back and side views) for detailed props.
   Normalize every GLB on load: scale to a known height, put the feet at y = 0, face -Z.
5. **Rig and animate.** `fal-ai/meshy/rigging/multi-animation` with `model_url` and `animation_action_ids`
   (run, jump, idle, glide) and `height_meters`. Keep the clips in one GLB and blend them with an AnimationMixer.

## Environments and textures

- **Wide layers** (far mountains, cloud banks, city skyline): one wide image per depth, then background removal,
  on planes at different distances for parallax. Ask for "isolated on a flat white background" so the cutout is clean.
- **Tileable materials** (grass, stone, roof tiles, sand): "seamless tileable texture, top-down, flat even light,
  no shadows, no perspective". Check the tiling by repeating it 3x3 before using it.
- **Sprites and effects** (petals, sparks, leaves, puffs): an atlas of 4x4 on a flat color, then background removal.
- **Props** (houses, trees, lanterns): concept on grey, cutout, image to 3D. Reuse one model many times with
  scale, rotation and tint variations instead of generating hundreds.
- Keep the video frame in `image_urls` for everything, so a texture made in isolation still belongs to the world.

## Sound

- One sound per player action and per world reaction: jump, land, glide loop, collect, the key mechanic, ambient bed.
  `fal-ai/elevenlabs/sound-effects/v2` takes `text`, `duration_seconds`, `loop` (true for wind, engines, rain).
- Music: `elevenlabs/music/v2.5` with `force_instrumental: true`, or a `composition_plan` of sections with
  durations when the music must build at a precise moment. Normalize loudness so effects sit above the music.

## Cost habits

- Log every call (the script does). Report calls per endpoint and the total at the end.
- Generate 2 or 3 variations only for the hero and the key mechanic's assets; one is enough for background props.
- Shrink textures before shipping (WebP, 1K for props, 2K for terrain): a game with 8 characters and 80 props
  still loads in seconds.
