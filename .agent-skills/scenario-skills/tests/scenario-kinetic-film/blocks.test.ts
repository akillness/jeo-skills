import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import * as blocks from "../../skills/scenario-kinetic-film/assets/engine/blocks.js";
import { configure } from "../../skills/scenario-kinetic-film/assets/engine/core.js";

const SKILL = path.resolve(__dirname, "../../skills/scenario-kinetic-film");
const ENGINE = path.join(SKILL, "assets/engine");
const DOC = readFileSync(path.join(SKILL, "references/blocks.md"), "utf8");
const { qb, cb, arcLen, polyline, chamferPts, fillVars, fmt, hl, Scene } =
  blocks;
const BLOCKS = Object.entries(blocks).filter(
  ([, v]) => typeof v === "function" && v.prototype instanceof Scene,
) as [string, typeof Scene & { N: number; endCard?: boolean }][];

describe("geometry helpers", () => {
  it("bezier curves hit their endpoints", () => {
    expect(qb([0, 0], [5, 9], [10, 0], 0)).toEqual([0, 0]);
    expect(qb([0, 0], [5, 9], [10, 0], 1)).toEqual([10, 0]);
    expect(cb([0, 0], [1, 5], [9, 5], [10, 0], 1)).toEqual([10, 0]);
  });

  it("arcLen moves at an even speed along the curve", () => {
    const f = arcLen((u: number) => [100 * u * u * u, 0]); // slow start, fast end
    expect(f.len).toBeCloseTo(100, 3);
    for (const u of [0.1, 0.25, 0.5, 0.75, 0.9])
      expect(f(u)[0]).toBeCloseTo(100 * u, 0);
  });

  it("polyline and chamferPts trace closed shapes", () => {
    const square = polyline([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(square.len).toBeCloseTo(20, 6);
    const [x, y] = square(0.75);
    expect(x).toBeCloseTo(10, 9);
    expect(y).toBeCloseTo(5, 9);
    const pts = chamferPts(0, 0, 100, 50, 10);
    expect(pts[0]).toEqual(pts[pts.length - 1]);
    expect(pts).toHaveLength(9);
  });
});

describe("on-screen numbers come from the film", () => {
  it("fills {lines}, {frames} and {seconds}", () => {
    configure({ bpm: 120, beats: 64, fps: 60 });
    expect(
      fillVars(
        { src: { lines: 1448 } },
        "{lines} lines · {frames} frames · {seconds} s",
      ),
    ).toBe("1,448 lines · 1,920 frames · 32 s");
    expect(fmt(1234567)).toBe("1,234,567");
  });
});

describe("hl, the code highlighter behind the Counters block's innerHTML", () => {
  it("escapes markup", () => {
    const out = hl("const x = '<img src=x onerror=alert(1)>'; // <b>");
    expect(out).not.toMatch(/<img|<b>/);
    expect(out).toContain("&lt;img");
    expect(out).toContain('<i class="kw">const</i>');
    expect(out).toContain('<i class="st">');
    expect(out).toContain('<i class="cm">// &lt;b&gt;</i>');
  });

  it("marks numbers and types", () => {
    expect(hl("new Film(12)")).toBe(
      '<i class="kw">new</i> <i class="ty">Film</i>(<i class="nu">12</i>)',
    );
  });
});

describe("blocks and their reference", () => {
  // "## Graph (N = 6)", "## Words (sequencer, absolute beats)"; "## spec.js" and other sections do not match
  const headings = [
    ...DOC.matchAll(/^## (\w+)(?: \((?:N = (\d+)|[^)]*)\))?$/gm),
  ].map((m) => [m[1], m[2]]);

  it("references/blocks.md documents exactly the exported blocks, in order of the spec import", () => {
    const documented = headings.map(([name]) => name);
    const spec = DOC.match(
      /import \{ ([^}]+) \} from '\.\/blocks\.js'/,
    )![1].split(", ");
    expect(documented).toEqual(spec);
    expect(BLOCKS.map(([name]) => name).sort()).toEqual([...spec].sort());
  });

  it("each nominal length (N) matches its heading", () => {
    for (const [name, n] of headings) {
      const S = (blocks as Record<string, { N?: number }>)[name];
      if (!S || n === undefined) continue;
      expect(S.N, name).toBe(Number(n));
    }
    for (const [name, S] of BLOCKS) {
      const documented = headings.find(([h]) => h === name)?.[1];
      expect(documented === undefined ? 0 : Number(documented), name).toBe(S.N);
    }
  });

  it("documents every Words shot style", () => {
    for (const style of blocks.SHOT_STYLES)
      expect(DOC, style).toContain(`  - \`${style}\`: `);
  });

  it("only the Logo block is an end card", () => {
    expect(BLOCKS.filter(([, S]) => S.endCard).map(([name]) => name)).toEqual([
      "Logo",
    ]);
  });
});

describe("a pure function of time", () => {
  it("no engine file but main.js reads the clock or a random source", () => {
    for (const file of readdirSync(ENGINE).filter(
      (f) => f.endsWith(".js") && f !== "main.js",
    )) {
      const text = readFileSync(path.join(ENGINE, file), "utf8");
      expect(text, file).not.toMatch(
        /Math\.random|Date\.now|new Date|performance\.now/,
      );
    }
  });
});
