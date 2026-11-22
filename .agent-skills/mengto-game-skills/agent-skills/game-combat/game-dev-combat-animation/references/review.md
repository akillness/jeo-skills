# Capturing and reviewing

## Captures (Thornvigil, in-app browser)

Install the tools into the checkout (`scripts/install.sh`), start the receiver, open the host page, and evaluate the helpers there:

```js
await (0, eval)(await (await fetch('/.dream-loop/moves/setup.js?' + Date.now())).text()); // __seqT (Characters page)
await (0, eval)(await (await fetch('/.dream-loop/moves/play.js?' + Date.now())).text()); // __play (in play)
await (0, eval)(await (await fetch('/.dream-loop/moves/shot.js?' + Date.now())).text()); // __shot (full 2880x1800 still)
const fr = Array.from({ length: 25 }, (_, i) => i / 24), crop = { crop: [700, 0, 1480, 1800], fractions: true }, pcrop = [1080, 540, 720, 800];
window.__cap([
  __seqT('r1-knight-attack', 'knight', fr, { ...crop, move: 'attack' }),       // 25 frames evenly across the move
  __play('p1-knight-light', 'knight', 'light', { frames: 30, crop: pcrop }),   // every frame at 30 fps, frame 0 = start
  __shot('cl-knight-follow', 'knight', 'light', .5),                           // changelog still at 0.5 s
  __seqT('cl-archer-set', 'archer', [.22], { crop: [0, 0, 2880, 1800], fractions: true, move: 'long_hit' }),
]); 'started'
```

- **Characters-page moves** are `attack` (quick) and `long_hit` (heavy or power) for both classes.
- **In-play actions** are `light` and `heavy`. For a bow these map to `shoot` and `powerShot`.
- **Frame counts** for every in-play frame: knight light 30, heavy 50; archer light 32, heavy 50.
- **Waiting.** Wait on `receiver.log` for the last name's `-last` line: `until grep -q "<name>-last" receiver.log; do sleep 5; done`.
- **Is the capture new?** Diff one frame against the previous round (`ImageChops.difference(...).getbbox()`).

## Sheets

- `python3 msheet.py <prefix> "<title>"`: Characters page, 25 frames plus close-ups of frames 6, 10, 14 and 18.
- `python3 psheet.py <prefix> <frames> "<title>"`: in play, every frame.
- Look at them yourself first. Then crop the frames that matter at full resolution: the contact, the hold, the frame after the loose, the follow-through.

## Scoring

1. **Two blind critics,** spawned once per pass with names (`move-critic-a`, `move-critic-b`). Use `templates/critic-prompt.md`: benchmark Diablo IV, Baldur's Gate 3 and Elden Ring; five criteria at 0–2 each; the lower of the two scores counts. Later rounds go to the same critics by `SendMessage`, so their scale holds.
2. **Blind A/B against the last release.**
   - Build both versions' sheets with identical titles, then run `ab-pack.py`.
   - Spawn a fresh judge with `templates/ab-judge-prompt.md`, asking about arms and hands, and overall.
   - Unblind with the key file. This is the most reliable answer to "is it better?"
3. **Verify every claim** before changing anything:
   - Crop the cited frames at full resolution.
   - For "locked", "behind" or "flung" claims, read the joint numbers (`armcheck … trace`, `anchor.mjs`, or the live rig).
   - Note which claims were misreads.
4. **Report** using the lower score per item, before → after, and the A/B tally. Name the faults still open. Never round up.

Benchmarks from 2026-10-01: final scores, lower of the two critics:
- Characters page: knight 5 (quick) and 6 (heavy); archer 6 (quick) and 4 (power).
- In play: knight 6 and 5; archer 6 and 6.
- The 8/10 target was not reached. The open faults are all body and timing issues; the arms passed.

## Videos

To capture real-time sequences on both surfaces at 30 fps on the move's clock:
- The Characters page needs `__seqT` with times in **seconds**, `i/30` for `i = 0..round(T·30)`, and `fractions` false.
- In play, `__play` frames are already at 30 fps.

Then build and send the video:

```bash
python3 vidcompose.py knight-moves "Knight · Quick strike|v-knight-attack|p1-knight-light" "Knight · Heavy strike|v-knight-long_hit|p1-knight-heavy"
swift encode.swift vid/knight-moves f- 30 vid/knight-moves.mp4
```

Send the MP4 with `SendUserFile` (absolute path) and give its byte size.
