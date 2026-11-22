// Turn anatomical key intents into hand targets and check them against the arm rules before baking.
// Intents are in the body frame of the reference body (+X the body's left, +Y up, +Z forward):
//   u = upper-arm direction (shoulder -> elbow), f = forearm direction (elbow -> wrist), b = blade.
// The hand target is shoulder + L1*u + L2*f; the elbow (pole) key is u itself.
//   node keydesign.mjs R '[-.15,-.45,.88]' '[.12,.05,.99]' '[.5,-.45,.74]'
//   import { key } from './keydesign.mjs'
// Flags: raise > 100 (keep a margin under the 105 test), flex > 140 or < 12, blade outside 25..115
// degrees off the forearm (a straight wrist holds a sword ~70 degrees off it; the capped wrist cannot
// reach beyond that band, and an unreachable blade lands wherever the forearm roll leaves it).
// L1, L2 and the shoulders are the Thornvigil HumGen reference body; measure another rig's with at.mjs.
const L1 = .254, L2 = .249, S = { R: [-.177, 1.36, -.045], L: [.176, 1.36, -.041] };
const n = v => { const l = Math.hypot(...v);return v.map(x => x / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const deg = x => Math.acos(Math.max(-1, Math.min(1, x))) * 180 / Math.PI;
export function key(side, u, f, b) {
  u = n(u);f = n(f);
  const hand = S[side].map((s, i) => +(s + L1 * u[i] + L2 * f[i]).toFixed(3));
  const raise = deg(-u[1]), flex = deg(dot(u, f)), blade = b ? deg(dot(n(b), f)) : null, reach = Math.hypot(...hand.map((h, i) => h - S[side][i])) / (L1 + L2);
  const issues = [raise > 100 && 'raise ' + raise.toFixed(0), flex > 140 && 'flex ' + flex.toFixed(0), flex < 12 && 'locked ' + flex.toFixed(0), b && (blade < 25 || blade > 115) && 'blade/forearm ' + blade.toFixed(0)].filter(Boolean);
  return { hand, elbow: u.map(x => +x.toFixed(2)), raise: +raise.toFixed(0), flex: +flex.toFixed(0), blade: blade && +blade.toFixed(0), reach: +reach.toFixed(2), issues };
}
if (process.argv[1]?.endsWith('keydesign.mjs') && process.argv.length > 3) {
  // Vectors as '[-.2,-.55,.81]' (leading zeros optional).
  const [side, u, f, b] = process.argv.slice(2), vec = s => s.match(/-?\d*\.?\d+/g).map(Number);
  console.log(JSON.stringify(key(side, vec(u), vec(f), b ? vec(b) : null)));
}
