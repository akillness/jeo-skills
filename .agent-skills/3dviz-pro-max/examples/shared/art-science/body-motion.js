// Authored display cycles; these are not measurements or tissue/pressure solvers.
export const TAU = Math.PI * 2;
export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
export const wrap = phase => phase - Math.floor(phase);
export function advanceCycle(phase, dt, cyclesPerMinute, playing = true) {
  return playing ? wrap(phase + Math.max(0, dt) * cyclesPerMinute / 60) : phase;
}
export function armCycle(phase) {
  const p = wrap(phase), flex = .5 - .5 * Math.cos(TAU * p);
  return {angle: 80 * flex, flex, stage: p < .5 ? 'Flexion' : 'Extension'};
}
export function breathingCycle(phase) {
  const p = wrap(phase), inhaling = p < .4;
  const expansion = inhaling ? .5 - .5 * Math.cos(Math.PI * p / .4)
    : .5 + .5 * Math.cos(Math.PI * (p - .4) / .6);
  return {expansion, inhaling, stage: inhaling ? 'Inspiration' : 'Passive expiration'};
}
function pulse(p, start, end) {
  return p <= start || p >= end ? 0 : Math.sin(Math.PI * (p - start) / (end - start)) ** 2;
}
export function cardiacCycle(phase) {
  const p = wrap(phase);
  return {atrial: pulse(p, 0, .16), ventricular: pulse(p, .17, .53),
    stage: p < .16 ? 'Atrial phase' : p < .53 ? 'Ventricular phase' : 'Relaxation / filling'};
}
// One continuous field is shared by registered parts; the upper vessel roots stay quiet.
export function heartPose(x, y, z, region) {
  const w = region === 'ventricular' ? 1 - smooth((y + .5) / 1.6)
    : Math.exp(-(((y - .55) / .55) ** 2)) * smooth((y + .25) / .45);
  const squeeze = (region === 'ventricular' ? .075 : .025) * w;
  return [x * (1 - squeeze), y + (.95 - y) * squeeze * .38, z * (1 - squeeze)];
}
export function lungPose(x, y, z) {
  const lower = 1 - smooth((y + 1.8) / 3.8);
  return [x * (1.075 + .035 * lower), y - .22 * lower, z * (1.07 + .035 * lower)];
}
