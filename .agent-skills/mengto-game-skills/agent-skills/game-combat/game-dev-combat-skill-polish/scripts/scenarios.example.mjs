// Scenarios for film.mjs: one cast each. `place` puts units ([id, col, row, extra]) on the board; anyone not placed can be
// parked off-shot by your own default list; `cmd` is the command issued through the hook's act(); `frame` aims the camera at
// a tile, `span` sets how much of the board shows, `points` keeps extra tiles (the thing thrown, the landing) in the strip's
// crop, `focus` lists the unit ids the crop is fitted round, `tail` keeps idle frames after the cast for the aftermath, and
// `prep` is a function source run on the staged state before load (learned skills, attributes, wounds).
export default [
  { id: 'paladin-hammer', caster: 1, cmd: { type: 'summonhammer', target: 4 },
    place: [[1, 4, 7], [4, 7, 7]], focus: [1, 4], frame: [5.7, 7.1], span: 8, tail: 16 },
  { id: 'warrior-shove', caster: 2, cmd: { type: 'heave', target: 4 },
    place: [[2, 4, 7], [4, 5, 7]], focus: [2, 4] },
  { id: 'mage-charm', caster: 3, cmd: { type: 'charm', target: 4 },
    place: [[3, 4, 7], [4, 7, 7]], focus: [3, 4], tail: 22,
    prep: 'st=>{st.units.find(u=>u.id===3).charisma=4;}' },
];
