# Skyfarer

![Skyfarer: the generated video (left) and the game (right)](poster.gif)

**Play it:** [fal-video-to-game.vercel.app/O2_3D_SKYFARER/](https://fal-video-to-game.vercel.app/O2_3D_SKYFARER/)

**Video prompt** (MiniMax H3 Max, `minimax/h3-max/text-to-video`):

> Courier boy running and gliding between giant flying whales above the clouds.

**Controls:** WASD / arrows run · Shift sprint / dive · Space jump (from the whale's tail = big launch) · hold Space in the air to glide · click to look around · R respawn · M sound

**Assets generated on fal:** 16 images, 8 3D models, 9 sounds and music,
30 calls, 8.93 USD.

| Endpoint | Calls |
|---|---|
| `fal-ai/nano-banana-pro/edit` | 8 |
| `fal-ai/elevenlabs/sound-effects/v2` | 8 |
| `meshy/v7.1/image-to-3d` | 6 |
| `fal-ai/nano-banana-pro` | 3 |
| `fal-ai/birefnet/v2` | 2 |
| `meshy/v7.1/multi-image-to-3d` | 1 |
| `fal-ai/meshy/rigging/multi-animation` | 1 |
| `elevenlabs/music/v2.5` | 1 |

**Code:** [`game/`](game/), written by Claude Opus 5.5 with Three.js only. The assets are not in this repository
(the full game is about 10 to 100 MB); play it at the link above.
