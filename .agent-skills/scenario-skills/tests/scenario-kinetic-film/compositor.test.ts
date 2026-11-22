// @vitest-environment jsdom
// The compositor under jsdom, with every canvas recording its calls. jsdom has no layout (every size
// reads 0) and draws nothing, so this guards the logic: cuts, shutter, samples, the end card, and that
// a frame depends on its time only. The browser suite (browser.test.ts) checks the pixels.
import { readFileSync } from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { filmFolder, load, removeFilms } from "./film";

afterAll(removeFilms);

type Op = [string, ...unknown[]];
const OPS = new WeakMap<HTMLCanvasElement, Op[]>();
function recordingContext(ops: Op[]): CanvasRenderingContext2D {
  const gradient = {
    addColorStop: (...a: unknown[]) => ops.push(["addColorStop", ...a]),
  };
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === "createRadialGradient" || key === "createLinearGradient")
        return (...a: unknown[]) => (ops.push([String(key), ...a]), gradient);
      return (...a: unknown[]) => ops.push([String(key), ...a]);
    },
    set: (target, key, value) => {
      target[key] = value;
      ops.push([
        "set " + String(key),
        typeof value === "object" ? "gradient" : value,
      ]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement & { __ctx?: CanvasRenderingContext2D },
) {
  if (!this.__ctx) {
    OPS.set(this, []);
    this.__ctx = recordingContext(OPS.get(this)!);
  }
  return this.__ctx;
} as unknown as HTMLCanvasElement["getContext"];

// the visible DOM. A hidden element keeps the styles of the last time it showed (set() skips
// unchanged values), which nobody sees: display none, visibility hidden or opacity 0 end the walk.
function visible(node: Element): string {
  const el = node as HTMLElement;
  const st = el.style;
  if (
    st &&
    (st.display === "none" || st.visibility === "hidden" || st.opacity === "0")
  )
    return "";
  const own = `<${el.tagName} ${el.getAttribute("style") || ""} ${el.getAttribute("class") || ""}>`;
  const text = [...el.childNodes]
    .filter((c) => c.nodeType === 3)
    .map((c) => c.textContent)
    .join("");
  return (
    own + text + [...el.children].map(visible).join("") + `</${el.tagName}>`
  );
}

let film: any, core: any, blocks: any, spec: any, Film: any, logo: string;
const build = () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return new Film(root, {
    src: { code: "const a = 1;\n", lines: 1234 },
    logo,
    spec,
  });
};
// one rendered frame: what is visible in the DOM, and every canvas call the render made
const frame = (f: any, t: number) => {
  const root = f.stage.parentElement as HTMLElement;
  const canvases = [...root.querySelectorAll("canvas")].map((c) =>
    OPS.get(c as HTMLCanvasElement)!,
  );
  const marks = canvases.map((ops) => ops.length);
  f.render(t);
  return {
    dom: visible(root),
    ops: canvases.map((ops, i) => ops.slice(marks[i])),
  };
};

beforeAll(async () => {
  const dir = filmFolder("tour");
  core = await load(dir, "core.js");
  blocks = await load(dir, "blocks.js");
  ({ Film } = await load(dir, "compositor.js"));
  const { inertSvg } = await load(dir, "sanitize.js");
  spec = (await load(dir, "spec.js")).default;
  core.configure(spec);
  core.setPalette(spec.palette);
  logo = inertSvg(readFileSync(path.join(dir, "logo.svg"), "utf8"));
  film = build();
});

describe("a film built from the tour spec", () => {
  it("builds every block", () => {
    expect(film.scenes.map((s: any) => s.constructor.name)).toEqual(
      spec.scenes.map(([S]: any) => S.name),
    );
  });

  it("cuts are sorted, unique, and hold every scene start", () => {
    const cuts: number[] = film.cuts();
    expect(cuts).toEqual([...new Set(cuts)].sort((a, b) => a - b));
    for (const s of film.scenes) if (!s.pre) expect(cuts).toContain(s.t0);
    expect(cuts.length).toBeGreaterThan(film.scenes.length);
  });

  it("the shutter opens only inside smear windows, where samples follow it", () => {
    const smears: [number, number, number][] = film.smears;
    expect(smears.length).toBeGreaterThan(5);
    const outside = (t: number) => !smears.some(([a, b]) => t >= a && t <= b);
    const quiet = [1.0, 20.0, 40.0].filter(outside);
    expect(quiet.length).toBeGreaterThan(0);
    for (const t of quiet) expect(film.shutter(t)).toBe(1);
    for (const [a, b] of smears) {
      const t = (a + b) / 2;
      expect(film.shutter(t)).toBeGreaterThan(1);
      expect(film.samples(t, 1 / 120)).toBeGreaterThanOrEqual(
        Math.ceil(6 * film.shutter(t)),
      );
    }
    expect(film.samples(quiet[0], 1 / 120)).toBeGreaterThanOrEqual(4);
  });

  it("the end card starts at the Logo block", () => {
    expect(film.endCard()).toBeCloseTo(core.B(137), 9);
  });

  it("registers sound cues once: the nested Rewind film adds none", () => {
    const rewind = film.scenes.find((s: any) => s instanceof blocks.Rewind);
    expect(rewind.nested.cues).toEqual([]);
    expect(film.cues.length).toBeGreaterThan(100);
    expect(film.cues.every((c: any) => c.t >= 0 && c.t <= core.DUR + 1)).toBe(
      true,
    );
  });

  it("a frame depends on its time only, not on the frames seeked before it", () => {
    // each time against a fresh film. One used film first visits the same block later, then far
    // away and earlier; the other visits far away, earlier, then later, just before the frame.
    for (const [t, earlier, later, far] of [
      [2.0, 1.2, 2.9, 30],
      [3.2, 2.9, 3.5, 30],
      [10, 9.3, 10.8, 30],
      [25.6, 25.0, 26.5, 5],
      [44.2, 43.7, 44.9, 3],
      [48.6, 47.2, 48.7, 12],
    ]) {
      const fresh = frame(build(), t);
      for (const path of [
        [later, far, earlier],
        [far, earlier, later],
      ]) {
        const used = build();
        for (const b of path) frame(used, b);
        const again = frame(used, t);
        expect(again.dom, `t=${t} after ${path}`).toBe(fresh.dom);
        expect(again.ops, `t=${t} after ${path}`).toEqual(fresh.ops);
      }
    }
    // 18 film builds: about 1 s alone, 11.5 s on a CI runner shared with parallel modules and coverage
  }, 60000);

  it("the HUD counts frames at the film's rate", () => {
    const hud = film.hud;
    hud.update(1.5, false, 1);
    expect(hud.fr.textContent).toBe("FRAME 0090");
    expect(hud.tc.textContent).toBe("00:00:01:30");
    core.configure({ fps: 30 });
    hud.update(1.5, false, 1);
    expect(hud.fr.textContent).toBe("FRAME 0045");
    expect(hud.tc.textContent).toBe("00:00:01:15");
    core.configure({ fps: 60 });
  });
});
