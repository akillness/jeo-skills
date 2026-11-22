// Skyfarer (gallery/skyfarer): run along the whale's back, jump off its tail (launch), glide arms spread
// to the next whale, land, repeat; cross the village whale (houses, mailbox) and launch again from its tail.
// Timed scenario: W forward, Shift sprint (dive in the air), Space jump / hold to glide.
// Run: node record_play.mjs "https://fal-video-to-game.vercel.app/O2_3D_SKYFARER/" skyfarer.mjs -o take.mp4
export async function play(page, { seconds, t0 }) {
  const k = page.keyboard;
  const at = async (s) => { const w = t0 + s * 1000 - Date.now(); if (w > 0) await page.waitForTimeout(w); };

  // whale 1: sprint to the tail
  await k.down('KeyW'); await k.down('ShiftLeft');
  await at(2.45);
  // jump from the tail -> launch, then hold to glide
  await k.up('ShiftLeft');
  await k.down('Space');
  await at(5.6);                 // landed on whale 2
  await k.up('Space');
  await k.down('ShiftLeft');
  await at(8.3);                 // tail of whale 2
  await k.up('ShiftLeft');
  await k.down('Space');         // launch + glide to the village whale
  await at(10.9);                // landed among the houses
  await k.up('Space');
  await at(12.9);                // running on the village whale's tail
  await k.down('Space');         // launch from the tail + glide to the next whale
  await at(seconds - 0.2);
  await k.up('Space'); await k.up('KeyW');
}
