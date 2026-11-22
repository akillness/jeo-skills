// village-model.js - the authoritative state of Emberfall. Everything the viewer can select or
// read comes from here; the meshes only display it. Add a building by adding a record: the
// selector list, the picker, the panel copy and the lane it stands on all read this file.
//
// Fiction, not record: Emberfall is invented. Nothing here is a historical or structural claim.
//
// The programs follow knowledge.reasoning-settlement-function-variation - each building differs by
// what happens inside it (a wheel needs water, a forge needs a flue, a store needs a dry floor),
// not by random jitter of one prototype.

export const BUILDINGS = [
  {
    id: 'beacon', name: 'The Ember Beacon', kind: 'beacon', landmark: true,
    x: -2, z: -6, rotation: 0.35, footprint: [7.2, 7.2], selectRadius: 6.4, clear: 15,
    program: 'Beacon keeping',
    consumes: 'Emberlight gathered from the woods at dusk',
    produces: 'One steady light the valley steers by',
    site: 'The knoll: the only ground every lane can see.',
    tell: 'A hollow stump 7 m across with a burning crown - the one round mass in a village of gables.'
  },
  {
    id: 'hearth', name: 'Hearth Hall', kind: 'hall',
    x: 6, z: 2, rotation: -0.62, footprint: [9, 5.4], selectRadius: 6,
    program: 'Gathering and feeding',
    consumes: 'Grain from the store, fuel from the smithy yard',
    produces: 'The evening meal and the village’s decisions',
    site: 'The widest terrace, where four lanes meet.',
    tell: 'One long low ridge, a 2.0 m doorway wide enough for two, and a porch of hanging lanterns.'
  },
  {
    id: 'mill', name: 'Glimmer Mill', kind: 'mill',
    x: 12.5, z: 10.5, rotation: -0.785, footprint: [5.2, 4.6], selectRadius: 5.4,
    program: 'Grinding ember-glass',
    consumes: 'Pond water on the wheel, raw ember from the ridge',
    produces: 'Ground glimmer - the dust that keeps the lanterns lit',
    site: 'The lowest terrace, because the wheel must reach the water.',
    tell: 'A 4.4 m wheel on a projecting axle, dipping into the pond.'
  },
  {
    id: 'smithy', name: 'Coalwright’s Smithy', kind: 'smithy',
    x: 2, z: 12, rotation: 0.28, footprint: [5.6, 4.8], selectRadius: 5.4,
    program: 'Iron and lantern frames',
    consumes: 'Charcoal, scrap iron',
    produces: 'Lantern frames, hoops, tools',
    site: 'Downwind of the houses, on the lane out, with a yard it can spill into.',
    tell: 'A squat stone shell, a flue twice the height of its roof, and an open working yard.'
  },
  {
    id: 'store', name: 'The Dry Store', kind: 'granary',
    x: -9, z: 14, rotation: -0.18, footprint: [4.6, 4.2], selectRadius: 4.8,
    program: 'Keeping grain dry',
    consumes: 'The harvest brought up the low lane',
    produces: 'Flour and seed held through the wet months',
    site: 'Beside the road out, so a cart never enters the village to load.',
    tell: 'Floor lifted on six staddle stones and a hoist beam projecting over the lane.'
  },
  {
    id: 'loft', name: 'Mothwright’s Loft', kind: 'loft',
    x: -12, z: 1, rotation: 1.15, footprint: [4, 4], selectRadius: 5,
    program: 'Breeding lantern moths',
    consumes: 'Leaf mash, still air',
    produces: 'The moths that carry emberlight back to the beacon',
    site: 'High and upwind, where the air stays still and clean.',
    tell: 'The tallest gable in the village, louvred on all four sides, with drying racks outside.'
  },
  {
    id: 'bellrow', name: 'Bellrow Cottage', kind: 'cottage',
    x: 9, z: -7, rotation: 2.15, footprint: [4.4, 3.8], selectRadius: 4.4,
    program: 'Dwelling - a moth-tender’s family',
    consumes: 'Firewood, a share of the store',
    produces: 'Three pairs of hands at the beacon each dusk',
    site: 'The east terrace, first to catch the last of the sun.',
    tell: 'Curled eaves and a leaning chimney; smaller than the hall, same joinery.'
  },
  {
    id: 'fernstep', name: 'Fernstep Cottage', kind: 'cottageAlt',
    x: -14, z: -12, rotation: 0.95, footprint: [4.2, 3.6], selectRadius: 4.4,
    program: 'Dwelling - the beacon keeper’s house',
    consumes: 'Firewood, a share of the store',
    produces: 'The keeper who climbs to the crown each night',
    site: 'The upper terrace, one lane from the beacon.',
    tell: 'Built into the riser, so its uphill wall is half buried in the terrace.'
  }
];

/** Lanes as world-space polylines. The ribbon and the stone steps both read these. */
export const LANES = [
  { id: 'spine', width: 1.9, points: [[-12, 1], [-7.5, -0.6], [-3.4, -2.6], [1.6, -1.2], [6, 2], [8.4, 5.6], [12.5, 10.5]] },
  { id: 'low', width: 1.7, points: [[6, 2], [4.2, 7], [2, 12], [-3, 13.2], [-9, 14], [-15.5, 16], [-23, 18.5]] },
  { id: 'east', width: 1.3, points: [[-3.4, -2.6], [2.4, -5.6], [9, -7]] },
  { id: 'west', width: 1.3, points: [[-7.5, -0.6], [-11, -6], [-14, -12]] }
];

/**
 * Residents. Each has its own route and its own rest point, so they read as people with errands
 * rather than as one bobbing crowd (knowledge.theme-fantasy-woodland).
 */
export const RESIDENTS = [
  { id: 'wick', name: 'Wick, the lamplighter', speed: 1.25, restIndex: 2, restSeconds: 3.2, offset: 0.0,
    route: [[-12, 1], [-7.5, -0.6], [-3.4, -2.6], [1.6, -1.2], [6, 2], [8.4, 5.6], [12.5, 10.5]] },
  { id: 'tallow', name: 'Tallow, carrying grain', speed: 0.95, restIndex: 1, restSeconds: 2.4, offset: 3.5,
    route: [[-9, 14], [-3, 13.2], [2, 12], [4.2, 7], [6, 2]] },
  { id: 'bramble', name: 'Bramble, home from the east', speed: 1.1, restIndex: 1, restSeconds: 4.0, offset: 6.0,
    route: [[9, -7], [2.4, -5.6], [-3.4, -2.6], [1.6, -1.2], [6, 2]] }
];

export const MOTH_COUNT = 9;

export function findBuilding(id) {
  return BUILDINGS.find(building => building.id === id) ?? null;
}
