# Match the look

The first versions of these games were playable and wrong: the right mechanic in a flat, colorful, generic
world that looked nothing like its video. What fixed them was treating the look as a spec with measurements,
and comparing pictures after every change.

## The side-by-side routine

1. Pick three spots that cover the game: the start, the key moment, and somewhere far from the start
   (expose a `?x=` or a `flyTo` for it).
2. Screenshot the game at those spots, and pick the video frames that show the same kind of moment.
3. `python3 scripts/side_by_side.py gameplay.mp4 shot.png -o pairs/ --times 4` and look at each pair.
4. Write what differs (too saturated, sky too clean, fog too thick, hero too small), fix one thing, repeat at the
   same three spots. Always the same spots, or you are comparing luck.

## Post-processing is part of the build

Set it up with the first scene, not at the end:

- **Tone mapping** ACES Filmic, exposure tuned on a pair.
- **One grade** for the whole game, like a LUT: lift, gain, a hue shift in the shadows. Change the grade, not
  forty materials.
- **Fog / aerial perspective**: far things melt into the haze color from the palette. It gives depth and hides
  the edge of the world.
- **Bloom** only on what glows in the video (sun, lanterns, magic). Threshold high.
- **Vignette and grain** at low strength; they glue generated textures together.
- **Depth of field / tilt-shift** only if the video has it, and keep the horizon readable.

## Calm the world

The usual failure after "make it richer" is noise: random props everywhere, saturated greens, detail at every
pixel. Then nothing reads.

- **One harmonized palette.** Olive and sage instead of acid green, slate blues, earthy ochres: whatever the video
  uses, pulled together by the grade.
- **Group, do not scatter.** Trees in groves, rocks in clusters, open meadows and plazas between them, gaps of sky.
- **Hierarchy.** Landmark buildings > houses > props > ground detail. Interactive things (towers, rings, targets,
  pickups) get the accent color and stand out on a calm background.
- **Painted foliage stays calm**: leaf cards with soft shading, not lumpy green balls.
- **Density is welcome** (more than the video), as long as the frame still reads at a glance.

## Checks before calling it done

- A pair at each of the three spots where the game could pass for a frame of the video at thumbnail size.
- The hero is readable at the size the video shows it.
- 60 fps (or 30 fps with a clearly better image), zero console errors.
