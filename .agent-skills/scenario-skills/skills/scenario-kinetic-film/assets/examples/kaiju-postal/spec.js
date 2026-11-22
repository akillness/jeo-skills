// spec.js: KAIJU POSTAL, a 24 s teaser for a fictional indie game, made with the kinetic film skill.
// Music, sound kit and key art were generated with Scenario MCP; every move below is code. Beats at 172 BPM.
// The generated files are not included. Make your own (the skill's references/sound.md) into
// audio/music.mp3, audio/sfx/*.wav (the kit plus stomp, roar, bell, knock), art/key1.png and art/key2.png.
import { Words, Picture, Fly, Hero, Logo } from './blocks.js';

export default {
  title: 'Kaiju Postal',
  bpm: 172, beats: 68, fps: 60,
  palette: { bg: '#0B1020', paper: '#F3EEE3', accent: '#FFC21A', hot: '#FF8A1F', ink: '#14120E' },
  hud: 'KAIJU POSTAL  ·  TEASER', hudOut: [65, 67],
  // the drop of the generated track (music 10.74 s) lands on film beat 8, the first key art; hard stop on the title.
  // offset is that track's: measure your own with beat_grid.py and set it from your drop
  music: { file: 'audio/music.mp3', offset: 7.95, stopBeat: 58, gain: -7 },
  sounds: { stomp: -1, roar: -5, bell: -7, knock: -1, hit: 1, slash: -1 },
  cues: [[5.5, 'stomp', 1], [8.25, 'roar', .9], [24.6, 'bell', 1], [40, 'stomp', 1], [57.9, 'stomp', .8]],

  scenes: [
    [Words, 0, 8, { charge: true, shots: [
      { at: 1, style: 'punch3d', text: 'THE CITY', fx: 'punch' },
      { at: 2, style: 'slam', text: 'HAS NEW', ground: 'accent' },
      { at: 3, style: 'stack', text: ['VERY BIG', 'NEIGHBORS.'], ground: 'paper', in: 'whipX', fx: 'none' },
      { at: 5, style: 'split', text: ['THEY', 'STOMP.'], in: 'whipY', fx: 'punch', big: true },
      { at: 7, style: 'cut', text: 'STOMP.', color: 'accent', size: 600, rot: -5, fx: 'beat', cue: 'stomp' },
    ] }],
    [Picture, 8, 16, { src: 'art/key1.png', weather: 'rain', focus: [.55, .45], tint: .3, words: [[1, 'MONSTERS', 'paper'], [3, 'NEXT DOOR.', 'accent']], y: 560, cutIns: [[5, 1.65, [.62, .2], 'stomp']] }],
    [Words, 16, 24, { shots: [
      { at: 16, style: 'pair', text: ['THE MAIL', 'STILL GOES OUT.'], fx: 'beat' },
      { at: 18, style: 'slam', text: 'RAIN.', ground: 'paper', in: 'whipY', fx: 'beat' },
      { at: 19, style: 'slam', text: 'FIRE.', ground: 'accent', fx: 'beat' },
      { at: 20, style: 'slam', text: 'KAIJU.', color: 'accent', glow: 24, fx: 'beat', cue: 'stomp' },
      { at: 21, style: 'split', text: ['YOU', 'DELIVER.'], in: 'whipX', fx: 'punch', big: true },
    ], exit: { type: 'zoom', at: 23.1, char: 0 } }],
    [Picture, 24, 32, { src: 'art/key2.png', weather: 'rain', reveal: 'zoom', focus: [.4, .45], tint: .25, x: 1380, y: 560, words: [[1, 'SIGNED.', 'paper'], [2.5, 'SEALED.', 'paper'], [4, 'STOMPED.', 'accent']], cutIns: [[5.5, 1.6, [.74, .7]]] }],
    [Fly, 32, 43, { words: [['DODGE', 'paper'], ['THE', 'accent'], ['BIG', 'paper'], ['FEET.', 'accent']] }],
    [Hero, 43, 51, { kicker: 'YOU ARE', title: 'THE POST.', sub: 'press start to deliver', whipOut: [0, 1150, .13] }],
    [Words, 51, 57, { shots: [
      { at: 51, style: 'cut', text: 'KNOCK.', color: 'paper', size: 420, rot: -3, fx: 'beat', cue: 'knock' },
      { at: 52, style: 'cut', text: 'KNOCK.', ground: 'accent', size: 480, rot: 4, fx: 'beat', cue: 'knock' },
      { at: 53, style: 'cut', text: "WHO'S", ground: 'paper', size: 440, fx: 'beat' },
      { at: 53.5, style: 'cut', text: 'THERE?', color: 'accent', size: 380, rot: 6, dy: -60, fx: 'beat' },
      { at: 54, style: 'cut', text: 'THE', ground: 'accent', size: 520, fx: 'beat' },
      { at: 54.5, style: 'cut', text: 'POST.', ground: 'paper', size: 560, rot: -3, fx: 'beat' },
      { at: 55.5, style: 'cut', text: 'STOMP.', color: 'accent', size: 640, rot: -5, rgb: true, fx: 'beat', cue: 'stomp' },
    ], exit: { type: 'flash', at: 56.25 } }],
    [Logo, 57, 68, { wordmark: 'KAIJU POSTAL', tagline: 'Signed. Sealed. Stomped.', small: 'COMING SOON' }],
  ],
  captions: [],
};
