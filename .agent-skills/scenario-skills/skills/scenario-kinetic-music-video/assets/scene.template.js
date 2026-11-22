// SCENE TEMPLATE. Copy to engine/scenes/<id>.js and add it to engine/timeline.js.
// Write the beat-by-beat plan here first: every lyric word + onset (engine/data/lyrics.json), the visual event, its layer
// (BACK / MID / FRONT), the camera move, and which beat or downbeat each cut lands on.
//
// PLAN
//   t      word/event          visual                                   layer   camera / cut
//   0.00   (hard cut in)       ...                                      ...     ...
//
// Layer recipe over footage ("type behind the subject"):
//   BACK graphics -> drawPlate(v) -> MID graphics -> drawPlate(v, {matte:true}) -> FRONT graphics (tracked to the subject)
// Pure-graphics moments skip the plates and render 2D/3D only.
import * as THREE from "three";

const CLIP = "clip_a"; // a folder in assets/video/ (prepped by tools/prep_clip.sh)
const SLOT = 0.0; // song time at clip frame 1, for clips generated against the song (lip-sync, beat-guided dance): local = t - SLOT
let v = null,
  g,
  scene,
  cam,
  word;

// smooth a tracked landmark over +-2 frames (raw pose jitter looks cheap)
function smoothPt(v, localT, idx) {
  let x = 0,
    y = 0,
    n = 0;
  for (let k = -2; k <= 2; k++) {
    const tr = v.trackAt(localT + k / v.meta.fps);
    const p = tr?.pose?.[idx];
    if (p && p[2] > 0.3) {
      x += p[0];
      y += p[1];
      n++;
    }
  }
  return n ? [x / n, y / n] : null;
}

export default {
  async load(E, layer) {
    // under motion blur: E.cut(t) for each hard switch inside this scene, E.fast(t0, t1, 16) on slams (ENGINE_API.md)
    try {
      v = await E.loadVideo(CLIP);
    } catch (e) {
      console.warn("footage missing", CLIP);
    }
    g = E.makeG2D(E.W, E.H); // one full-res 2D surface, reused for MID and FRONT
    // 3D hero type: keep the front face's luminance below the bloom threshold, or a large face blurs (1.3 suits the amber accent; a near-white one needs 1 or less)
    // these sides stay dark; for a glow, lift the side material past the threshold, never the front (ENGINE_API.md)
    scene = new THREE.Scene();
    cam = E.safeCamera(new THREE.PerspectiveCamera(40, E.W / E.H, 0.1, 200)); // origin = center of the safe band
    cam.position.set(0, 0, 10);
    word = new THREE.Mesh(
      E.text3D("HELLO", { font: "ArchivoBlack", size: 1.6, depth: 0.45 }),
      [
        new THREE.MeshBasicMaterial({ color: E.col(E.PAL.accent, 1.3) }),
        new THREE.MeshBasicMaterial({ color: E.col(E.PAL.ember, 0.8) }),
      ],
    );
    scene.add(word);
    // off landscape, pull back until the word spans 75% of the safe band (its pop overshoots about 1.3x at the peak)
    if (E.ORIENT !== "landscape") {
      word.geometry.computeBoundingBox();
      const bb = word.geometry.boundingBox,
        tanHalfW = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
      const fill = (0.75 * E.SAFE.w) / E.W;
      cam.position.z = Math.max(
        10,
        (bb.max.x - bb.min.x) / fill / (2 * tanHalfW),
      );
    }
  },
  async prepare(E, t) {
    if (v) await v.frame(Math.max(0, t - SLOT));
  }, // never let a clip freeze: keep localT inside the clip
  render(E, t, rt) {
    const S = E.SCALE,
      c = g.ctx,
      local = t - SLOT;
    E.renderer.setRenderTarget(rt);
    const w = E.words.find((x) => x.w.toUpperCase() === "HELLO");
    if (v) {
      // clean plate: 'cover' fills the frame when the clip's shape matches the canvas, 'contain' windows it when not
      const fit = E.plateFit(E, v);
      E.drawPlate(E, v, { fit });
      g.clear(); // MID: giant type behind the subject
      // Landscape keeps the full-bleed slam. Narrower canvases fit the word to the safe band and pop it in from below 1,
      // so the overshoot stays inside the band.
      const hero = { font: "Archivo", weight: 900, stretch: "125%" };
      const R = E.SAFE,
        wide = E.ORIENT === "landscape";
      const size = wide
        ? 420 * S
        : E.fitSize(c, "HELLO.", { ...hero, size: 420 * S }, R.w * 0.8);
      E.drawText(c, "HELLO.", R.x + R.w / 2, R.y + R.h * 0.45, {
        ...hero,
        size,
        color: E.PAL.accent,
        align: "center",
        s: w
          ? E.popScale(t, w.s, { k: 300, z: 0.45, from: wide ? 1.6 : 0.6 })
          : 1,
        alpha: w ? E.wordAlpha(t, w.s, w.e) : 1,
      });
      g.commit();
      E.blitG2D(E, g, 1);
      E.drawPlate(E, v, { fit, matte: true }); // subject back in front, same framing
      g.clear(); // FRONT: label locked to the nose (pose landmark 0)
      const p = smoothPt(v, local, 0);
      if (p) {
        const [x, y] = E.plateToScreen(E, v, p, { fit });
        c.strokeStyle = E.PAL.white;
        c.lineWidth = 3 * S;
        c.strokeRect(x - 60 * S, y - 70 * S, 120 * S, 140 * S);
        E.drawText(c, "SUBJECT_01", x + 70 * S, y - 60 * S, {
          font: "JetBrains Mono",
          weight: 700,
          size: 22 * S,
          color: E.PAL.white,
          align: "left",
        });
      }
      g.commit();
      E.blitG2D(E, g, 1);
    } else {
      word.scale.setScalar(Math.max(0.001, w ? E.popScale(t, w.s) : 1)); // pure-graphics fallback: 3D word on the onset
      E.renderer.render(scene, cam);
    }
    E.post.punch = 0.03 * E.pulse("kicks", t, 0.09); // camera punch on kicks (moves the frame, never alters pixels)
    E.hud.theme = "dark"; // 'light' on white/colour frames
    E.hud.sub = true; // false only while this scene shows the full sung line itself
  },
};
