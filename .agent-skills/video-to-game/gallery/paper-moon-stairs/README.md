# Paper Moon Stairs

![Paper Moon Stairs: the generated video (left) and the game (right)](poster.gif)

**Play it:** [fal-video-to-game.vercel.app/A02_PAPER-MOON-STAIRS/](https://fal-video-to-game.vercel.app/A02_PAPER-MOON-STAIRS/)

**Video prompt** (MiniMax H3 Max, `minimax/h3-max/text-to-video`):

> A girl in a long white dress climbs a staircase of drifting paper lanterns into a pastel night sky; each lantern she touches rises and becomes a star.

**Controls:** ← → walk (the stairs climb themselves) · Space / ↑ jump · touch a lantern to turn it into a star · M sound · R restart

**Assets generated on fal:** 11 images, 2 3D models, 1 sounds and music,
16 calls, 6.13 USD.

| Endpoint | Calls |
|---|---|
| `fal-ai/nano-banana-pro/edit` | 13 |
| `fal-ai/meshy/rigging/multi-animation` | 1 |
| `fal-ai/nano-banana-pro` | 1 |
| `elevenlabs/music/v2.5` | 1 |

**Code:** [`game/`](game/), written by Claude Opus 5.5 with Three.js only. The assets are not in this repository
(the full game is about 10 to 100 MB); play it at the link above.
