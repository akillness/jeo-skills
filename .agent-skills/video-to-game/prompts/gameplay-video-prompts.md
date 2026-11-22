# Gameplay video prompts

The game is only as good as its video. These rules made the 31 videos of the gallery rebuildable.

## Rules

- **One original concept you can say in a sentence**, with one verb at its heart: glide, pour, flip, lay rails,
  ring a bell, push clouds. No existing game, character, brand or level layout.
- **Show the mechanic working**, not only the world: the action and its consequence on screen (the lantern
  rises and becomes a star, the rust blooms into flowers).
- **A playable camera**: third person behind, side view or top-down, steady, the hero clearly visible.
- **No HUD and no text.** Video models invent fake UI and gibberish words; the game will not have them anyway.
- **A strong art direction in a few words** (painted watercolor, ink wash, cozy low-poly, stained glass light)
  so every asset generated later can follow it.
- 10 to 15 s, 1080p, 16:9. Generate a few, keep the one whose mechanic reads best.

## Settings used

`minimax/h3-max/text-to-video` with `duration` 10 or 15, `resolution` "1080P", `aspect_ratio` "16:9",
`prompt_expansion_mode` "disabled" to keep the prompt as written. One video was made with
`bytedance/seedance-2.5/text-to-video`.

```bash
python3 skills/video-to-game/scripts/fal_asset.py minimax/h3-max/text-to-video -o video/ --name gameplay \
  --arg prompt="Courier boy running and gliding between giant flying whales above the clouds." \
  --arg duration=10 --arg resolution=1080P --arg aspect_ratio=16:9 --arg prompt_expansion_mode=disabled
```

## The 31 prompts

| Game | Prompt |
|---|---|
| [Skyfarer](../gallery/skyfarer/) | Courier boy running and gliding between giant flying whales above the clouds. |
| [Tidebound](../gallery/tidebound/) | Two-player co-op sailing game: two sailors crew a living ship grown from pink coral. One player steers the wheel while the other pulls ropes that open sails made of giant glowing manta-ray wings; the ship surges over huge turquoise storm waves, spray and foam, lightning far away. Chase camera behind the ship. |
| [Storm Surfer](../gallery/storm-surfer/) | Photorealistic 3D game, cutting-edge real-time rendering quality, real-world materials: a surfer on a glowing hoverboard rides a huge stormy ocean wave at dusk, lightning flashing, he carves up the wave face and launches through the spray. Low chase camera. |
| [Skyhook Rescue](../gallery/skyhook-rescue/) | Two-player co-op rescue game during a thunderstorm: two small airships linked by a long cable fly together between floating rock islands, swinging a rescue basket to lift stranded villagers and their goats, then racing to a lighthouse harbor as the storm grows; rain, wind-whipped clouds, lightning, rich painted textures. Chase camera following both airships. |
| [Paper Dragon](../gallery/paper-dragon/) | A girl rides a long red paper dragon kite through an autumn canyon, the dragon's paper body rippling as it dives under stone arches and rises over golden trees. |
| [Bubble Balloon](../gallery/bubble-balloon/) | A child floats inside a giant soap bubble over a sunny seaside village, steering it by leaning, bouncing gently off rooftops and chimneys while seagulls follow. |
| [Kite Rider](../gallery/kite-rider/) | Watercolor-shaded 3D game: a girl stands on a giant kite, surfing the wind high above rice terraces, leaning to steer between tall wind turbines and diving to skim a lake surface. Chase camera. |
| [Aurora Skiff](../gallery/aurora-skiff/) | A nomad steers a small sand skiff with a cloth sail across glowing blue dunes at night, catching the wind under a sky full of green and violet auroras. |
| [Glass Greenhouse](../gallery/glass-greenhouse/) | A tiny robot gardener tends a greenhouse inside a floating glass sphere above the clouds; it opens glass panes to let beams of sunlight in, and wherever the light falls flowers grow into stairs it climbs. |
| [Bell Tower](../gallery/bell-tower/) | A bell-ringer swings on long ropes inside a giant pastel bell tower; each bell she rings sends a wave of color rolling across the sky outside the arches. |
| [Fog Shepherd](../gallery/fog-shepherd/) | A cloaked figure with a lantern guides a herd of glowing white deer through a monochrome foggy forest; only the circle of lantern light has color. |
| [Paper Moon Stairs](../gallery/paper-moon-stairs/) | A girl in a long white dress climbs a staircase of drifting paper lanterns into a pastel night sky; each lantern she touches rises and becomes a star. |
| [Whale Song](../gallery/whale-song/) | A diver in a red scarf swims beside a giant translucent ghost whale through a deep blue gradient ocean; the whale's song draws glowing lines in the water that she glides along. |
| [Sky Library](../gallery/sky-library/) | A girl swims through warm air between towering floating bookshelves; loose pages flutter like birds and she rides a flock of pages upward. |
| [Kintsugi Mountain](../gallery/kintsugi-mountain/) | A small monk walks up a black-and-white ink-wash mountain; every footstep blooms gold leaf, and golden kintsugi lines spread through the cracked rocks, healing them as he climbs. |
| [Space Mower](../gallery/space-mower/) | Bright stylized 3D game on a tiny round green asteroid: an astronaut drives a little lawn mower around the asteroid, mowing shapes into the grass while small meteors fall and leave craters to avoid. Camera above the curved surface. |
| [Ember Path](../gallery/ember-path/) | A girl carrying a small glowing ember walks through a charcoal-drawn burnt forest; the ember redraws the trees in vivid green and orange color as she passes. |
| [Clockwork Heist](../gallery/clockwork-heist/) | Four-player co-op heist game inside a colossal clock tower: four small thieves in red, blue, yellow and green cloaks time their jumps across giant rotating brass gears and swinging pendulums, one holds a lever so the others can pass, polished brass, oiled wood and dusty light beams. Wide side-on 3D camera showing all four players. |
| [Starlight Train](../gallery/starlight-train/) | A little spirit in a white cloak rides on the roof of a night train crossing snowy mountains, jumping from wagon to wagon to catch falling stars that light the windows below. |
| [Dune Surfer](../gallery/dune-surfer/) | Low-poly desert 3D game at sunset, flat-shaded orange and purple dunes rolling like ocean waves: a hooded sand surfer on a board rides down the dunes, launches off a crest, spins in the air and lands on the next dune. Chase camera. |
| [Autumn Wind](../gallery/autumn-wind/) | A child in a cloak of orange leaves surfs the wind over golden hills with a swirling swarm of leaves, painted in bold brush strokes. |
| [Stained Glass](../gallery/stained-glass/) | A tiny cloaked figure crosses a vast empty cathedral; sunlight through stained glass windows casts colored shapes on the floor, and only the colored light holds her weight as she leaps from color to color. |
| [Deep Lights](../gallery/deep-lights/) | Bioluminescent deep-sea 3D game, dark navy water, simple glowing shapes: a small yellow submarine touches sleeping jellyfish with its light, each one lights up and becomes a glowing lamp revealing the path deeper into a dark trench. Chase camera behind the submarine. |
| [Snow Globe](../gallery/snow-globe/) | A tiny figure lives inside a snow globe; the whole world slowly turns upside down, the snow falls upward and she walks along the curved glass sky. |
| [Sunflower Silhouette](../gallery/sunflower-silhouette/) | A small silhouette child runs through a field of giant sunflowers at golden hour, jumping across huge petals and leaves, two-tone minimal palette of gold and deep indigo. |
| [Rust Bloom](../gallery/rust-bloom/) | A small grey robot wanders a colorless ruined city with a watering can; wherever it pours, rust turns into flowers and watercolor color washes outward across the walls. |
| [Ink Fox](../gallery/ink-fox/) | Monochrome ink-wash 3D game, black ink on white rice paper with a single red accent: a small white fox spirit with a red scarf runs and jumps along thick brush strokes that are painted in the air ahead of it as platforms, ink splashes on each landing. Side-on 3D camera. |
| [Mirror Sea](../gallery/mirror-sea/) | A boy walks barefoot across an endless mirror-calm sea at dawn; each step sends ripples that reveal faint watercolor memories of a house and a dog beneath the surface. |
| [Cloud Shepherd](../gallery/cloud-shepherd/) | Soft pastel 3D game: a shepherd with a long crook herds fluffy little clouds like sheep across a blue sky meadow, pushing them together so they merge into a rain cloud that waters a dry floating field. Third-person camera. |
| [Train Painter](../gallery/train-painter/) | Bright cartoon 3D game: a tiny steam train lays its own rail tracks in front of it as it moves, the player curves the new track left and right across green hills to reach a station on a hill. High chase camera. |
| [Hourglass](../gallery/hourglass/) | A tiny wanderer walks inside a giant glass hourglass; golden sand pours from above and piles into dunes that become her path upward toward the neck of the glass. |
