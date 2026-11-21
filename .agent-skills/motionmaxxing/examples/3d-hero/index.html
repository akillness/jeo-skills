<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fathom - 3D hero demo (Motion + hero3d)</title>
<meta name="viewport" content="width=1920, height=1080">
<!-- Fathom is an INVENTED brand (call search). The mark is a split ring with a dot that lands in the gap: one physical event, lit once.
     Needs a server or render.mjs: the 3D layer is an ES module (file:// double-click is blocked by Chrome). Preview: node scripts/render.mjs index.html --still 0.4,1.3,2.4,4.2 stills -->
<link rel="stylesheet" href="../../runtime/fonts.css">
<style>
:root { --ground: #E7E2D8; --ink: #14161C; --accent: #F2542D; --font: "Inter", system-ui, sans-serif; }   /* ACCENT = the thing that was found (the dot, the last word) */
* { box-sizing: border-box; }
html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; }
/* The ground lives in HTML: a pool of warm light under the mark so the 3D contact shadow reads on something. The WebGL layer is transparent on top of it. */
#main { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: hidden; font-family: var(--font); color: var(--ink);
  background:
    radial-gradient(ellipse 46% 26% at 50% 60%, #F4F0E8 0%, rgba(244,240,232,0) 100%),
    radial-gradient(ellipse 85% 75% at 50% 34%, #EFEBE2 0%, #E2DDD2 55%, #C9C3B6 100%); }
#gl { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; display: block; }
#grain { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .06; mix-blend-mode: multiply; pointer-events: none; }   /* static noise: kills banding in the light gradient */
#line { position: absolute; left: 0; top: 806px; width: 1920px; text-align: center; font-size: 96px; line-height: 116px; font-weight: 600; letter-spacing: -0.035em; white-space: pre; }
</style>
</head>
<body>
<div id="main">
  <canvas id="gl"></canvas>
  <svg id="grain" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
  <div id="line">Every call, searchable.</div>
</div>

<script src="../../runtime/vendor/gsap.min.js"></script>
<script src="../../runtime/motion.js"></script>
<script>
const M = Motion.film({ fps: 30, duration: 6, width: 1920, height: 1080, clock: 'smooth' });
const ACCENT = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

/* The mark, as SVG outlines (y down, origin = ring centre): a ring open on the right with round ends, and a dot that sits in the opening. */
const R = 100, r = 58, c = (R - r) / 2, a = 38 * Math.PI / 180, P = (rad, th) => (rad * Math.cos(th)).toFixed(2) + ' ' + (rad * Math.sin(th)).toFixed(2);
const RING = `M ${P(R, a)} A ${R} ${R} 0 1 1 ${P(R, -a)} A ${c} ${c} 0 0 1 ${P(r, -a)} A ${r} ${r} 0 1 0 ${P(r, a)} A ${c} ${c} 0 0 1 ${P(R, a)} Z`;
const DOT = `M 65 0 A 14 14 0 1 0 93 0 A 14 14 0 1 0 65 0 Z`;
const U = 0.0155;                                                    // world units per SVG unit: ring is ~3.1 units across

/* The shot: ONE pure function of t (seconds, quantised to the film frame). The harness resets every object, light and the camera before it runs. */
const hero = M.hero3d('#gl', {
  envMap: 'studio', toneMapping: 'neutral', exposure: 1.15,
  key: { position: [-6, 6.5, 6], intensity: 2.2 }, rim: { position: [6, 3, -6], intensity: 4 },
  ground: { y: -1.62, opacity: 0.38 },
  camera: { fov: 30, position: [0, 0.3, 11], target: [0, -0.72, 0] },
  objects: [
    { id: 'mark', kind: 'group' },
    { id: 'ring', parent: 'mark', kind: 'logo', svg: RING, center: false, perUnit: U, ref: 3.1, depth: 0.12, bevelThickness: 0.03, bevelSize: 0.022,
      material: 'satin', color: '#2b3a78', materialParams: { metalness: 0.85, roughness: 0.26, clearcoat: 0.8, clearcoatRoughness: 0.05, sheen: 0, warp: { amount: 0.1, scale: 0.9 } } },
    { id: 'dot', parent: 'mark', kind: 'logo', svg: DOT, center: false, perUnit: U, ref: 3.1, depth: 0.12, bevelThickness: 0.05, bevelSize: 0.04,
      material: 'brandPlastic', color: ACCENT, materialParams: { roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05 } },
  ],
  state: (t, o, { key, pulse }) => {
    const land = 1.3, since = Math.max(0, t - land), wob = 0.045 * Math.exp(-since * 7) * Math.sin(since * 46) * (t >= land ? 1 : 0);
    const rot = key(t, [[0, [0.62, -1.75, 0.2]], [1.5, [0.1, -0.36, 0], 'snapSettle'], [6, [0.05, -0.14, 0], 'cruise']]);
    return {
      camera: { position: key(t, [[0, [1.8, 1.0, 14]], [3.4, [0.1, 0.35, 11], 'glide'], [6, [-0.15, 0.3, 10.5], 'cruise']]), target: [0, -0.72, 0], fov: 30 },
      objects: {
        mark: { position: key(t, [[0, [0.5, -0.3, -3.4]], [1.5, [0, 0, 0], 'softLand']]), rotation: [rot[0] + wob * 0.6, rot[1], rot[2] + wob] },
        dot: { position: key(t, [[0.3, [0.15, 3.6, 0.5]], [land, [0, 0, 0], 'gentleIn']]) },       // falls in and stops dead in the gap; the mark takes the hit (wob)
      },
      keyPosition: key(t, [[0, [-6, 6.5, 6]], [4, [-2.5, 5.5, 7.5], 'cruise']]),
      keyIntensity: 2.2 + 1.6 * pulse(t, land + 0.04, 0.09),                                            // the landing catches light on the bevel
    };
  },
});

/* One Motion text beat, on the same clock. The mark has settled; the line arrives in speech rhythm. */
M.words('#line', { at: 84, mech: 'rise', dist: 72, gaps: [5, 4, 7], smear: true, accent: { color: ACCENT, frames: 24, word: -1 } });
M.kf('#line', 'scale', [[84, 1], [180, 1.035]]);                    // never freeze

window.__ready = Motion.loaded().then(() => { if (/selftest/.test(location.search)) Motion.selfTest(M, { samples: 12 }); });
</script>
</body>
</html>
