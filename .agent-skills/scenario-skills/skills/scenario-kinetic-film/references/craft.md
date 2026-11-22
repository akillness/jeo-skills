# Craft: what makes it read as motion design

These were measured on high-energy motion design reels and checked on Kaiju Postal. Each rule has a
reason you can see on screen.

## Never park

- The camera always moves. Every block has a default drift (a 6 % push and a little roll over the
  block); stills the eye could count are where a film starts to look like slides.
- After a word lands, keep it alive: a slow scale (2 to 5 % per second), a slide (70 px/s for type
  rows), ghost rows scrolling past, particles, `rain` on pictures (or a word or cut-in on every
  beat).
- A picture is the easiest place to park. Push it fast, pan it, tilt it, punch in on each word, and
  cut in to a detail on a beat.
- The only rest is the logo card, and even it pushes in slowly with a light sweep.

## One idea per beat

- One or two words at a size that fills the frame width (300 to 600 px type on a 1920 frame). Blocks
  scale long words down to fit; if a word has to shrink below about 200 px, split the phrase.
- A beat gets one new thing: a word, a color, a cut, a hit. Two at once cancel out.
- Runs of beat cuts accelerate: 1, 1, 1, ½, ½, ¼ beat, then a flash.

## Transitions are moves

- Whip pans (a fast camera move with a long-shutter smear) between shots, alternating horizontal and
  vertical. The renderer stretches the shutter to about 600 degrees inside a whip.
- Zoom through a letter's counter into the next block: the inside of the O becomes the next shot.
- Collapse everything into a point, and grow the next thing (a logo line) out of it.
- A TV switch-off (squash to a line, then a point) out of a section.
- Fades only for the logo card's small lines.

## Color and type

- Three grounds: the dark `bg`, the brand `accent`, the light `paper`. Flip them on phrase changes;
  a run of beat cuts can flip on every cut.
- Type color follows the ground: paper on dark, ink on light. The accent is for the word that
  matters.
- Archivo's width axis (62 to 125) is part of the motion: words can stretch, squeeze and fill a
  width.
- Outlined (stroke) words for things not yet true, filled when they are: NO GUESSWORK. fills on its
  beat.
- Glyph scrambles and code backdrops say "code"; for a game or product, use its own visual language
  instead.

## Effects with a job

- Speed lines and a ring on the biggest hits only (a drop, a title). Everywhere else a flash, a
  shake and a scale bump are enough.
- The comet (a glowing point with a tail) is the film's thread: it draws boxes and graphs, links
  nodes, and becomes the point things collapse into.
- Motion blur is real (sub-frame samples) and grain and bloom are added in the render; never fake
  them in the page.

## Sound is half of the energy

- Every cut has a sound: a hit on beats, a whoosh on whips, a key click per typed character, a pop
  per element, a riser into the drop, a hard music stop on the logo hit.
- Hits must sit above the music: `mix.py` lists any that do not. Raise them in `spec.sounds` or
  lower `music.gain`; the music also ducks under every big hit.
- A custom sound for the film's own joke (a footstep, a door knock, a bell) is worth more than
  another generic impact.

## Check like an editor

- Look at stills at the beats, not at random times; look at 10 fps contact sheets of the busiest
  seconds.
- Watch the whips frame by frame: the last frame before a cut must still be blurred.
- Inspect every generated picture at 100 % for brand marks and artifacts before it goes in.
- Let `finish.py` measure what your eye adapts to: still frames, holds, motion, size, level,
  playback.
