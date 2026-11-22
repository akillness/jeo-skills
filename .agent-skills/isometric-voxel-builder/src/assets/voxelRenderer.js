/**
 * voxelRenderer.js
 *
 * Procedural isometric voxel renderer.
 *
 * Given a list of voxels — each with integer (x, y, z) world coordinates and
 * a fill color — this renders them to an offscreen canvas using simple
 * back-to-front painter's algorithm and a 3-face cube primitive.
 *
 * The output canvas is sized to fit exactly. Anchors are returned so the
 * renderer can place each sprite correctly on its grid cell footprint.
 */

import { CONFIG } from '../config.js';

const VW = CONFIG.voxel.size;     // voxel top-face width in screen pixels
const VH = CONFIG.voxel.height;   // voxel vertical extent in screen pixels

/**
 * Convert a world voxel position to local screen coords (top-back corner of
 * the voxel's top face).
 */
export function voxelToScreen(vx, vy, vz) {
    const sx = (vx - vy) * (VW / 2);
    const sy = (vx + vy) * (VW / 4) - vz * VH;
    return { sx, sy };
}

/**
 * Lighten/darken a hex color by a fraction (-1..1).
 */
export function shadeHex(hex, amount) {
    const h = hex.replace('#', '');
    const num = parseInt(h.length === 3
        ? h.split('').map(c => c + c).join('')
        : h, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >>  8) & 0xff;
    let b =  num        & 0xff;
    if (amount >= 0) {
        r = Math.round(r + (255 - r) * amount);
        g = Math.round(g + (255 - g) * amount);
        b = Math.round(b + (255 - b) * amount);
    } else {
        r = Math.round(r * (1 + amount));
        g = Math.round(g * (1 + amount));
        b = Math.round(b * (1 + amount));
    }
    return `#${[r,g,b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Draw one voxel cube on a 2D context. Anchor is the pixel position of the
 * top-back corner of the cube's top face.
 */
function drawVoxel(ctx, ax, ay, color, opts = {}) {
    const w = VW, h = VH;
    const halfW = w / 2;
    const quartW = w / 4;

    const top    = opts.topColor    ?? shadeHex(color,  0.18);
    const right  = opts.rightColor  ?? color;
    const left   = opts.leftColor   ?? shadeHex(color, -0.18);

    // Top face (diamond): back, right, front, left
    ctx.beginPath();
    ctx.moveTo(ax,           ay);                  // back
    ctx.lineTo(ax + halfW,   ay + quartW);         // right
    ctx.lineTo(ax,           ay + halfW);          // front
    ctx.lineTo(ax - halfW,   ay + quartW);         // left
    ctx.closePath();
    ctx.fillStyle = top;
    ctx.fill();

    // Right face
    ctx.beginPath();
    ctx.moveTo(ax + halfW,   ay + quartW);
    ctx.lineTo(ax + halfW,   ay + quartW + h);
    ctx.lineTo(ax,           ay + halfW + h);
    ctx.lineTo(ax,           ay + halfW);
    ctx.closePath();
    ctx.fillStyle = right;
    ctx.fill();

    // Left face
    ctx.beginPath();
    ctx.moveTo(ax - halfW,   ay + quartW);
    ctx.lineTo(ax - halfW,   ay + quartW + h);
    ctx.lineTo(ax,           ay + halfW + h);
    ctx.lineTo(ax,           ay + halfW);
    ctx.closePath();
    ctx.fillStyle = left;
    ctx.fill();
}

/**
 * Render a sorted voxel list to an offscreen canvas.
 *
 * @param voxels Array of { x, y, z, c, top?, right?, left? }.
 * @param footprint Object { w, d } — number of grid cells along x, y.
 * @returns { canvas, anchorX, anchorY, width, height }.
 *          anchor* is the pixel offset of grid (0,0,0) inside the canvas.
 */
export function renderVoxels(voxels, footprint = { w: 1, d: 1 }) {
    if (!voxels.length) {
        const c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        return { canvas: c, anchorX: 0, anchorY: 0, width: 1, height: 1 };
    }

    // Standard iso painter's: sort by x + y ascending, then z ascending.
    const sorted = voxels.slice().sort((a, b) => {
        const da = a.x + a.y;
        const db = b.x + b.y;
        if (da !== db) return da - db;
        return a.z - b.z;
    });

    // Compute bounding box in screen space, considering each voxel cube spans
    // VW horizontally and VH+VW/2 vertically.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of sorted) {
        const { sx, sy } = voxelToScreen(v.x, v.y, v.z);
        const left   = sx - VW / 2;
        const right  = sx + VW / 2;
        const top    = sy;
        const bottom = sy + VW / 2 + VH;
        if (left   < minX) minX = left;
        if (right  > maxX) maxX = right;
        if (top    < minY) minY = top;
        if (bottom > maxY) maxY = bottom;
    }

    const pad = 2;
    const width  = Math.ceil(maxX - minX) + pad * 2;
    const height = Math.ceil(maxY - minY) + pad * 2;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Anchor: where world (0,0,0) sits inside this canvas.
    // World (0,0,0) maps to screen (0,0) (top-back corner of its top face).
    const anchorX = -minX + pad;
    const anchorY = -minY + pad;

    for (const v of sorted) {
        const { sx, sy } = voxelToScreen(v.x, v.y, v.z);
        drawVoxel(ctx, anchorX + sx, anchorY + sy, v.c, {
            topColor:   v.top,
            rightColor: v.right,
            leftColor:  v.left,
        });
    }

    return { canvas, anchorX, anchorY, width, height, footprint };
}

/* ─── Voxel composition helpers ──────────────────────────────────── */

/**
 * Generate voxels for a solid filled box.
 */
export function box(x, y, z, w, d, h, color) {
    const out = [];
    for (let ix = 0; ix < w; ix++)
    for (let iy = 0; iy < d; iy++)
    for (let iz = 0; iz < h; iz++) {
        out.push({ x: x + ix, y: y + iy, z: z + iz, c: color });
    }
    return out;
}

/**
 * Generate voxels for the outer shell (walls only) of a box.
 */
export function shell(x, y, z, w, d, h, color, opts = {}) {
    const out = [];
    const { floor = false, roof = false, sides = true } = opts;
    for (let ix = 0; ix < w; ix++)
    for (let iy = 0; iy < d; iy++)
    for (let iz = 0; iz < h; iz++) {
        const onBottom = iz === 0;
        const onTop    = iz === h - 1;
        const onSide   = ix === 0 || ix === w - 1 || iy === 0 || iy === d - 1;
        if ((sides && onSide) || (floor && onBottom) || (roof && onTop)) {
            out.push({ x: x + ix, y: y + iy, z: z + iz, c: color });
        }
    }
    return out;
}

/**
 * Pyramid roof centered on x,y with base size w×d at z, peaking at peakZ.
 */
export function pyramidRoof(x, y, z, w, d, h, color) {
    const out = [];
    for (let iz = 0; iz < h; iz++) {
        const inset = iz;
        const w2 = w - 2 * inset;
        const d2 = d - 2 * inset;
        if (w2 <= 0 || d2 <= 0) break;
        for (let ix = 0; ix < w2; ix++)
        for (let iy = 0; iy < d2; iy++) {
            out.push({ x: x + inset + ix, y: y + inset + iy, z: z + iz, c: color });
        }
    }
    return out;
}

/**
 * A blue dome (rounded). The radius is integer; we approximate via
 * decreasing disc layers.
 */
export function dome(cx, cy, z, radius, color) {
    const out = [];
    const r = radius;
    for (let iz = 0; iz <= r; iz++) {
        const layerR = Math.sqrt(r * r - iz * iz);
        const lr = Math.max(0, layerR);
        const lrCeil = Math.round(lr);
        for (let ix = -lrCeil; ix <= lrCeil; ix++)
        for (let iy = -lrCeil; iy <= lrCeil; iy++) {
            const dist = Math.sqrt(ix * ix + iy * iy);
            if (dist <= lr + 0.4) {
                out.push({ x: cx + ix, y: cy + iy, z: z + iz, c: color });
            }
        }
    }
    return out;
}

/**
 * A vertical cylinder approximated by stacked discs.
 */
export function cylinder(cx, cy, z, radius, h, color) {
    const out = [];
    for (let ix = -radius; ix <= radius; ix++)
    for (let iy = -radius; iy <= radius; iy++) {
        if (ix * ix + iy * iy > radius * radius + 0.5) continue;
        for (let iz = 0; iz < h; iz++) {
            out.push({ x: cx + ix, y: cy + iy, z: z + iz, c: color });
        }
    }
    return out;
}

/**
 * Concatenate multiple voxel arrays into one.
 */
export function compose(...arrs) {
    const out = [];
    for (const a of arrs) {
        if (!a) continue;
        for (const v of a) out.push(v);
    }
    return out;
}

/**
 * Replace voxels at given (x,y,z) positions with a different color (used for
 * windows, doors, accents). Mutates the array in place; matching is exact.
 */
export function paintAt(voxels, predicate, color) {
    for (const v of voxels) {
        if (predicate(v)) v.c = color;
    }
    return voxels;
}
