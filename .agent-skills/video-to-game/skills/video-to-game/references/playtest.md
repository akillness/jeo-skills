# Play your own game

A game nobody played is a scene. The agent plays it, films it, watches the film and fixes what a player would hit.
The same takes become the trailer.

## Write a scenario

`templates/play.mjs` exports `async function play(page, { seconds, t0 })`:

- **Keyboard and mouse only** (`page.keyboard.down/up/press`), like a player.
- **Read what a player sees** through `window.__game.state` (position, speed, grounded, next gap or target)
  to time jumps and turns. Never write into the game, never teleport the hero.
- **Play well**: keep moving forward, sprint and boost when the game has them, jump at the right moment, never
  fall, never run into a wall, never walk backwards, no menu in the middle.
- **Show every mechanic**, and bring the video's key moment to the center of the frame early in the take.
- Use the game's own URL parameters (`?autostart`, `?seed=7`, `?x=120`) to start close to the action. A built-in
  autopilot is fine only if it plays naturally; otherwise it fights your keys.

## Record and pick

```bash
python3 -m http.server 8000 &                                   # from the game folder
node scripts/record_play.mjs "http://127.0.0.1:8000/?autostart&seed=7" play.mjs -o take.mp4 --seconds 18
python3 scripts/best_window.py take.mp4 --length 10 --top 3     # liveliest windows
python3 scripts/best_window.py take.mp4 --length 3 --cut best.mp4
```

The recorder captures every frame with its real timestamp and encodes it at that pace, so the take shows the true
frame rate (it prints it, with the console errors). `best_window.py` ranks windows by how much the picture changes;
then extract a frame every 0.25 s of the winner and look at every one. Reject a window if a single frame shows a
title or tip text, a cut-off or tiny hero, a shaking camera, a fall, a step back or a glitch.

## What to fix after watching

- A dead second: the level is too empty there, or the scenario waits too long.
- The key moment happens off-center or too late: move the trigger, adjust the camera, start closer.
- A fall or a wall: the level design punishes the obvious path; fix the level before the scenario.
- A frame drop: find the effect or the draw calls behind it.

Up to five takes per game is normal. Keep the best one, and write in the README which take and window it is.
