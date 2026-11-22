import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeCtx, three } from "./engine-fakes";
import {
  canvasTags,
  plateFit,
  resolveCanvas,
} from "../../skills/scenario-kinetic-music-video/assets/engine/canvas.js";
import { plateToScreen } from "../../skills/scenario-kinetic-music-video/assets/engine/plate.js";

// The scene template builds three objects and draws through engine helpers: three is a
// stand-in and the helpers record their calls, while the template's own choices (plate
// order, fit, landmark smoothing, framing per canvas) run for real.
vi.mock("three", async () => (await import("./engine-fakes")).three);

const ASSETS = "../../skills/scenario-kinetic-music-video/assets";
const LANDSCAPE = { W: 1920, H: 1080, ORIENT: "landscape" };
const PORTRAIT = {
  W: 1080,
  H: 1920,
  ORIENT: "portrait",
  SAFE: { x: 65, y: 269, w: 875, h: 979 },
};

type Pose = [number, number, number][];
function clip(poses: Record<number, Pose> = {}) {
  const frames: number[] = [];
  return {
    meta: { w: 1920, h: 1080, fps: 10 },
    tex: "tex",
    mtex: "mtex",
    frames,
    frame: async (t: number) => void frames.push(t),
    // keyed by the frame offset from the sampled time, so tests read as -2..2
    trackAt: (t: number) => {
      const k = Math.round((t - 1) * 10);
      return poses[k] ? { pose: poses[k] } : null;
    },
  };
}

function engine(over: Record<string, any> = {}, video?: unknown) {
  const calls: Record<string, unknown[][]> = {};
  const rec =
    (name: string, ret?: (...a: any[]) => unknown) =>
    (...a: unknown[]) => {
      (calls[name] ??= []).push(a);
      return ret?.(...a);
    };
  const ctx = fakeCtx();
  const E: Record<string, any> = {
    ...LANDSCAPE,
    SCALE: 1,
    SAFE: { x: 0, y: 0, w: 1920, h: 1080 },
    PAL: { accent: "#acc", ember: "#emb", white: "#fff" },
    words: [{ w: "hello", s: 1, e: 1.5 }],
    post: {},
    hud: {},
    loadVideo: async (name: string) => {
      rec("loadVideo")(name);
      if (!video) throw new Error("missing");
      return video;
    },
    makeG2D: (w: number, h: number) => ({
      ctx,
      size: [w, h],
      clear: rec("clear"),
      commit: rec("commit"),
    }),
    safeCamera: rec("safeCamera", (cam) => cam),
    text3D: rec("text3D", () => ({
      boundingBox: { min: { x: -2 }, max: { x: 2 } },
      computeBoundingBox() {},
    })),
    col: (hex: string, k: number) => `${hex}*${k}`,
    plateFit,
    plateToScreen,
    drawPlate: rec("drawPlate"),
    blitG2D: rec("blitG2D"),
    drawText: rec("drawText"),
    fitSize: rec("fitSize", () => 333),
    popScale: rec("popScale", () => 1.25),
    wordAlpha: rec("wordAlpha", () => 0.75),
    pulse: rec("pulse", () => 0.5),
    renderer: {
      setRenderTarget: rec("setRenderTarget"),
      render: rec("render"),
    },
    ...over,
  };
  return { E, calls, ctx };
}

async function loadScene(E: Record<string, any>) {
  vi.resetModules();
  const scene = (await import(`${ASSETS}/scene.template.js`)).default;
  await scene.load(E, {});
  return scene;
}

afterEach(() => vi.restoreAllMocks());

describe("scene template: load", () => {
  it("loads its clip and builds the hero word for the 3D fallback", async () => {
    const { E, calls } = engine({}, clip());
    await loadScene(E);
    expect(calls.loadVideo).toEqual([["clip_a"]]);
    expect(calls.text3D).toEqual([
      ["HELLO", { font: "ArchivoBlack", size: 1.6, depth: 0.45 }],
    ]);
    const cam = calls.safeCamera[0][0] as InstanceType<
      typeof three.PerspectiveCamera
    >;
    expect(cam.position.z).toBe(10);
    expect(cam.aspect).toBeCloseTo(1920 / 1080);
  });

  it("pulls the camera back off landscape until the word fits the safe band", async () => {
    const { E, calls } = engine(PORTRAIT, clip());
    await loadScene(E);
    const cam = calls.safeCamera[0][0] as InstanceType<
      typeof three.PerspectiveCamera
    >;
    const tanHalfW = Math.tan((20 * Math.PI) / 180) * (1080 / 1920);
    const fill = (0.75 * 875) / 1080;
    expect(cam.position.z).toBeCloseTo(4 / fill / (2 * tanHalfW));
    expect(cam.position.z).toBeGreaterThan(10);
  });

  it("warns and falls back to graphics when the clip is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { E, calls } = engine();
    const scene = await loadScene(E);
    expect(warn).toHaveBeenCalledWith("footage missing", "clip_a");
    await scene.prepare(E, 1);
    scene.render(E, 1.2, "rt");
    expect(calls.drawPlate).toBeUndefined();
    expect(calls.popScale).toEqual([[1.2, 1]]);
    const [[sceneArg, cam]] = calls.render as [
      [{ children: { scale: { x: number } }[] }, unknown],
    ];
    expect(sceneArg.children[0].scale.x).toBe(1.25);
    expect(cam).toBe(calls.safeCamera[0][0]);
  });
});

describe("scene template: footage", () => {
  it("never seeks the clip before its first frame", async () => {
    const v = clip();
    const { E } = engine({}, v);
    const scene = await loadScene(E);
    await scene.prepare(E, 1.25);
    await scene.prepare(E, -0.5);
    expect(v.frames).toEqual([1.25, 0]);
  });

  it("layers the plate, the type behind the subject, then the subject again", async () => {
    const { E, calls } = engine({}, clip());
    const scene = await loadScene(E);
    scene.render(E, 1.2, "rt");
    expect(calls.setRenderTarget).toEqual([["rt"]]);
    expect(calls.drawPlate.map((a) => a[2])).toEqual([
      { fit: "cover" },
      { fit: "cover", matte: true },
    ]);
    expect(calls.blitG2D).toHaveLength(2);
    const [[, text, x, y, o]] = calls.drawText as [
      [unknown, string, number, number, Record<string, unknown>],
    ];
    expect([text, x, y]).toEqual(["HELLO.", 960, 1080 * 0.45]);
    expect(o).toMatchObject({ size: 420, s: 1.25, alpha: 0.75 });
    expect(calls.popScale[0][2]).toMatchObject({ from: 1.6 });
    expect(calls.wordAlpha).toEqual([[1.2, 1, 1.5]]);
  });

  it("windows a mismatched clip and fits the word to the band off landscape", async () => {
    const { E, calls } = engine(PORTRAIT, clip());
    const scene = await loadScene(E);
    scene.render(E, 1.2, "rt");
    expect(calls.drawPlate[0][2]).toEqual({ fit: "contain" });
    expect(calls.fitSize[0][3]).toBeCloseTo(875 * 0.8);
    const o = calls.drawText[0][4] as Record<string, unknown>;
    expect(o.size).toBe(333);
    expect(calls.popScale[0][2]).toMatchObject({ from: 0.6 });
  });

  it("draws the word at rest when no sung word matches it", async () => {
    const { E, calls } = engine({ words: [] }, clip());
    const scene = await loadScene(E);
    scene.render(E, 1.2, "rt");
    expect(calls.drawText[0][4]).toMatchObject({ s: 1, alpha: 1 });
    expect(calls.popScale).toBeUndefined();
  });

  it("tracks the nose with confident landmarks averaged over five frames", async () => {
    const { E, ctx } = engine(
      {},
      clip({
        [-2]: [[0.4, 0.5, 0.9]],
        [-1]: [[0.9, 0.9, 0.1]],
        [0]: [[0.5, 0.5, 0.8]],
        [1]: [[0.6, 0.5, 0.7]],
      }),
    );
    const scene = await loadScene(E);
    scene.render(E, 1, "rt");
    // (0.4 + 0.5 + 0.6) / 3 = the clip's center, which a cover fit puts at the frame's center
    const boxes = ctx.draws.filter((d) => d.op === "strokeRect");
    expect(boxes).toHaveLength(1);
    const [x, y, w, h] = boxes[0].args as number[];
    expect(x).toBeCloseTo(960 - 60);
    expect(y).toBeCloseTo(540 - 70);
    expect([w, h]).toEqual([120, 140]);
  });

  it("drops the tracked label when no landmark is confident", async () => {
    const { E, ctx, calls } = engine({}, clip({ [0]: [[0.5, 0.5, 0.2]] }));
    const scene = await loadScene(E);
    scene.render(E, 1, "rt");
    expect(ctx.draws.filter((d) => d.op === "strokeRect")).toEqual([]);
    expect(calls.drawText).toHaveLength(1);
  });

  it("punches the camera on kicks and keeps the subtitles on", async () => {
    const { E, calls } = engine({}, clip());
    const scene = await loadScene(E);
    scene.render(E, 1.2, "rt");
    expect(calls.pulse).toEqual([["kicks", 1.2, 0.09]]);
    expect(E.post.punch).toBeCloseTo(0.015);
    expect(E.hud).toEqual({ theme: "dark", sub: true });
  });
});

describe("timeline template", () => {
  it("is a valid starting timeline for the engine", async () => {
    const TL = await import(`${ASSETS}/timeline.template.js`);
    expect(resolveCanvas(null, TL.CANVAS)).toEqual([1920, 1080]);
    for (const entry of TL.TIMELINE) {
      expect(entry.start).toBeLessThan(entry.end);
      expect(() => canvasTags(entry)).not.toThrow();
    }
    const hud = TL.TIMELINE.find((e: { id: string }) => e.id === "hud");
    expect(hud).toMatchObject({ start: 0, z: 100 });
    expect(TL.TIMELINE.every((e: { z: number }) => e.z <= hud.z)).toBe(true);
    const starts = TL.HUD.sections.map((s: [number, string]) => s[0]);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts[0]).toBe(0);
    expect(TL.POST).toEqual({});
  });
});
