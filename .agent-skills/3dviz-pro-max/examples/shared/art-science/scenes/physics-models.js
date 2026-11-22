const TAU = Math.PI * 2;
export const MU0 = 4e-7 * Math.PI;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export function doublePendulumDerivative(state, params = {}) {
  const [a1, w1, a2, w2] = state;
  const { m1 = 1, m2 = 1, l1 = 1, l2 = 1, g = 9.81 } = params;
  const delta = a1 - a2;
  const common = 2 * m1 + m2 - m2 * Math.cos(2 * delta);
  if (![...state, m1, m2, l1, l2, g, common].every(Number.isFinite) || m1 <= 0 || m2 <= 0 || l1 <= 0 || l2 <= 0 || common <= 1e-9) {
    throw new RangeError('finite positive double-pendulum parameters required');
  }
  const aa1 = (-g * (2 * m1 + m2) * Math.sin(a1)
    - m2 * g * Math.sin(a1 - 2 * a2)
    - 2 * m2 * Math.sin(delta) * (w2 * w2 * l2 + w1 * w1 * l1 * Math.cos(delta))) / (l1 * common);
  const aa2 = (2 * Math.sin(delta) * (w1 * w1 * l1 * (m1 + m2)
    + g * (m1 + m2) * Math.cos(a1)
    + w2 * w2 * l2 * m2 * Math.cos(delta))) / (l2 * common);
  return [w1, aa1, w2, aa2];
}

export function rk4Step(state, dt, derivative, params) {
  const add = (base, k, scale) => base.map((value, i) => value + k[i] * scale);
  const k1 = derivative(state, params);
  const k2 = derivative(add(state, k1, dt / 2), params);
  const k3 = derivative(add(state, k2, dt / 2), params);
  const k4 = derivative(add(state, k3, dt), params);
  return state.map((value, i) => value + dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
}

export function doublePendulumEnergy(state, params = {}) {
  const [a1, w1, a2, w2] = state;
  const { m1 = 1, m2 = 1, l1 = 1, l2 = 1, g = 9.81 } = params;
  const kinetic = 0.5 * (m1 + m2) * l1 * l1 * w1 * w1
    + 0.5 * m2 * l2 * l2 * w2 * w2
    + m2 * l1 * l2 * w1 * w2 * Math.cos(a1 - a2);
  const potential = -(m1 + m2) * g * l1 * Math.cos(a1) - m2 * g * l2 * Math.cos(a2);
  return kinetic + potential;
}

function normalize2(v) {
  const length = Math.hypot(v[0], v[1]);
  if (!Number.isFinite(length) || length <= 1e-12) throw new RangeError('nonzero finite direction required');
  return [v[0] / length, v[1] / length];
}

export function refract2(direction, towardNextMedium, nFrom, nTo) {
  const d = normalize2(direction);
  const n = normalize2(towardNextMedium);
  const tangent = [-n[1], n[0]];
  const tangential = (d[0] * tangent[0] + d[1] * tangent[1]) * nFrom / nTo;
  if (Math.abs(tangential) > 1) return null;
  const normalPart = Math.sqrt(Math.max(0, 1 - tangential * tangential));
  return normalize2([tangent[0] * tangential + n[0] * normalPart, tangent[1] * tangential + n[1] * normalPart]);
}

export function reflect2(direction, normal) {
  const d = normalize2(direction);
  const n = normalize2(normal);
  const projection = d[0] * n[0] + d[1] * n[1];
  return normalize2([d[0] - 2 * projection * n[0], d[1] - 2 * projection * n[1]]);
}

function rayEdge(origin, direction, a, b) {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const det = direction[0] * ey - direction[1] * ex;
  if (Math.abs(det) < 1e-10) return null;
  const ax = a[0] - origin[0], ay = a[1] - origin[1];
  const t = (ax * ey - ay * ex) / det;
  const u = (ax * direction[1] - ay * direction[0]) / det;
  return t > 1e-7 && u >= -1e-8 && u <= 1 + 1e-8 ? { t, point: [origin[0] + t * direction[0], origin[1] + t * direction[1]] } : null;
}

export function tracePrismRay({ origin = [-3, 0.2], direction = [1, 0], index = 1.5, outsideIndex = 1, vertices = [[-1.5, -1], [1.5, -1], [0, 1.6]], maxBounces = 3 } = {}) {
  let p = [...origin], d = normalize2(direction), inside = false, lastEdge = -1;
  const points = [[...p]], events = [];
  for (let step = 0; step < maxBounces + 2; step += 1) {
    let hit = null;
    for (let i = 0; i < vertices.length; i += 1) {
      if (i === lastEdge) continue;
      const candidate = rayEdge(p, d, vertices[i], vertices[(i + 1) % vertices.length]);
      if (candidate && (!hit || candidate.t < hit.t)) hit = { ...candidate, edge: i };
    }
    if (!hit) {
      points.push([p[0] + d[0] * 3.5, p[1] + d[1] * 3.5]);
      break;
    }
    points.push(hit.point);
    const a = vertices[hit.edge], b = vertices[(hit.edge + 1) % vertices.length];
    const outward = normalize2([b[1] - a[1], -(b[0] - a[0])]);
    const next = refract2(d, inside ? outward : [-outward[0], -outward[1]], inside ? index : outsideIndex, inside ? outsideIndex : index);
    if (next) {
      d = next; inside = !inside; events.push(inside ? 'enter' : 'exit');
    } else {
      d = reflect2(d, outward); events.push('tir');
    }
    p = [hit.point[0] + d[0] * 1e-6, hit.point[1] + d[1] * 1e-6];
    lastEdge = hit.edge;
    if (!inside) {
      points.push([p[0] + d[0] * 3.5, p[1] + d[1] * 3.5]);
      break;
    }
  }
  return { points, events };
}

export function besselJ(order, x) {
  if (!Number.isInteger(order) || order < 0 || !Number.isFinite(x)) throw new RangeError('valid Bessel order and argument required');
  let factorial = 1;
  for (let i = 2; i <= order; i += 1) factorial *= i;
  let term = Math.pow(x / 2, order) / factorial;
  let sum = term;
  for (let k = 1; k < 28; k += 1) {
    term *= -(x * x / 4) / (k * (k + order));
    sum += term;
    if (Math.abs(term) < 1e-14) break;
  }
  return sum;
}

export const MEMBRANE_MODES = Object.freeze({
  '0,1': { m: 0, n: 1, zero: 2.4048255577 },
  '1,1': { m: 1, n: 1, zero: 3.8317059702 },
  '2,1': { m: 2, n: 1, zero: 5.1356223018 },
  '0,2': { m: 0, n: 2, zero: 5.5200781103 },
});

export function membraneFrequency({ zero, radius, tension, density }) {
  if ([zero, radius, tension, density].some(v => !Number.isFinite(v)) || radius <= 0 || tension <= 0 || density <= 0) throw new RangeError('positive membrane parameters required');
  return zero * Math.sqrt(tension / density) / (TAU * radius);
}

export function membraneModeValue(mode, radialFraction, angle) {
  const radial = clamp(radialFraction, 0, 1);
  return besselJ(mode.m, mode.zero * radial) * Math.cos(mode.m * angle);
}

export function magneticFieldLoop(point, { radius = 1, current = 1, segments = 96 } = {}) {
  if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite) || radius <= 0 || !Number.isFinite(current) || !Number.isInteger(segments) || segments < 12) throw new RangeError('valid loop field inputs required');
  const field = [0, 0, 0];
  for (let i = 0; i < segments; i += 1) {
    const step = TAU / segments, angle = (i + 0.5) * step;
    // Midpoint quadrature on the circular parametrization, not on an inscribed polygon.
    const mid = [radius * Math.cos(angle), radius * Math.sin(angle), 0];
    const dl = [-radius * Math.sin(angle) * step, radius * Math.cos(angle) * step, 0];
    const r = [point[0] - mid[0], point[1] - mid[1], point[2] - mid[2]];
    const r2 = r[0] ** 2 + r[1] ** 2 + r[2] ** 2;
    if (r2 < radius * radius * 1e-6) continue;
    const factor = MU0 * current / (4 * Math.PI * Math.pow(r2, 1.5));
    field[0] += (dl[1] * r[2] - dl[2] * r[1]) * factor;
    field[1] += (dl[2] * r[0] - dl[0] * r[2]) * factor;
    field[2] += (dl[0] * r[1] - dl[1] * r[0]) * factor;
  }
  return field;
}

export function differentialSpeeds(carrier, bias) {
  if (!Number.isFinite(carrier) || !Number.isFinite(bias)) throw new RangeError('finite differential speeds required');
  return { left: carrier + bias, right: carrier - bias, carrier };
}

export function solveKepler(meanAnomaly, eccentricity, iterations = 10) {
  if (!Number.isFinite(meanAnomaly) || !Number.isFinite(eccentricity) || eccentricity < 0 || eccentricity >= 1) throw new RangeError('elliptic Kepler inputs required');
  let E = meanAnomaly;
  for (let i = 0; i < iterations; i += 1) {
    const denominator = 1 - eccentricity * Math.cos(E);
    E -= (E - eccentricity * Math.sin(E) - meanAnomaly) / denominator;
  }
  return E;
}

export function keplerPosition({ semiMajor, eccentricity, meanAnomaly }) {
  const E = solveKepler(meanAnomaly, eccentricity);
  return {
    x: semiMajor * (Math.cos(E) - eccentricity),
    y: semiMajor * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(E),
    eccentricAnomaly: E,
  };
}
