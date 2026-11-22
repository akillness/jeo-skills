import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MU0, MEMBRANE_MODES, besselJ, differentialSpeeds, doublePendulumDerivative,
  doublePendulumEnergy, keplerPosition, magneticFieldLoop, membraneFrequency,
  reflect2, refract2, rk4Step, solveKepler, tracePrismRay,
} from './physics-models.js';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);

test('fixed-step RK4 preserves the conservative double-pendulum energy closely', () => {
  const params = { m1: 1, m2: 0.82, l1: 1.02, l2: 0.92, g: 9.81 };
  let state = [2.05, 0, 1.98, 0];
  const initial = doublePendulumEnergy(state, params);
  for (let i = 0; i < 960; i += 1) state = rk4Step(state, 1 / 480, doublePendulumDerivative, params);
  const final = doublePendulumEnergy(state, params);
  assert.ok(state.every(Number.isFinite));
  assert.ok(Math.abs((final - initial) / initial) < 2e-6);
});

test('Snell refraction preserves the tangential index product and TIR reflects', () => {
  const incident = [Math.sin(0.55), Math.cos(0.55)];
  const refracted = refract2(incident, [0, 1], 1, 1.5);
  near(incident[0], 1.5 * refracted[0], 1e-10);
  assert.equal(refract2([Math.sin(0.9), Math.cos(0.9)], [0, 1], 1.5, 1), null);
  const reflected = reflect2([0.6, 0.8], [0, 1]);
  near(reflected[0], 0.6); near(reflected[1], -0.8);
  const path = tracePrismRay({ index: 1.52 });
  assert.equal(path.events[0], 'enter');
  assert.ok(path.events.includes('exit') || path.events.includes('tir'));
});

test('circular membrane roots close the rim and frequency follows sqrt tension over density', () => {
  for (const mode of Object.values(MEMBRANE_MODES)) near(besselJ(mode.m, mode.zero), 0, 2e-9);
  const mode = MEMBRANE_MODES['1,1'];
  const base = membraneFrequency({ zero: mode.zero, radius: 1.45, tension: 40, density: 0.4 });
  const doubledWaveSpeed = membraneFrequency({ zero: mode.zero, radius: 1.45, tension: 160, density: 0.4 });
  near(doubledWaveSpeed, 2 * base, 1e-10);
});

test('Biot-Savart loop quadrature matches the axial center field and reverses with current', () => {
  const radius = 1.12, current = 7.5;
  const positive = magneticFieldLoop([0, 0, 0], { radius, current, segments: 1024 });
  const negative = magneticFieldLoop([0, 0, 0], { radius, current: -current, segments: 1024 });
  near(positive[0], 0, 1e-15); near(positive[1], 0, 1e-15);
  near(positive[2], MU0 * current / (2 * radius), 2e-11);
  near(negative[2], -positive[2], 1e-15);
});

test('equal-side differential preserves the carrier average exactly', () => {
  for (const [carrier, bias] of [[1.1, 0.55], [-0.8, 1.4], [0, -1]]) {
    const speeds = differentialSpeeds(carrier, bias);
    near((speeds.left + speeds.right) / 2, carrier);
    near(speeds.left - speeds.right, 2 * bias);
  }
});

test('Kepler solve satisfies M = E - e sin E and coordinates use one focus', () => {
  for (const eccentricity of [0, 0.0167, 0.2056, 0.8]) {
    const mean = 2.3;
    const E = solveKepler(mean, eccentricity);
    near(E - eccentricity * Math.sin(E), mean, 1e-12);
  }
  const circular = keplerPosition({ semiMajor: 2, eccentricity: 0, meanAnomaly: Math.PI / 2 });
  near(circular.x, 0, 1e-12); near(circular.y, 2, 1e-12);
});
