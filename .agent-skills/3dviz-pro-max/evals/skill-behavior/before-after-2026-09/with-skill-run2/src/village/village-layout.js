// village-layout.js - the authored settlement. Positions are (x, river offset): offset is metres
// from the Slowwater's centre line, negative on the terrace bank, positive on the quay bank, so a
// building keeps its relationship to the water however the meander is retuned.
// Recipe: recipe.fantasy-village-diorama - one landmark with breathing room, contrasting roof
// silhouettes, paths that connect to doors. Everything here is invented.
import { bankZ, heightAt, WATER_Y } from './terrain.js';

/** @type {Array<object>} spec fields are documented in buildings.js createBuilding(). */
export const BUILDINGS = [
  { id: 'ferryhouse', name: 'The Ferryhouse', x: -6, off: 16.5, w: 6.4, d: 5.0, storeys: 2, roof: 'gable',
    rot: Math.PI, note: 'Rope, tar and the ledger of who owes a crossing. The ferry rope is spliced on the long bench outside.' },
  { id: 'market', name: 'Nine-Ell Market', x: 4, off: 22.0, w: 10.5, d: 7.0, storeys: 1, roof: 'hip',
    rot: Math.PI + 0.06, wall: '#dccfae', note: 'A hall the width of nine ells of cloth, open on three sides. Fish before dusk, lantern paper after.' },
  { id: 'chandlery', name: 'Rushlight Chandlery', x: 13, off: 17.0, w: 5.6, d: 5.0, storeys: 2, roof: 'gable',
    rot: Math.PI - 0.12, roofTint: '#b4552b', note: 'Where the village buys its light: rush wicks, tallow, and the oiled paper every lantern here is skinned with.' },
  { id: 'granary', name: 'The Round Granary', x: -16, off: 17.5, w: 5.2, d: 5.2, storeys: 2, roof: 'cone',
    rot: 0.2, wall: '#e0d0ad', note: 'Round so the wind cannot find a corner. The cone roof lifts off in one piece at harvest.' },
  { id: 'beacon', name: "The Ferryman's Beacon", x: 18, off: 26.5, w: 6.6, d: 6.6, storeys: 4, roof: 'tiered',
    rot: Math.PI + 0.18, wall: '#e6d3ae', roofTint: '#c8642e',
    note: 'The landmark. Four tiers on the headland, and the only lamp in Lanternfall that is never allowed to go out.' },
  { id: 'teahouse', name: 'Slowwater Teahouse', x: -13, off: -5.5, w: 5.6, d: 4.4, storeys: 1, roof: 'gable',
    rot: 0.1, stilts: true, wall: '#d9c9a6', note: 'Built on stilts over the current so the floor hums. Two pots, one bench, no hurry.' },
  { id: 'netloft', name: 'The Net Loft', x: 9, off: -6.0, w: 4.6, d: 4.0, storeys: 2, roof: 'gable',
    rot: -0.14, stilts: true, roofTint: '#a85d33', note: 'Nets dry on the upper floor; the lower floor floods twice a year and nobody minds.' },
  { id: 'mill', name: 'Cormorant Mill', x: -24, off: -11.5, w: 6.0, d: 5.2, storeys: 2, roof: 'gable',
    rot: -0.22, wall: '#d6c6a4', note: 'An undershot wheel, 4.4 m across, turning on the river alone. It grinds barley and, once a week, lantern chalk.' },
  { id: 'lamplighter', name: "Lamplighter's Cottage", x: -11, off: -14.5, w: 5.2, d: 4.4, storeys: 1, roof: 'gable',
    rot: 0.16, note: 'First terrace, first light. The keepers start their round here and end it at the beacon.' },
  { id: 'potter', name: "Potter's Yard", x: -1, off: -14.5, w: 4.8, d: 4.2, storeys: 1, roof: 'hip',
    rot: -0.1, wall: '#dfcaa2', note: 'Clay from the inside of the meander. Every lantern base in the village was thrown on this wheel.' },
  { id: 'kiteloft', name: 'The Kite Loft', x: -7, off: -21.0, w: 4.2, d: 4.0, storeys: 3, roof: 'gable',
    rot: 0.24, roofTint: '#b8613a', note: 'Three narrow storeys for one wide door at the top. Paper kites go up from the terrace on the night of the first frost.' },
  { id: 'apiary', name: 'The Hill Apiary', x: 5, off: -21.5, w: 5.0, d: 4.2, storeys: 1, roof: 'hip',
    rot: -0.2, wall: '#e2d2ab', note: 'Wax for the beacon lamp. The bees are asleep; the moths outside are not.' },
  { id: 'bellhouse', name: 'The Winter Bell', x: 17, off: -15.0, w: 3.6, d: 3.6, storeys: 2, roof: 'tiered',
    rot: 0.3, roofTint: '#bd5c2f', note: 'Rung for ice, for flood, and for a boat that has not come back. Two tiers, one rope, no clock.' }
];

/** Keep-out discs for the scatter: [x, z, radius]. Derived, so a moved building moves its clearing. */
export function buildingKeepOut() {
  return BUILDINGS.map(b => [b.x, bankZ(b.x, b.off), Math.max(b.w, b.d) * 0.85 + 1.6]);
}

/** Lantern hang points in hang order: the first ten get a PointLight, the rest stay emissive-only. */
export function lanternPoints() {
  const at = (x, off, height, pole = false, intensity = 0) => ({
    x, z: bankZ(x, off), y: (Math.abs(off) < 8 ? WATER_Y : heightAt(x, bankZ(x, off))) + height,
    pole, intensity
  });
  return [
    at(18, 23.4, 11.3, false, 130), // the beacon lamp: top tier, clear of the roof, on the river side
    at(4, 18.6, 3.9),        // market eave - the brightest pool, over the busiest ground
    at(-6, 13.4, 3.4, true), // quay pole by the ferry steps
    at(-13, -5.5, 3.5),      // teahouse over the water
    at(11, 13.0, 3.3, true), // quay pole, east
    at(-24, -11.5, 3.6),     // mill gable
    at(-1, -12.2, 3.2, true),// first terrace path
    at(9, -6.0, 3.4),        // net loft
    at(5, -18.8, 3.2, true), // upper terrace path
    at(-11, -12.4, 3.3),     // lamplighter's eave
    at(13, 14.4, 3.4),       // chandlery - emissive only from here down
    at(-16, 14.8, 3.3),
    at(-7, -18.6, 3.4),
    at(17, -12.6, 3.3),
    at(-19, 13.6, 3.2, true)
  ];
}

/** Two walking routes, on ground the keepers can actually stand on. [x, z] pairs. */
export function keeperRoutes() {
  const quay = [[-18, 12.8], [-9, 12.6], [0, 12.9], [9, 12.8], [17, 13.4], [19, 20.0], [8, 21.5], [-3, 19.0], [-13, 16.0], [-19, 14.5]];
  const terrace = [[-18, -10.6], [-8, -10.9], [2, -11.0], [12, -11.6], [15, -17.5], [4, -18.6], [-6, -18.2], [-15, -15.5]];
  const toWorld = pairs => pairs.map(([x, off]) => [x, bankZ(x, off)]);
  return [
    { path: toWorld(quay), color: '#4a3f63', offset: 0.1 },
    { path: toWorld(terrace), color: '#5a4536', offset: 0.55 }
  ];
}

/** Moorings for the ferries: [x, river offset, heading]. Hull is 4.5 m - the water scale cue. */
export const MOORINGS = [[-6, 8.6, 0.12], [7, 8.2, -0.2], [-15, -7.0, 0.35]];

export const DRAKES = [
  { lane: 1, speed: 2.6, phase: 0, tint: '#2c5a52' },
  { lane: -1, speed: 2.1, phase: 41, tint: '#3d4a6b' }
];
