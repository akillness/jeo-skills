// village-look-table.js - the catalog looks this village can wear, copied from the records'
// `defaults.values`. Data only; village-looks.js applies them and main.js reads `?look=`.
//
// THE RECORDS ARE THE CONTRACT. Every entry names the record it came from and every number that
// is not the record's is listed in `departures` with the reason. The records say so themselves:
// "values are authored starting points ... re-tune every intensity under a different exposure".
// Tuning is allowed; silently tuning is not.
//
// Three departures apply to every look and are not repeated per entry.
//  a. Shadows keep the village's own camera (+/-13 m, 1024 map, normalBias 0.035). The island is
//     26 m across, so the records' 20-25 m extents only spend texel density on empty water.
//  b. Light directions are given as elevation/azimuth, as the records give them, and placed on a
//     sphere of `distance_m` around the island centre rather than at the records' unstated range.
//  c. No look changes geometry or materials. A record's cloud cards, wet-quay puddle mask or
//     moulded-plastic clearcoat are modelling work; a look switch is sky, fog, environment,
//     lights, tone mapping and post, and nothing else.

/** knowledge.style-lantern-festival-riverside warmed toward
 *  knowledge.lighting-mood-dusk-golden-hour: the look this village shipped in phase 8 and the
 *  one every committed capture is framed under. Kept verbatim from what shipped, so the
 *  departures below are the ones the village already carried before looks existed. */
const DUSK = {
 id: 'dusk-golden-hour',
 label: 'Dusk, golden hour (default)',
 kinds: ['style', 'mood'],
 records: ['knowledge.style-lantern-festival-riverside', 'knowledge.lighting-mood-dusk-golden-hour'],
 departures: [
  'Sky #1f2f45 -> #b58c66 rather than the mood\'s #3a4a7a -> #f2a55c: the village is a lit doll island, and the record\'s saturated orange horizon painted every north-facing roof orange.',
  'Fog density 0.014, not the mood\'s 0.02: the island is +/-13 m, so 0.02 hazes the far shore inside the orbit ceiling.',
  'Key at 51 deg elevation, not the mood\'s 6 deg: a 6 deg sun puts the whole island in its own shadow at the shipped overview.',
  'Exposure 1.15, not the mood\'s 0.9: nothing here is a sun disc to protect, and the T2 albedo multiplies the base colour a step darker.',
  'The mood\'s warm rim is replaced by a cool #9bbaff fill from the opposite side; the warm side is already carried by the key.',
  'Hemisphere 1.05 against the mood\'s 0.5, measured to keep every diffuse surface under the 1.0 bloom threshold.'
 ],
 sky: {zenith: '#1f2f45', horizon: '#b58c66'},
 fog: {color: '#b58c66', density: .014},
 environment: {intensity: .3},
 toneMapping: {mode: 'ACESFilmic', exposure: 1.15},
 post: {bloom: {threshold: 1, strength: .35, radius: .6}, vignette: .22, dof: null},
 lights: {
  hemisphere: {sky: '#d6ebff', ground: '#52615a', intensity: 1.05},
  key: {color: '#ffe2bb', intensity: 2.2, elevation_deg: 51.2971, azimuth_deg: 326.3099,
        distance_m: 11.5326, castShadow: true},
  fill: {color: '#9bbaff', intensity: .85, elevation_deg: 19.2259, azimuth_deg: 144.4623,
         distance_m: 9.1104, castShadow: false}
 },
 practicals: null, camera: null
};

/** knowledge.style-ghibli-painterly-pastoral - every number below is the record's. */
const GHIBLI = {
 id: 'ghibli',
 label: 'Painterly pastoral, midday',
 kinds: ['style'],
 records: ['knowledge.style-ghibli-painterly-pastoral'],
 departures: [
  'Style records carry no environment block; RoomEnvironment at 0.35 is borrowed from knowledge.lighting-mood-overcast-soft so the T2 materials keep an ambient bounce.',
  'The record\'s cumulus card layers, painted value bands and wind period are modelling work, not a look: this village keeps its own foliage and its own motion.'
 ],
 sky: {zenith: '#2f5f9e', horizon: '#cfe3ef'},
 fog: {color: '#cfe3ef', density: .012},
 environment: {intensity: .35},
 toneMapping: {mode: 'ACESFilmic', exposure: 1.05},
 post: {bloom: {threshold: 1.1, strength: .15, radius: .6}, vignette: .12, dof: null},
 lights: {
  hemisphere: {sky: '#8fb8e0', ground: '#6b6a45', intensity: .9},
  key: {color: '#fff2d8', intensity: 3, elevation_deg: 52, azimuth_deg: 135, distance_m: 14,
        castShadow: true},
  rim: {color: '#dfe9ff', intensity: .5, elevation_deg: 20, azimuth_deg: 315, distance_m: 14,
        castShadow: false}
 },
 practicals: null, camera: null
};

/** knowledge.style-tilt-shift-diorama - the one look that needs a lens, not just lights. */
const TILT_SHIFT = {
 id: 'tilt-shift',
 label: 'Tilt-shift diorama',
 kinds: ['style'],
 records: ['knowledge.style-tilt-shift-diorama'],
 departures: [
  'FOV 22 deg is the record\'s; the orbit distances are the village\'s own multiplied by tan(39/2)/tan(22/2) = 1.822, so the telephoto compression arrives without recomposing the frame (the record\'s 45 m camera height assumes a city block, not a 26 m island).',
  'Focus distance tracks the orbit target instead of sitting at the record\'s fixed 60 m, and the focus range is 5% of it: the village is orbited, and a fixed plane would blur the subject as soon as it moved.',
  'Bokeh scale 4.0 and range ratio 0.05 (2.4 m of sharp depth at the shipped 47 m overview) were tuned by looking at the frame against the record\'s "sharp band 18-25% of frame height"; its "12 px circle of confusion at 1080p" is not measurable from inside the page.',
  'The record\'s +18% saturation / +10% contrast grade is not applied: this stack has no grade pass, and faking it with exposure would lift the shadows the record wants dark.',
  'Environment 0.2 (the record has no environment block): with no rim light and no fog, a little ambient keeps the north faces off black.'
 ],
 sky: {zenith: '#cfe0ee', horizon: '#cfe0ee'},
 fog: null,                                        // record: "fog: none", on purpose
 environment: {intensity: .2},
 toneMapping: {mode: 'ACESFilmic', exposure: 1},
 post: {bloom: {threshold: 1.2, strength: .15, radius: .4}, vignette: .3,
        dof: {focusDistance: 47, focusRange: 2.4, bokehScale: 4, rangeRatio: .05}},
 lights: {
  hemisphere: {sky: '#bcd4ea', ground: '#6d6558', intensity: .6},
  key: {color: '#fff6e2', intensity: 3.4, elevation_deg: 58, azimuth_deg: 140, distance_m: 16,
        castShadow: true, mapSize: 2048, normalBias: .03}
 },
 practicals: null,
 camera: {fov_deg: 22, maxPolar_deg: 55}
};

/** knowledge.lighting-mood-night-lantern - no sun; the village's seven lantern heads carry it. */
const NIGHT = {
 id: 'night-lantern',
 label: 'Night, lantern practicals',
 kinds: ['mood'],
 records: ['knowledge.lighting-mood-night-lantern', 'knowledge.style-lantern-festival-riverside'],
 departures: [
  'Practicals at 19 cd, not the record\'s 60: the village\'s lantern heads hang at 1.36 m rather than the record\'s 2.4 m, and 60/2.4^2 = 19/1.36^2 reproduces the same 10 lx pool at the lamp\'s own height with the same decay 2.',
  'No practical casts a shadow (the record shadows "the two nearest the hero"): a PointLight shadow is six faces, and the T2 occlusion bake already grounds every prop.',
  'Range 3.4 m rather than the record\'s uncut "distance: 0". knowledge.style-lantern-festival-riverside pairs a 6 m range with a 2.4-3.6 m hang height; at 1.36 m that ratio is 3.4 m. Uncut, seven pools over a 13 m island merge into one flat wash and the record\'s "space between lanterns falls away into tinted darkness" is lost - which is exactly what the first capture showed.',
  'Dynamic practicals are capped at 12, from knowledge.style-lantern-festival-riverside ("cap dynamic lights at 12"); the village has seven lantern heads, so all seven are lit.',
  'Fog density 0.03, not the record\'s 0.05: both were captured at the shipped 26 m overview, and at 0.05 the far half of the island - tower, mushroom, long hall - sinks into #0b1526 and only the two near lantern pools survive. Kept the record\'s colour, which is what makes distance read as hue rather than as grey.'
 ],
 sky: {zenith: '#070c18', horizon: '#16233f'},
 fog: {color: '#0b1526', density: .03},
 environment: {intensity: 0},                      // record: environment "none"
 toneMapping: {mode: 'ACESFilmic', exposure: 1.15},
 post: {bloom: {threshold: .9, strength: .5, radius: .8}, vignette: .45, dof: null},
 lights: {
  hemisphere: {sky: '#16233f', ground: '#241a12', intensity: .12},
  key: {color: '#9fb4ff', intensity: .15, elevation_deg: 22, azimuth_deg: 40, distance_m: 14,
        castShadow: false}                          // moonlight, deliberately too weak to be a key
 },
 practicals: {color: '#ffb46b', intensity: 19, decay: 2, distance: 3.4, max: 12},
 camera: null
};

/** knowledge.lighting-mood-overcast-soft - the cloud deck is the whole source. */
const OVERCAST = {
 id: 'overcast',
 label: 'Overcast, soft',
 kinds: ['mood'],
 records: ['knowledge.lighting-mood-overcast-soft'],
 departures: [
  'Fog density 0.012, not the record\'s 0.035: the record\'s own rationale asks for fog "kept low, so distance reads as a lift toward the sky value", but its number is written for a scene the size of its 25 m shadow extent. At 0.035 (and at 0.025, captured) a 26 m orbit veils the whole island in near-sky white and the silhouette goes with it; 0.012 keeps the lift and the island.',
  'The record\'s "ambient_occlusion: on" is already true here in a different form - the T2 vertex bake, which is what grounds objects when no shadow is cast.'
 ],
 sky: {zenith: '#b9c4d0', horizon: '#d8dee4'},
 fog: {color: '#cfd6dd', density: .012},
 environment: {intensity: .35},
 toneMapping: {mode: 'ACESFilmic', exposure: 1},
 post: {bloom: {threshold: 1.2, strength: .1, radius: .4}, vignette: .15, dof: null},
 lights: {
  hemisphere: {sky: '#cfd8e6', ground: '#6a6f66', intensity: 1.2},
  key: {color: '#e8edf2', intensity: .6, elevation_deg: 70, azimuth_deg: 180, distance_m: 16,
        castShadow: false}                          // orientation hint only; the deck is the source
 },
 practicals: null, camera: null
};

export const DEFAULT_LOOK = DUSK.id;
export const LOOKS = Object.fromEntries([DUSK, GHIBLI, TILT_SHIFT, NIGHT, OVERCAST]
                                        .map(look => [look.id, look]));
