// spec.js: TOUR, a 52 s walk through 13 of the 14 blocks on a 172 BPM grid, with most of their options
// (Picture is in kaiju-postal). Copy the block you need from here. The copy is placeholder text and logo.svg a placeholder mark: replace both.
// No music ships with it: generate a bed (the skill's references/sound.md), then set music.offset from beat_grid.py.
import { Words, Strike, Graph, Hero, Prompt, Stretch, Fly, Notes, Counters, Progress, Chain, Rewind, Logo } from './blocks.js';

const BRIEF = [['A 30-second teaser for a '], ['night market', 1], [': paper lanterns, '], ['street food', 1], [', a '], ['brass band', 1], [' on the drop and the '], ['name', 1], [' on the last hit.']];
const chars = BRIEF.reduce((n, [s]) => n + s.length, 0);

export default {
  title: 'Tour',
  bpm: 172, beats: 148, fps: 60,
  palette: { bg: '#0A0F14', paper: '#F1F4F2', accent: '#2BD9A8', hot: '#12B886', ink: '#0F1412' },
  hud: 'TOUR  ·  EVERY BLOCK', hudOut: [143.5, 146],
  logo: 'logo.svg',
  music: { file: 'audio/music.mp3', offset: 0, stopBeat: 138 },

  scenes: [
    // 1. Words: a point charges, then one idea per beat; split carries a code backdrop, a scramble, a glitch and a note.
    //    The camera leaves through the D of SOUND.
    [Words, 0, 8, { charge: true, shots: [
      { at: 1, style: 'punch3d', text: 'FOURTEEN', fx: 'punch' },
      { at: 2.5, style: 'stack', text: ['BLOCKS ON', 'ONE GRID'], ground: 'paper', in: 'whipY', fx: 'none' },
      { at: 4, style: 'slam', text: 'ONE SPEC', ground: 'accent', in: 'whipX' },
      { at: 5, style: 'split', text: ['SET TO', 'SOUND.'], in: 'whipXr', fx: 'punch', big: true, code: true, scramble: [1, 1.8], glitch: 1.4, note: '// spec.js · scenes', noteAt: 1 },
    ], exit: { type: 'zoom', at: 7.2, char: 4 } }],

    // 2. Hero: a kicker, then the extruded title; a sideways whip out.
    [Hero, 8, 16, { kicker: 'THIS IS', title: 'THE TOUR.', sub: 'a walk through the blocks', whipOut: [1700, 0, .13, 2] }],

    // 3. Strike: three denials over the three mocks (timeline, tiles, rack); the last one switches off like a TV.
    [Strike, 16, 27, { items: [
      { at: 16, word: 'GUESSWORK.', ui: { type: 'timeline', title: 'cut_guess_v7', tag: 'GUESSING  12%' } },
      { at: 19.5, word: 'PRESETS.', ground: 'paper', ui: { type: 'tiles', tiles: [['BLUR', '◆', 'PRESET 01'], ['SHAKE', '●', 'PRESET 02'], ['WIPE', '▲', 'PRESET 03'], ['ZOOM', '■', 'PRESET 04'], ['GLOW', '◆', 'PRESET 05'], ['SPIN', '●', 'PRESET 06'], ['FADE', '▲', 'PRESET 07'], ['TRAIL', '■', 'PRESET 08']] } },
      { at: 23, word: 'QUEUE.', ui: { type: 'rack', rows: ['QUEUE 01', 'QUEUE 02', 'QUEUE 03'] } },
    ] }],

    // 4. Graph: comets draw out of the switch-off point, the camera rides one, then flies through the 0.
    [Graph, 27, 33, { number: '0', label: 'CUTS', sub: 'OFF THE BEAT' }],

    // 5. Fly: through the 0 into words in depth, then an orbit of the last one.
    [Fly, 33, 44, { words: [['INTO', 'paper'], ['THE', 'accent'], ['DEEP', 'paper'], ['END.', 'accent']] }],

    // 6. Prompt: a brief types itself; the push into Enter fills the frame with the accent, the drop.
    [Prompt, 44, 63, { label: 'BRIEF.md', text: BRIEF }],

    // 7. Words: beat cuts on the drop, starting on the accent the Enter key left, faster into a flash.
    [Words, 63, 68, { shots: [
      { at: 63, style: 'cut', text: 'ONE.', ground: 'accent', size: 520, rot: 3, fx: 'beat' },
      { at: 64, style: 'cut', text: 'TWO.', color: 'paper', size: 420, rot: -4, fx: 'beat' },
      { at: 65, style: 'cut', text: 'THREE.', ground: 'paper', size: 360, wdth: 112, fx: 'beat' },
      { at: 65.5, style: 'cut', text: 'FOUR.', color: 'accent', size: 460, rot: 5, dy: 60, fx: 'beat' },
      { at: 66, style: 'cut', text: 'AND', ground: 'accent', size: 320, rot: -7, dy: -120, fx: 'beat' },
      { at: 66.5, style: 'cut', text: 'ONE.', ground: 'paper', size: 500, stroke: 4, fx: 'beat' },
      { at: 66.75, style: 'cut', text: 'GO.', color: 'paper', size: 640, rot: 4, rgb: true, fx: 'beat' },
    ], exit: { type: 'flash', at: 67.25 } }],

    // 8. Stretch: a word on the width axis, its grounds flipping with it.
    [Stretch, 68, 76, { word: 'BOUNCE.', grounds: [[0, 'paper'], [3, 'accent'], [6, 'paper']], whipOut: [-1800, 0, .14, 3] }],

    // 9. Chain: three nodes 2,000 px apart, linked by the comet, then a pull back.
    [Chain, 76, 88, { nodes: [['BRIEF', `brief.md · ${chars} chars`], ['BEATS', '{seconds} s on the grid'], ['FILM.', '4K · 60 FPS · {frames} frames']], whipOut: [0, 1100, .13] }],

    // 10. Notes: three notes typed into a panel, each one played on the preview and its timeline.
    [Notes, 88, 104, { preview: 'BOUNCE.', tag: 'PREVIEW  ·  00:24', file: 'spec.js',
      segments: [['HOOK', 180], ['TITLE', 160], ['STRIKE', 200], ['FLY', 140], ['BRIEF', 200], ['CUTS', 120]],
      notes: [['make it warmer', 'recolor'], ['shorter opening', 'trim'], ['louder on the hits', 'punch']] }],

    // 11-12. Counters on slot reels over the film's own source, then Progress past a render head.
    [Counters, 104, 115, { title: 'tour / spec.js', counters: [['14', 'BLOCKS'], ['{lines}', 'LINES OF SOURCE'], ['{frames}', 'FRAMES RENDERED']], whipOut: [-1700, 0, .13, -2] }],
    [Progress, 115, 124, { lines: ['DRAWN', 'FRAME BY FRAME.'], doneRight: 'FRAME BY FRAME', whipOut: [0, -1150, .13],
      cards: [['FOURTEEN', 'bg', 'paper'], ['BLOCKS', 'accent', 'ink'], ['GRID', 'paper', 'ink'], ['SPEC', 'bg', 'accent'], ['SOUND.', 'accent', 'ink'], ['TOUR.', 'bg', 'paper'], ['NO', 'bg', 'accent'], ['0', 'paper', 'ink'], ['DEEP', 'bg', 'accent'], ['ONE.', 'accent', 'ink'], ['GO.', 'paper', 'ink'], ['BOUNCE.', 'bg', 'accent'], ['FILM.', 'accent', 'ink'], ['SPEC.', 'bg', 'paper']] }],

    // 13. Rewind: the film so far, backwards inside a playback window.
    [Rewind, 124, 132, { label: 'REPLAY' }],

    // 14. Words again, ending in a collapse to the point the logo line grows from.
    [Words, 132, 138, { shots: [
      { at: 132, style: 'pair', text: ['ALL', 'FOURTEEN.'], fx: 'beat', cue: 'impact', gain: .7 },
      { at: 133.5, style: 'slam', text: 'ONE', ground: 'accent', size: 520, wdth: 108, echo: false, in: 'whipXr', fx: 'beat' },
      { at: 134.5, style: 'slam', text: 'SPEC.', ground: 'paper', size: 460, wdth: 104, dot: true, from: 1.6, fx: 'punch', big: true, glyphs: true, scramble: [.5, 1.5], inverts: [.75, 1.25], flip: { at: 1.75, ground: 'bg', color: 'paper' } },
    ], exit: { type: 'collapse', at: 136.5, end: 137.7 } }],

    // 15. Logo: the four marks of logo.svg drop in, then its bar wipes on. The music stops on beat 138.
    [Logo, 137, 148, { mark: ['m1', 'm2', 'm3', 'm4'], word: ['w1'], tagline: 'Fourteen blocks. One spec.', small: 'A TOUR OF THE ENGINE' }],
  ],

  // the caption line, top left: [startBeat, endBeat, [[word, beat], ...]]
  captions: [
    [0, 7.6, [['Fourteen', 1], ['blocks', 2.5], ['on', 3], ['one', 3.3], ['grid,', 3.6], ['one', 4], ['spec,', 4.4], ['set', 5], ['to', 5.3], ['sound.', 5.6]]],
    [8, 15.5, [['This', 8.4], ['is', 9.1], ['the', 9.6], ['tour.', 10.3]]],
    [16, 26.5, [['No', 17], ['guesswork.', 17.4], ['No', 20.5], ['presets.', 20.9], ['No', 24], ['queue.', 24.4]]],
    [27, 32.6, [['Zero', 27.4], ['cuts', 28], ['off', 28.7], ['the', 29.2], ['beat.', 29.8]]],
    [33, 43.5, [['Fly', 33.5], ['into', 34.3], ['the', 35.4], ['deep', 36.2], ['end.', 37.3]]],
    [44, 60.5, [['Start', 44.4], ['from', 45.1], ['a', 45.7], ['brief.', 46.3]]],
    [63, 67.2, [['And', 63], ['count', 63.5], ['it', 64], ['in.', 64.5]]],
    [68, 75.4, [['Type', 68.3], ['that', 69], ['bends', 69.8], ['on', 71], ['its', 71.4], ['width', 71.9], ['axis.', 72.9]]],
    [76, 87.4, [['Brief,', 76.6], ['beats,', 78.8], ['film.', 81.6]]],
    [88, 103.4, [['Feedback', 88.4], ['in', 89.5], ['plain', 90], ['words.', 90.7]]],
    [104, 114.4, [['Fourteen', 104.4], ['blocks,', 105.1], ['counted.', 106]]],
    [115, 123.4, [['Drawn', 115.3], ['frame', 116.2], ['by', 116.6], ['frame.', 117]]],
    [124, 131.4, [['Run', 124.4], ['it', 125.4], ['back.', 126]]],
    [132, 137.2, [['All', 132], ['fourteen.', 132.5], ['One', 133.5], ['spec.', 134.5]]],
  ],
};
