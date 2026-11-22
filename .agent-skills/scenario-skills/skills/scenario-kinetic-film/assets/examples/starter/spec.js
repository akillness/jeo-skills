// spec.js: a 13 s starter. Replace the words, the palette and the name; keep the shape until it works,
// then change blocks. Every number is a beat (60 / bpm seconds). Blocks and options: the skill's references/blocks.md.
// As shipped it passes finish.py's motion gates; a rewrite keeps them by landing a new word every beat or half beat.
import { Words, Strike, Hero, Logo } from './blocks.js';

export default {
  title: 'Product',                       // REPLACE: the film's name (used for file names)
  bpm: 170, beats: 36, fps: 60,           // set bpm to the music's measured tempo (scripts/beat_grid.py)
  palette: { bg: '#0D0F14', paper: '#F2F0EA', accent: '#3D7BFF', hot: '#1F5BFF', ink: '#12141A' },   // REPLACE: brand colors
  hud: 'PRODUCT  ·  LAUNCH', hudOut: [33, 35],
  // music: { file: 'audio/music.mp3', offset: 0, stopBeat: 26 },   // after beat_grid.py: offset puts the drop where you want it
  sounds: {},
  cues: [],

  scenes: [
    // the hook: a point charges, then one idea per beat
    [Words, 0, 8, { charge: true, shots: [
      { at: 1, style: 'punch3d', text: 'MEET', fx: 'punch' },
      { at: 2, style: 'slam', text: 'THE TOOL', ground: 'accent' },
      { at: 3, style: 'stack', text: ['THAT DOES', 'ONE THING.'], ground: 'paper', in: 'whipX', fx: 'none' },
      { at: 5, style: 'split', text: ['AND DOES IT', 'WELL.'], in: 'whipY', fx: 'punch', big: true },
      { at: 7, style: 'cut', text: 'FAST.', color: 'accent', size: 600, rot: -5, fx: 'beat' },
    ] }],
    // what it replaces
    [Strike, 8, 14, { items: [
      { at: 8, word: 'WAITING.', ui: { type: 'timeline', title: 'export_final_v3', tag: 'EXPORTING  4%' } },
      { at: 11, word: 'SERVERS.', ground: 'paper', ui: { type: 'rack', rows: ['NODE 01', 'NODE 02', 'NODE 03'] } },
    ] }],
    // the name, in 3D
    [Hero, 14, 21, { kicker: 'INTRODUCING', title: 'PRODUCT', sub: 'one line about what it does', whipOut: [0, 1150, .13] }],
    // beat cuts that speed up, then a flash
    [Words, 21, 25, { shots: [
      { at: 21, style: 'cut', text: 'CLEAR.', color: 'paper', size: 460, rot: -3, fx: 'beat' },
      { at: 22, style: 'cut', text: 'SIMPLE.', ground: 'accent', size: 420, rot: 4, fx: 'beat' },
      { at: 23, style: 'cut', text: 'YOURS.', ground: 'paper', size: 480, fx: 'beat' },
      { at: 23.5, style: 'cut', text: 'READY?', color: 'accent', size: 400, rot: 6, dy: -60, fx: 'beat' },
      { at: 24, style: 'cut', text: 'SET.', ground: 'accent', size: 520, rot: -4, fx: 'beat' },
      { at: 24.25, style: 'cut', text: 'NOW.', color: 'paper', size: 620, rot: -5, rgb: true, fx: 'beat' },
    ], exit: { type: 'flash', at: 24.5 } }],
    // the end card; the music stops on its first beat (music.stopBeat = 26)
    [Logo, 25, 36, { wordmark: 'PRODUCT', tagline: 'One line that says what it does.', small: 'AVAILABLE NOW' }],
  ],
  captions: [],
};
