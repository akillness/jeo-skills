import { beforeEach, describe, expect, it, vi } from "vitest";

// plate.js hands three a mesh per draw: three is a recording stand-in, so the tests read
// the uniforms, transform and camera the real drawPlate set before it rendered.
vi.mock("three", async () => (await import("./engine-fakes")).three);

const PLATE =
  "../../skills/scenario-kinetic-music-video/assets/engine/plate.js";

type Uniforms = Record<string, { value: any }>;
type Mesh = {
  material: { uniforms: Uniforms };
  scale: { x: number; y: number; z: number };
  position: { x: number; y: number };
  rotation: { z: number };
};
type Rendered = {
  scene: { children: Mesh[] };
  cam: Record<string, number>;
  mesh: Mesh;
  uniforms: Record<string, unknown>;
};

let plate: Record<string, any>;
beforeEach(async () => {
  // drawPlate keeps its mesh pool at module level; each test starts with an empty one
  vi.resetModules();
  plate = await import(PLATE);
});

const clip = { meta: { w: 1920, h: 1080 }, tex: "video", mtex: "matte" };
function engine(frame = 1) {
  const renders: Rendered[] = [];
  const E = {
    W: 1920,
    H: 1080,
    SCALE: 1,
    frame,
    renderer: {
      render: (scene: { children: Mesh[] }, cam: Record<string, number>) => {
        const mesh = scene.children[0];
        const uniforms = Object.fromEntries(
          Object.entries(mesh.material.uniforms).map(([k, u]) => [
            k,
            typeof u.value === "object" && u.value ? { ...u.value } : u.value,
          ]),
        );
        renders.push({ scene, cam: { ...cam }, mesh, uniforms });
      },
    },
  };
  return { E, renders };
}

describe("makePlateMaterial", () => {
  it("draws the full clip, opaque and premultiplied, by default", () => {
    const m = plate.makePlateMaterial();
    const u = m.uniforms as Uniforms;
    expect([u.uMatte, u.uInvMatte, u.uMirror].map((x) => x.value)).toEqual([
      0, 0, 0,
    ]);
    expect(u.uOpacity.value).toBe(1);
    expect(u.uFeather.value).toBe(0.12);
    expect(u.uCrop.value).toMatchObject({ x: 0, y: 0, z: 1, w: 1 });
    expect(m).toMatchObject({
      transparent: true,
      depthTest: false,
      blendSrc: "OneFactor",
      blendDst: "OneMinusSrcAlphaFactor",
    });
  });

  it("takes the matte, invert, opacity, feather and mirror options", () => {
    const u = plate.makePlateMaterial({
      matte: true,
      invert: true,
      opacity: 0.4,
      feather: 0.3,
      mirror: true,
    }).uniforms as Uniforms;
    expect(
      ["uMatte", "uInvMatte", "uOpacity", "uFeather", "uMirror"].map(
        (k) => u[k].value,
      ),
    ).toEqual([1, 1, 0.4, 0.3, 1]);
  });
});

describe("plateToScreen with rotation", () => {
  it("rotates a clip point about the plate's center", () => {
    const { E } = engine();
    // cover on a matching canvas: the plate is the frame, centered at (960, 540)
    const [x, y] = plate.plateToScreen(E, clip, [1, 0.5], { rot: Math.PI / 2 });
    expect(x).toBeCloseTo(960);
    expect(y).toBeCloseTo(540 + 960);
    const c = plate.plateToScreen(E, clip, [0.5, 0.5], { rot: 1 });
    expect(c[0]).toBeCloseTo(960);
    expect(c[1]).toBeCloseTo(540);
  });
});

describe("drawPlate", () => {
  it("renders the clip as a quad over its plate rect in pixel space", () => {
    const { E, renders } = engine();
    plate.drawPlate(E, clip, { x: 10, y: -20, zoom: 2, rot: 0.3 });
    expect(renders).toHaveLength(1);
    const [{ cam, mesh, uniforms }] = renders;
    expect(cam).toMatchObject({ left: 0, right: 1920, top: 0, bottom: 1080 });
    expect(cam.projectionUpdates).toBe(1);
    // y is flipped so the clip's top row lands at the top of the frame
    expect([mesh.scale.x, mesh.scale.y]).toEqual([3840, -2160]);
    expect([mesh.position.x, mesh.position.y]).toEqual([970, 520]);
    expect(mesh.rotation.z).toBe(0.3);
    expect(uniforms).toMatchObject({ tVideo: "video", tMatte: "matte" });
  });

  it("maps every option onto the shader, with the crop flipped to GL's bottom-up rows", () => {
    const { E, renders } = engine();
    plate.drawPlate(E, clip, {
      matte: true,
      invert: true,
      opacity: 0.5,
      feather: 0.2,
      mirror: true,
      crop: [0.25, 0.05, 0.5, 0.8],
    });
    expect(renders[0].uniforms).toMatchObject({
      uMatte: 1,
      uInvMatte: 1,
      uOpacity: 0.5,
      uFeather: 0.2,
      uMirror: 1,
    });
    const crop = renders[0].uniforms.uCrop as Record<string, number>;
    expect([crop.x, crop.y, crop.z, crop.w].map((n) => +n.toFixed(6))).toEqual([
      0.25, 0.15, 0.5, 0.8,
    ]);
  });

  it("gives each draw in a frame its own mesh and reuses the pool next frame", () => {
    const { E, renders } = engine(1);
    plate.drawPlate(E, clip, {});
    plate.drawPlate(E, clip, { matte: true });
    const [a, b] = renders.map((r) => r.mesh);
    expect(a).not.toBe(b);
    expect(a.material.uniforms.uMatte.value).toBe(0);
    expect(renders[1].scene.children).toEqual([b]);

    E.frame = 2;
    plate.drawPlate(E, clip, { matte: true });
    expect(renders[2].mesh).toBe(a);
    expect(renders[2].uniforms.uMatte).toBe(1);
  });

  it("restarts the pool for each motion-blur sample of the same frame", () => {
    const { E, renders } = engine(1);
    Object.assign(E, { pass: 0 });
    plate.drawPlate(E, clip, {});
    plate.drawPlate(E, clip, {});
    Object.assign(E, { pass: 1 });
    plate.drawPlate(E, clip, {});
    plate.drawPlate(E, clip, {});
    const [a, b, c, d] = renders.map((r) => r.mesh);
    expect(a).not.toBe(b);
    expect(c).toBe(a);
    expect(d).toBe(b);
  });
});

describe("plateMaterialFor", () => {
  it("binds the clip's current frame and matte every time it renders", () => {
    const v = { ...clip };
    const m = plate.plateMaterialFor(v, { matte: true });
    expect(m.uniforms.uMatte.value).toBe(1);
    v.tex = "frame 2";
    v.mtex = "matte 2";
    m.onBeforeRender();
    expect(m.uniforms.tVideo.value).toBe("frame 2");
    expect(m.uniforms.tMatte.value).toBe("matte 2");
  });
});
