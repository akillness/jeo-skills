# Study the video

You will build from frames, so make them first and look at all of them.

```bash
python3 scripts/study_video.py gameplay.mp4 -o study/            # frames every 0.25 s, sheet.jpg, palette, cuts
python3 scripts/study_video.py gameplay.mp4 -o study/ --every 1  # a lighter pass for a 15 s clip
```

Open `study/sheet.jpg`, then every frame around the moments that matter. Read the prompt that generated the
video if there is one: it names the mechanic and the world in words the frames cannot give you.

## Write the spec before the code

One short file, `SPEC.md`, answering each line with what you see in a named frame:

- **Camera.** Third person behind, side view, top-down, chase? Distance to the hero (in hero heights), height,
  pitch, lens (wide and distorted or long and flat), how it follows (lag, look-ahead, roll in turns).
- **Hero.** Silhouette, proportions, colors, one or two features that make it readable at 100 px tall
  (a red scarf, a lantern, a bubble).
- **The mechanic.** The one verb the video sells: glide off a whale's tail, pour paint that makes flowers bloom,
  flip gravity, lay rails in front of a train. Write how it starts, what it changes in the world, and what
  feedback the video shows (particles, color spreading, a sound you can imagine).
- **Key moment.** The two seconds you would put in a trailer. The playtest must reach it.
- **World.** Layout (a corridor, an open field, floating islands at several heights), what repeats, what is unique,
  scale cues (houses, trees, clouds).
- **Look.** The palette from `study.json` with names (sky, haze, ground, hero accent), the light direction and
  color, the materials (painted, clay, low-poly flat, glossy), the atmosphere (fog, haze, particles), the grade
  (warm lift, teal shadows, crushed blacks).
- **Players.** One, or local co-op if the video shows two characters working together.

## Traps

- A generated video cuts and drifts. Take the camera and look from its longest steady shot, not from a cut.
- Video models invent HUD text and fake UI. Ignore it: the game shows no text.
- A video often shows a moment the game cannot sustain (a 2-second stunt). Make it a reward the player earns,
  not the whole loop.
- Measure, do not remember. Pick colors from the palette or a frame, not from the word "golden".
