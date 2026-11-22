import { afterAll, describe, expect, it } from "vitest";
import {
  Hero,
  Logo,
  Notes,
  Picture,
  Progress,
  Scene,
  Stretch,
  Words,
} from "../../skills/scenario-kinetic-film/assets/engine/blocks.js";
import { checkSpec } from "../../skills/scenario-kinetic-film/assets/engine/validate.js";
import { EXAMPLES, filmFolder, load, removeFilms } from "./film";

afterAll(removeFilms);

const base = () => ({
  title: "T",
  bpm: 120,
  beats: 20,
  fps: 60,
  palette: { bg: "#0B1020", accent: "rgb(255, 194, 26)" },
  music: { file: "audio/music.mp3", offset: 0, stopBeat: 10 },
  scenes: [
    [
      Words,
      0,
      4,
      {
        shots: [
          { at: 1, style: "slam", text: "HELLO" },
          { at: 2, style: "stack", text: ["A", "B"] },
        ],
      },
    ],
    [Hero, 4, 9, { kicker: "K", title: "T" }],
    [Logo, 9, 20, { wordmark: "T" }],
  ] as unknown[],
  captions: [[0, 4, [["Hello", 1]]]],
  cues: [[2, "stomp", 1]],
  hudOut: [17, 19],
  sounds: { stomp: -1 },
});
type Spec = ReturnType<typeof base> & Record<string, unknown>;
const errors = (spec: unknown) =>
  checkSpec(spec)
    .filter((p) => p.level === "error")
    .map((p) => p.msg);
const warnings = (spec: unknown) =>
  checkSpec(spec)
    .filter((p) => p.level === "warning")
    .map((p) => p.msg);
const edit = (f: (s: Spec) => void) => {
  const s = base() as Spec;
  f(s);
  return s;
};

describe("checkSpec", () => {
  it("passes every shipped example, with no warning", async () => {
    expect(EXAMPLES.sort()).toEqual(["kaiju-postal", "starter", "tour"]);
    for (const example of EXAMPLES) {
      const dir = filmFolder(example);
      const spec = (await load(dir, "spec.js")).default;
      const { checkSpec: check } = await load(dir, "validate.js");
      expect(check(spec), example).toEqual([]);
    }
  });

  it("runs film folders on the skill's own engine files, so coverage counts them", async () => {
    const blocks = await load(filmFolder("starter"), "blocks.js");
    expect(blocks.Words).toBe(Words);
  });

  it("passes a clean spec", () => {
    expect(checkSpec(base())).toEqual([]);
  });

  it("accepts custom blocks: any subclass of Scene", () => {
    class Confetti extends Scene {}
    class Shout extends Words {}
    const s = edit((s) => s.scenes.push([Confetti, 4, 6, {}]));
    expect(errors(s)).toEqual([]);
    // a Words subclass still gets the Words checks
    const bad = edit((s) =>
      s.scenes.push([
        Shout,
        4,
        6,
        { shots: [{ at: 4, style: "nope", text: "X" }] },
      ]),
    );
    expect(errors(bad)).toEqual([
      expect.stringContaining("style 'nope' is not one of punch3d, slam"),
    ]);
  });

  const cases: [string, (s: Spec) => void, string][] = [
    ["no tempo", (s) => (s.bpm = 0), "bpm must be a number above 0"],
    [
      "no length",
      (s) => delete (s as Record<string, unknown>).beats,
      "beats must be a number above 0",
    ],
    [
      "a class that is not a block",
      (s) => s.scenes.push([class Other {}, 1, 2, {}]),
      "must be a block class",
    ],
    [
      "a scene that ends before it starts",
      (s) => s.scenes.push([Hero, 6, 6, {}]),
      "needs 0 <= startBeat < endBeat",
    ],
    [
      "a scene past the last beat",
      (s) => s.scenes.push([Hero, 18, 24, {}]),
      "ends after the film's last beat (20)",
    ],
    [
      "an unknown shot style",
      (s) => ((s.scenes[0] as any)[3].shots[0].style = "wobble"),
      "style 'wobble' is not one of",
    ],
    [
      "a shot outside its block",
      (s) => ((s.scenes[0] as any)[3].shots[1].at = 4),
      "must lie inside the block",
    ],
    [
      "shots out of order",
      (s) => ((s.scenes[0] as any)[3].shots[1].at = 0.5),
      "must come after the previous shot",
    ],
    [
      "two shots on one beat",
      (s) => ((s.scenes[0] as any)[3].shots[1].at = 1),
      "must come after the previous shot",
    ],
    [
      "a one-string stack",
      (s) => ((s.scenes[0] as any)[3].shots[1].text = "AB"),
      "takes text: ['first', 'second']",
    ],
    [
      "an array for a slam",
      (s) => ((s.scenes[0] as any)[3].shots[0].text = ["A", "B"]),
      "takes text: 'ONE STRING'",
    ],
    [
      "Words without shots",
      (s) => s.scenes.push([Words, 2, 3, {}]),
      "Words needs shots",
    ],
    [
      "an unknown exit",
      (s) => ((s.scenes[0] as any)[3].exit = { type: "fade" }),
      "exit.type must be one of",
    ],
    [
      "a Picture without src",
      (s) => s.scenes.push([Picture, 2, 4, {}]),
      "Picture needs src",
    ],
    [
      "a Stretch without its word",
      (s) => s.scenes.push([Stretch, 2, 4, {}]),
      "Stretch needs word",
    ],
    [
      "Notes without a preview word",
      (s) => s.scenes.push([Notes, 2, 4, { notes: [["warmer", "recolor"]] }]),
      "Notes needs preview",
    ],
    [
      "Progress with one line",
      (s) => s.scenes.push([Progress, 2, 4, { lines: ["DRAWN"] }]),
      "Progress needs lines",
    ],
    [
      "a 3-digit palette color",
      (s) => (s.palette.bg = "#fff"),
      "palette.bg is '#fff'",
    ],
    [
      "a named palette color",
      (s) => (s.palette.accent = "orange"),
      "palette.accent is 'orange'",
    ],
    [
      "a caption past the end",
      (s) => s.captions.push([18, 21, [["late", 19]]]),
      "caption 2: needs 0 <= startBeat < endBeat <= beats",
    ],
    [
      "caption words that are not pairs",
      (s) => s.captions.push([5, 6, ["word"]]),
      "words must be [['word', beat], ...]",
    ],
    ["a cue past the end", (s) => s.cues.push([21, "stomp"]), "cue 2"],
    ["hudOut past the end", (s) => (s.hudOut = [19, 22]), "hudOut [19,22]"],
    [
      "stopBeat past the end",
      (s) => (s.music.stopBeat = 30),
      "music.stopBeat 30 must lie within the film",
    ],
    [
      "music with no file",
      (s) => ((s.music as any).file = ""),
      "music.file must name the track",
    ],
    [
      "a level that is not a number",
      (s) => ((s.sounds as any).stomp = "loud"),
      "sounds.stomp must be a level in dB",
    ],
    ["no scenes", (s) => (s.scenes = []), "scenes must be a non-empty list"],
  ];
  for (const [name, f, msg] of cases) {
    it(`errs on ${name}`, () => {
      const found = errors(edit(f));
      expect(
        found.some((m) => m.includes(msg)),
        `${JSON.stringify(found)} should include "${msg}"`,
      ).toBe(true);
    });
  }

  it("names the scene in its messages", () => {
    const found = errors(
      edit((s) => ((s.scenes[0] as any)[3].shots[0].style = "wobble")),
    );
    expect(found[0]).toMatch(/^scene 1 \(Words 0-4\) shot 1: /);
  });

  it("is not an object", () => {
    expect(errors(undefined)).toEqual([
      "spec.js must `export default` an object",
    ]);
  });

  it("warns, without stopping the film, on fps other than 60 and a stop off the logo hit", () => {
    expect(warnings(edit((s) => (s.fps = 30)))).toEqual([
      expect.stringContaining("fps is 30"),
    ]);
    const late = edit((s) => (s.music.stopBeat = 12));
    expect(warnings(late)).toEqual([
      expect.stringContaining("the logo hit, beat 10"),
    ]);
    expect(errors(late)).toEqual([]);
  });

  it("does not warn on scenes that overlap, which blocks do on purpose", () => {
    expect(checkSpec(edit((s) => s.scenes.push([Hero, 3, 5, {}])))).toEqual([]);
  });
});
