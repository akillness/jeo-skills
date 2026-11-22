// kit-surface-draw.js - the pixel work behind kit-surface.js: one seeded height field per
// material family and the three canvases derived from it. Split out so both files stay under
// the 200-line kit rule; nothing here imports three or touches the scene graph. Every field
// is sampled from a wrapping lattice, so every map tiles seamlessly under RepeatWrapping.

/** Authored per family: tile pitch in metres, normal strength, albedo floor, roughness floor.
 *  Quoted in the kits README; 9A worker B moves them into `knowledge.surface-tier-defaults`.
 *  Both maps are *multipliers* - three multiplies map by `material.color` and roughnessMap by
 *  `material.roughness` - so both run up to 1.0 and only their floor is authored. */
export const STYLE = {
  wood: { tile_m: 0.6, normal: 0.20, albedo: 0.78, rough: 0.74 },
  plaster: { tile_m: 1.2, normal: 0.50, albedo: 0.84, rough: 0.86 },
  stone: { tile_m: 0.8, normal: 0.85, albedo: 0.72, rough: 0.78 },
  'roof-tile': { tile_m: 0.35, normal: 0.90, albedo: 0.70, rough: 0.76 },
  metal: { tile_m: 0.5, normal: 0.30, albedo: 0.82, rough: 0.45 },
  fabric: { tile_m: 0.4, normal: 0.50, albedo: 0.78, rough: 0.88 }
};

const SOBEL_GAIN = 6;   // turns a 0..1 height difference per texel into a usable slope

/** A wrapping value-noise lattice. Rectangular on purpose: brushed metal needs cells wide in
 *  u and fine in v, and a square lattice can only make isotropic noise. */
function lattice(cellsX, cellsY, random) {
  const grid = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < grid.length; i += 1) grid[i] = random();
  return { cellsX, cellsY, grid };
}

/** Bilinear sample of a lattice at (x, y) in tile units; both axes wrap. Closure-free on
 *  purpose: it runs ~9 M times per 1024 map and a per-texel closure cost 5x (measured). */
function sample({ cellsX, cellsY, grid }, x, y) {
  const fx = x * cellsX, fy = y * cellsY;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const xa = ((x0 % cellsX) + cellsX) % cellsX, ya = ((y0 % cellsY) + cellsY) % cellsY;
  const xb = xa + 1 === cellsX ? 0 : xa + 1;
  const rowA = ya * cellsX, rowB = (ya + 1 === cellsY ? 0 : ya + 1) * cellsX;
  const top = grid[rowA + xa] + (grid[rowA + xb] - grid[rowA + xa]) * tx;
  const low = grid[rowB + xa] + (grid[rowB + xb] - grid[rowB + xa]) * tx;
  return top + (low - top) * ty;
}

/** Halving-amplitude octaves of one wrapping noise, normalised back into 0..1. */
function fbm(layers, x, y) {
  let value = 0, weight = 0, amplitude = 1;
  for (const layer of layers) {
    value += sample(layer, x, y) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
  }
  return value / weight;
}

/** Distance to the nearest cell joint: 0 at the joint, 0.5 at the cell centre. */
function joint(t) { return 0.5 - Math.abs((t % 1) - 0.5); }

/** Evaluate `fn(u, v)` over a size x size grid, clamped into 0..1. */
function field(size, fn) {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      out[y * size + x] = Math.min(1, Math.max(0, fn(x / size, y / size)));
    }
  }
  return out;
}

/** Four planks of fine warped grain, parted by a seam groove. High-frequency and shallow on
 *  purpose: a low-frequency ring turns into a molten blob under a normal map (measured). */
function wood(size, random) {
  const grain = [lattice(4, 4, random), lattice(16, 16, random), lattice(64, 64, random)];
  const planks = 4;
  return field(size, (x, y) => {
    const plank = Math.floor(y * planks);
    const warp = fbm(grain, x, y);
    const u = x + (plank * 0.37) % 1 + warp * 0.10;
    const rings = Math.abs(Math.sin(u * 27 * Math.PI + warp * 5));
    const seam = Math.min(1, joint(y * planks) * 14);
    return 0.52 + 0.32 * rings * seam + 0.16 * sample(grain[2], x * 2, y * 2);
  });
}

/** Trowelled lime render: broad mottle, no structure. */
function plaster(size, random) {
  const coats = [lattice(6, 6, random), lattice(24, 24, random), lattice(96, 96, random)];
  return field(size, (x, y) => 0.42 + 0.46 * fbm(coats, x, y)
                               + 0.12 * sample(coats[2], x * 3, y * 3));
}

/** Coursed rubble: half-offset rows of blocks with a recessed mortar joint. */
function stone(size, random) {
  const rock = [lattice(8, 8, random), lattice(32, 32, random), lattice(128, 128, random)];
  const rows = 5, cols = 4;
  return field(size, (x, y) => {
    const row = Math.floor(y * rows);
    const face = Math.min(1, Math.min(joint((x + (row % 2) * 0.5) * cols), joint(y * rows)) * 9);
    const block = sample(rock[0], (Math.floor((x + (row % 2) * 0.5) * cols) + 0.5) / cols,
                         (row + 0.5) / rows);
    return 0.18 + 0.5 * face * (0.7 + 0.3 * block) + 0.3 * fbm(rock, x, y) * face;
  });
}

/** Lapped clay courses: a groove between courses, a groove between tiles, per-tile firing tint. */
function roofTile(size, random) {
  const clay = [lattice(8, 8, random), lattice(32, 32, random)];
  const rows = 7, per = 6;
  return field(size, (x, y) => {
    const row = Math.floor(y * rows);
    const u = (x + (row % 2) * 0.5) * per;
    const lap = (y * rows) % 1;
    const groove = Math.min(1, joint(u) * 11);
    const course = Math.min(1, lap * 7) * (0.72 + 0.28 * Math.min(1, (1 - lap) * 3));
    const tint = 0.8 + 0.4 * sample(clay[0], (Math.floor(u) + 0.5) / per, (row + 0.5) / rows);
    return (0.22 + 0.52 * groove * course) * tint + 0.12 * fbm(clay, x * 2, y * 2);
  });
}

/** Brushed sheet: fine streaks along u from a lattice that is 64x wider than it is tall. */
function metal(size, random) {
  const brush = [lattice(4, 4, random), lattice(16, 16, random)];
  const streak = lattice(4, 256, random);
  return field(size, (x, y) => 0.58 + 0.26 * sample(streak, x, y) + 0.16 * fbm(brush, x, y));
}

/** Plain weave: warp over weft on alternating cells, plus a fibre fuzz. */
function fabric(size, random) {
  const fuzz = [lattice(16, 16, random), lattice(64, 64, random)];
  const threads = 24;
  return field(size, (x, y) => {
    const warp = Math.abs(Math.sin(x * threads * Math.PI));
    const weft = Math.abs(Math.sin(y * threads * Math.PI));
    const over = (Math.floor(x * threads) + Math.floor(y * threads)) % 2 ? warp : weft;
    return 0.34 + 0.44 * over + 0.22 * fbm(fuzz, x, y);
  });
}
const GENERATORS = { wood, plaster, stone, 'roof-tile': roofTile, metal, fabric };

/** The seeded 0..1 height field for one family. Every map below is derived from this one array. */
export function drawHeight(family, size, random) {
  const generator = GENERATORS[family];
  if (!generator) throw new Error(`kit-surface-draw: unknown family ${family}`);
  return generator(size, random);
}

/** A canvas holding `data` as size x size RGBA. Browser only: T2 is generated in the page. */
function canvasFrom(data, size) {
  const canvas = typeof document !== 'undefined'
    ? Object.assign(document.createElement('canvas'), { width: size, height: size })
    : new OffscreenCanvas(size, size);
  canvas.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
  return canvas;
}

/** Grey albedo in [albedo, 1]: the family supplies the pattern, the material colour the hue -
 *  the map multiplies `material.color`, so a red roof stays red and cream plaster stays cream. */
export function heightToAlbedo(height, size, family) {
  const low = STYLE[family].albedo;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < height.length; i += 1) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(255 * (low + (1 - low) * height[i]));
    data[i * 4 + 3] = 255;
  }
  return canvasFrom(data, size);
}

/** Tangent-space normal from the height field by a wrapping Sobel. NoColorSpace when uploaded. */
export function heightToNormal(height, size, strength) {
  const data = new Uint8ClampedArray(size * size * 4);
  const gain = strength * SOBEL_GAIN;
  const back = new Int32Array(size), next = new Int32Array(size);
  for (let i = 0; i < size; i += 1) { back[i] = (i + size - 1) % size; next[i] = (i + 1) % size; }
  for (let y = 0; y < size; y += 1) {
    const up = back[y] * size, row = y * size, down = next[y] * size;
    for (let x = 0; x < size; x += 1) {
      const xl = back[x], xr = next[x];
      const dx = height[up + xr] + 2 * height[row + xr] + height[down + xr]
                 - height[up + xl] - 2 * height[row + xl] - height[down + xl];
      const dy = height[down + xl] + 2 * height[down + x] + height[down + xr]
                 - height[up + xl] - 2 * height[up + x] - height[up + xr];
      const nx = -dx * gain, ny = -dy * gain;
      const length = Math.hypot(nx, ny, 1), i = (y * size + x) * 4;
      data[i] = Math.round(255 * ((nx / length) * 0.5 + 0.5));
      data[i + 1] = Math.round(255 * ((ny / length) * 0.5 + 0.5));
      data[i + 2] = Math.round(255 * ((1 / length) * 0.5 + 0.5));
      data[i + 3] = 255;
    }
  }
  return canvasFrom(data, size);
}

/** Roughness multiplier in [rough, 1]: a raised, worn surface is smoother than a recess.
 *  kit-surface compensates `material.roughness` for the mean, so T2 is not glossier than T1. */
export function heightToRoughness(height, size, family) {
  const low = STYLE[family].rough;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < height.length; i += 1) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(255 * (1 - (1 - low) * height[i]));
    data[i * 4 + 3] = 255;
  }
  return canvasFrom(data, size);
}
