// kit-surface-draw-organic.js - the two woven-and-grown families, split out of
// kit-surface-draw.js when the 200-line kit rule ran out there. Same contract as the fields in
// that file: a seeded 0..1 height array sampled from wrapping lattices, so every map still tiles
// under RepeatWrapping. The noise helpers are imported rather than copied, and the import runs
// one way only (this file -> kit-surface-draw.js); kit-surface.js is what joins the two tables.
import { fbm, field, lattice, sample } from './kit-surface-draw.js';

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

/** Pelt: a lattice of thin hair strands all lying along v, each with its own drift, length and
 *  tone, over broad low-frequency patches. Deliberately structureless across the tile - the
 *  fabric weave failed on an animal because its 24-thread grid is a *pattern* at 8 cm, while a
 *  coat has to stay uniform at every distance and only read as direction plus tone. Fine on
 *  purpose too: at 220 strands per 0.25 m tile one hair is about a millimetre, so the map keeps
 *  reading as fur even where kit-surface magnifies it onto a small limb. */
function fur(size, random) {
  const strands = 220;
  const strand = lattice(strands, 6, random);              // one cell per hair: thin u, long v
  const drift = lattice(strands, 3, random);               // where each hair starts and stops
  const wobble = [lattice(6, 6, random), lattice(23, 23, random)];   // hairs are not parallel
  const patch = [lattice(5, 5, random), lattice(17, 17, random)];
  return field(size, (x, y) => {
    const u = x * strands + fbm(wobble, x, y) * 3;               // the lie of the coat bends them
    const across = Math.abs((u % 1) - 0.5) * 2;                  // 0 on a hair, 1 in the gap
    const along = Math.abs(Math.sin((y + sample(drift, x, y)) * Math.PI * 9));
    const hair = (1 - across ** 1.6) * (0.18 + 0.82 * along ** 0.6);
    return 0.26 + 0.46 * hair * (0.62 + 0.38 * sample(strand, x, y)) + 0.26 * fbm(patch, x, y);
  });
}

/** The families drawn here. kit-surface.js prefers this table over kit-surface-draw's own. */
export const ORGANIC = { fabric, fur };
