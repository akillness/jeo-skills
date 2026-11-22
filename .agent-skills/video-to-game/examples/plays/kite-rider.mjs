// Kite Rider (gallery/kite-rider): fly over the lake, dive, skim the water (spray, wake, skim gates), then climb
// on a wind gust (Space) between the wind turbines toward the next gate.
// Keyboard only (arrows + Space). It reads window.__game, exposed by the game, to decide the keys, like a
// player looking at the screen.
// Run: node record_play.mjs "https://fal-video-to-game.vercel.app/S16_KITE-RIDER/?autostart&startz=-1350" kite-rider.mjs -o take.mp4

const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

function sense(avoidUpdraft) {
  const g = window.__game, W = window.WORLD;
  if (!g) return null;
  const P = g.player;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  const gi = g.gates.findIndex((x) => !x.passed && !x.missed && x.z < P.pos.z - 5);
  const gate = gi >= 0 ? g.gates[gi] : null;
  let tx, ty, tz;
  if (gate) { tx = gate.x; ty = gate.y; tz = gate.z; } else { tz = P.pos.z - 200; tx = W.riverX(tz); ty = 40; }
  // the updraft at the end of the lake pushes up: go around it to be able to dive
  const prev = gi > 0 ? g.gates[gi - 1] : null;
  let upd = null;
  if (avoidUpdraft && prev && prev.type === 'skim' && gate.type !== 'skim') {
    const ux = prev.x + (gate.x - prev.x) * 0.45, uz = prev.z + (gate.z - prev.z) * 0.45;
    const lx = -(gate.z - prev.z), lz = gate.x - prev.x, ll = Math.hypot(lx, lz);
    const nx = lx / ll, nz = lz / ll;                       // normal to the skim line -> gate
    const off = (P.pos.x - ux) * nx + (P.pos.z - uz) * nz;
    const sgn = off >= 0 ? 1 : -1;
    upd = { dist: Math.hypot(P.pos.x - ux, P.pos.z - uz), ahead: P.pos.z - uz };
    if (P.pos.z - uz > 30) { tx = ux + nx * sgn * 36; tz = uz + nz * sgn * 36; }
  }
  const dx = tx - P.pos.x, dz = tz - P.pos.z;
  const want = Math.atan2(-dx, -dz);
  let dYaw = want - P.yaw; while (dYaw > Math.PI) dYaw -= 2 * Math.PI; while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
  let steer = Math.max(-1, Math.min(1, -dYaw * 2.4));
  // steer around the slalom turbine and the masts on the path
  for (const t of g.turbines) {
    if (t.gate && !t.slalom) continue;
    const ox = t.x - P.pos.x, oz = t.z - P.pos.z;
    const ahead = ox * fx + oz * fz;
    if (ahead < 0 || ahead > 140) continue;
    const lat = ox * -fz + oz * fx;
    if (Math.abs(lat) < t.s * 33 + 12 && P.pos.y < t.y + t.s * 74 * 1.05 + t.s * 33) steer += (lat > 0 ? -1 : 1) * 1.4 * (1 - ahead / 140);
  }
  // terrain ahead (water needs no margin)
  let clear = 0, landDist = 999;
  for (let d = 10; d <= 260; d += 10) {
    const h = W.heightAt(P.pos.x + fx * d, P.pos.z + fz * d);
    if (h > -0.3 && landDist === 999) landDist = d;
    if (d <= 90) clear = Math.max(clear, h > 0 ? h + 12 : 1.6);
  }
  const below = W.heightAt(P.pos.x, P.pos.z);
  return {
    st: g.state(), x: P.pos.x, y: P.pos.y, z: P.pos.z, sp: P.speed, wind: P.wind, skim: P.skim, crash: P.crashT,
    boosting: P.boosting, steer, clear, landDist, below, el: g.G.elapsed, score: Math.floor(g.G.score), gates: g.G.gatesPassed,
    gate: gate ? { type: gate.type, y: gate.y, dist: Math.hypot(gate.x - P.pos.x, gate.z - P.pos.z) } : null, upd,
  };
}

export async function play(page, { seconds, t0 }) {
  const held = new Set();
  const set = async (k, on) => {
    if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); }
    else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); }
  };
  // start the game if the title screen is still up
  let s = await page.evaluate(sense, false);
  if (!s || s.st !== 'play') { await page.keyboard.press('Enter'); await page.waitForTimeout(300); }

  // dive1 -> skim1 (skim gate) -> hop -> dive2 -> skim2 -> climb (gust between the turbines) -> fly
  let phase = 'dive1';
  let lastLog = 0;
  const end = t0 + seconds * 1000 - 120;
  while (Date.now() < end) {
    s = await page.evaluate(sense, phase === 'hop' || phase === 'dive2' || phase === 'skim1');
    if (!s) { await page.waitForTimeout(50); continue; }
    const ms = Date.now() - t0;
    let up = false, down = false, boost = false;
    const gd = s.gate ? s.gate.dist : 999, gtype = s.gate ? s.gate.type : '-';
    const skimHold = () => { if (s.y < 0.8) up = true; else if (s.y > 1.7) down = true; };

    if (phase === 'dive1') {
      down = true;
      if (s.y < 7) phase = 'skim1';
    }
    if (phase === 'skim1') {
      skimHold();
      if (gtype !== 'skim' && gd < 215) phase = 'hop';
    }
    if (phase === 'hop') {
      up = s.y < 20;
      if (gd < 158) phase = 'dive2';
    }
    if (phase === 'dive2') {
      down = true; boost = s.wind > 0.55;
      if (s.y < 6) phase = 'skim2';
    }
    if (phase === 'skim2') {
      skimHold();
      if (gd < 62 || s.landDist < 40) phase = 'climb';
    }
    if (phase === 'climb') {
      boost = s.wind > 0.02;
      const ty = s.gate ? s.gate.y : 40;
      if (s.y < ty - 2 || s.y < s.clear) up = true; else if (s.y > ty + 4) down = true;
      if (s.gates >= 2 && s.wind <= 0.02) phase = 'fly';
    }
    if (phase === 'fly') {
      const ty = s.gate ? s.gate.y : 40;
      if (s.y < Math.max(ty - 2, s.clear)) up = true; else if (s.y > ty + 4) down = true;
      boost = s.wind > 0.5;
    }

    await set('ArrowUp', up);
    await set('ArrowDown', down && !up);
    await set('ArrowRight', s.steer > 0.22);
    await set('ArrowLeft', s.steer < -0.22);
    await set('Space', boost);

    if (ms - lastLog > 400) {
      lastLog = ms;
      console.log(`t=${(ms / 1000).toFixed(1)} ${phase} st=${s.st} y=${s.y.toFixed(1)} z=${s.z.toFixed(0)} sp=${s.sp.toFixed(0)} wind=${s.wind.toFixed(2)} skim=${s.skim.toFixed(1)} land=${s.landDist} below=${s.below.toFixed(1)} gate=${s.gate ? s.gate.type + '@' + s.gate.dist.toFixed(0) + ' y' + s.gate.y.toFixed(0) : '-'} gates=${s.gates} crash=${s.crash.toFixed(1)} score=${s.score} upd=${s.upd ? s.upd.dist.toFixed(0) : '-'} boost=${s.boosting.toFixed(1)}`);
    }
    await page.waitForTimeout(25);
  }
  for (const k of KEYS) await set(k, false);
}
