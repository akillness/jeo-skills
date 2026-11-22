// Playtest scenario for record_play.mjs: play the game like a good player, with the keyboard only.
//   node scripts/record_play.mjs "http://127.0.0.1:8000/?autostart&seed=7" templates/play.mjs -o take.mp4
//
// Read what the player would see (window.__game.state), decide, press keys. Never write into the game.
// Rules: always moving forward, never fall, never back into a wall, trigger every mechanic of the game
// where it looks best, and bring the key moment of the video to the center of the frame.
export async function play(page, { seconds, t0 }) {
  const k = page.keyboard;
  const state = () => page.evaluate(() => window.__game?.state);
  const end = t0 + seconds * 1000 - 150;

  if ((await state())?.phase === 'title') await k.press('Enter');
  await k.down('ArrowUp');                       // run forward the whole take
  let lastJump = 0;
  while (Date.now() < end) {
    const s = await state();
    if (!s) break;
    // jump on a rhythm while grounded, so the take shows the mechanic, not a straight walk
    if (s.grounded && Date.now() - lastJump > 900) {
      await k.down('Space'); await page.waitForTimeout(140); await k.up('Space');
      lastJump = Date.now();
    }
    // weave a little to show the world around the hero, never more than a step to a side
    const side = Math.sin((Date.now() - t0) / 700) > 0.6 ? 'ArrowRight' : Math.sin((Date.now() - t0) / 700) < -0.6 ? 'ArrowLeft' : null;
    for (const key of ['ArrowLeft', 'ArrowRight']) await (key === side ? k.down(key) : k.up(key));
    await page.waitForTimeout(50);
  }
  for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowRight']) await k.up(key);
}
