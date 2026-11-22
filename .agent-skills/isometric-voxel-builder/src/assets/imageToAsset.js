/**
 * imageToAsset.js
 *
 * Takes a freshly loaded HTMLImageElement (from /assets/<id>.png) and turns
 * it into the canonical asset record used everywhere else in the game:
 *   { canvas, width, height, anchorX, anchorY }
 *
 * Convention:
 *   - For OBJECTS, the base footprint diamond sits flush at the bottom-center
 *     of the rendered canvas (the building/prop extends upward above it).
 *   - For TERRAIN, the diamond top sits at the top of the canvas; any side
 *     walls drawn in the source PNG hang BELOW the diamond. Painter's-order
 *     rendering then makes each tile-in-front cover the previous tile's
 *     walls, while the front-most row keeps its visible thickness.
 *   - anchorX/anchorY are positioned at the BACK CORNER of that footprint
 *     diamond (= where world voxel (0, 0, 0) lives) so the existing renderer
 *     can place the asset by anchoring on `cellToScreen(gx, gy)` exactly the
 *     same way it does for the procedural fallback.
 */

import { CONFIG } from '../config.js';

const TW = CONFIG.tile.w;
const TH = CONFIG.tile.h;

/**
 * Crop transparent borders off an HTMLImageElement and return a canvas
 * containing just the visible pixels.
 */
export function trimTransparent(image) {
    const w0 = image.naturalWidth || image.width;
    const h0 = image.naturalHeight || image.height;
    const tmp = document.createElement('canvas');
    tmp.width = w0;
    tmp.height = h0;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(image, 0, 0);

    let data;
    try {
        data = tctx.getImageData(0, 0, w0, h0).data;
    } catch (e) {
        // Cross-origin tainted; fall back to using the raw image as-is.
        return { canvas: tmp, width: w0, height: h0 };
    }

    let minX = w0, minY = h0, maxX = -1, maxY = -1;
    for (let y = 0; y < h0; y++) {
        for (let x = 0; x < w0; x++) {
            const a = data[(y * w0 + x) * 4 + 3];
            if (a > 12) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) {
        return { canvas: tmp, width: w0, height: h0 };
    }
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    out.getContext('2d').drawImage(tmp, minX, minY, cw, ch, 0, 0, cw, ch);
    return { canvas: out, width: cw, height: ch };
}

/**
 * Find the asset's visual "base diamond" (its foundation slab).
 *
 * We only look in the BOTTOM 25% of the trimmed image so wide things up
 * top — windmill vanes, tree canopies, building bougainvillea — never get
 * mistaken for the base. The widest opaque row in that band is taken as
 * the base's middle row (which corresponds to the diamond's left & right
 * corners on screen).
 *
 * Returns null when the detected base is narrower than half the trimmed
 * width, which means the asset has no real foundation slab (a tree, a
 * post, a free-standing prop). Callers fall back to a simple width-fit
 * anchor in that case.
 */
function detectVisualBase(trimmedCanvas) {
    const w = trimmedCanvas.width;
    const h = trimmedCanvas.height;
    let data;
    try {
        data = trimmedCanvas.getContext('2d').getImageData(0, 0, w, h).data;
    } catch {
        return null;
    }

    const yStart = Math.floor(h * 0.75);
    let bestY = -1, bestL = 0, bestR = -1, bestW = 0;
    for (let y = yStart; y < h; y++) {
        let l = w, r = -1;
        const rowOff = y * w * 4;
        for (let x = 0; x < w; x++) {
            if (data[rowOff + x * 4 + 3] > 12) {
                if (x < l) l = x;
                if (x > r) r = x;
            }
        }
        const rowW = r - l + 1;
        if (r >= 0 && rowW > bestW) {
            bestW = rowW;
            bestY = y;
            bestL = l;
            bestR = r;
        }
    }

    if (bestY < 0 || bestW < w * 0.5) return null;
    return { y: bestY, left: bestL, right: bestR, width: bestW };
}

/**
 * Find the geometry of the source image's TOP DIAMOND — the iso-projected
 * surface of the voxel block / tile.
 *
 * The silhouette of a typical AI-rendered iso voxel cube is a HEXAGON:
 *   • Topmost vertex   = back corner of the top diamond
 *   • Upper-left/right = LEFT and RIGHT corners of the top diamond
 *                        (also where the side-walls begin going straight
 *                         down)
 *   • Lower-left/right = LEFT and RIGHT corners of the bottom diamond
 *                        (where the side-walls end)
 *   • Bottom vertex    = front corner of the bottom diamond
 *
 * We detect the upper-left/right corners by finding the FIRST y from the
 * top where the silhouette reaches its global x-extreme. From those, the
 * "front corner of the top diamond" (where the diamond top ends and the
 * front face begins) is inferred via 2:1 isometric proportions.
 *
 * Returns null if anything looks degenerate.
 */
function detectTopDiamondGeometry(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    let data;
    try { data = canvas.getContext('2d').getImageData(0, 0, w, h).data; }
    catch { return null; }

    const lefts  = new Int32Array(h);
    const rights = new Int32Array(h);
    let xMin = w, xMax = -1;
    for (let y = 0; y < h; y++) {
        let l = w, r = -1;
        const rowOff = y * w * 4;
        for (let x = 0; x < w; x++) {
            if (data[rowOff + x * 4 + 3] > 12) {
                if (x < l) l = x;
                if (x > r) r = x;
            }
        }
        lefts[y]  = r >= 0 ? l : -1;
        rights[y] = r;
        if (r >= 0) {
            if (l < xMin) xMin = l;
            if (r > xMax) xMax = r;
        }
    }
    if (xMax < 0) return null;

    let topY = -1;
    for (let y = 0; y < h; y++) {
        if (rights[y] >= 0) { topY = y; break; }
    }

    let leftCornerY = -1;
    for (let y = 0; y < h; y++) {
        if (lefts[y] === xMin) { leftCornerY = y; break; }
    }
    let rightCornerY = -1;
    for (let y = 0; y < h; y++) {
        if (rights[y] === xMax) { rightCornerY = y; break; }
    }
    if (leftCornerY < 0 || rightCornerY < 0) return null;
    const cornerY = Math.max(leftCornerY, rightCornerY);

    const diamondWidth = xMax - xMin;
    if (diamondWidth < 8) return null;
    // True 2:1 isometric: the top-diamond's front corner sits diamondWidth/4
    // pixels below its left/right corners. We clamp into the image just in
    // case the source runs short.
    const frontCornerY = Math.min(h - 1, cornerY + Math.round(diamondWidth / 4));
    // Sanity: the diamond top must fit above the front corner.
    if (frontCornerY <= topY + 4) return null;

    return {
        topY,
        cornerY,
        frontCornerY,
        xMin,
        xMax,
        diamondWidth,
        diamondHeight: frontCornerY - topY,
    };
}

/**
 * Sample the average RGB of the AI-drawn left and right side-walls of an
 * iso voxel block source. Used to drive a procedural side-wall pass that
 * looks like the asset but tiles cleanly across cells.
 *
 * The sample band starts a little below the source's top-diamond front
 * corner (= where side-walls begin) and stops within ~25% of the diamond
 * width, which is well clear of the bottom-most highlight strip. We split
 * by horizontal centre because the iso projection puts the left face on
 * the left half of the silhouette and the right face on the right half.
 */
function sampleSideWallColors(canvas, geo) {
    const w = canvas.width;
    const h = canvas.height;
    let data;
    try { data = canvas.getContext('2d').getImageData(0, 0, w, h).data; }
    catch { return null; }

    const center = Math.round((geo.xMin + geo.xMax) / 2);
    const yStart = Math.min(h - 1, geo.frontCornerY + Math.round(geo.diamondWidth / 16));
    const yEnd   = Math.min(h - 1, geo.frontCornerY + Math.round(geo.diamondWidth / 4));
    if (yEnd - yStart < 4) return null;

    let lR=0, lG=0, lB=0, lN=0;
    let rR=0, rG=0, rB=0, rN=0;
    for (let y = yStart; y <= yEnd; y++) {
        const rowOff = y * w * 4;
        for (let x = geo.xMin; x <= geo.xMax; x++) {
            const i = rowOff + x * 4;
            if (data[i + 3] > 200) {
                if (x < center) { lR += data[i]; lG += data[i + 1]; lB += data[i + 2]; lN++; }
                else            { rR += data[i]; rG += data[i + 1]; rB += data[i + 2]; rN++; }
            }
        }
    }
    if (lN < 20 || rN < 20) return null;
    return {
        left:  `rgb(${(lR / lN) | 0},${(lG / lN) | 0},${(lB / lN) | 0})`,
        right: `rgb(${(rR / rN) | 0},${(rG / rN) | 0},${(rB / rN) | 0})`,
    };
}

/**
 * Paint a single iso voxel-block side-wall (left + right faces) into ctx
 * starting just below the cell's diamond top.
 *
 * The shape is procedural and identical for every cell of the same asset,
 * so adjacent placements produce a perfectly continuous platform side
 * (no staircase, no AI-pattern mismatch). We add a thin 1-px highlight
 * along the top edge of the front face and a 1-px shadow along the
 * bottom — just enough to read as a chunky 3D voxel slab without going
 * full procedural-detail.
 */
function paintCleanSideWalls(ctx, isoW, isoH, sideH, colors) {
    // Left face
    ctx.fillStyle = colors.left;
    ctx.beginPath();
    ctx.moveTo(0,        isoH / 2);
    ctx.lineTo(isoW / 2, isoH);
    ctx.lineTo(isoW / 2, isoH + sideH);
    ctx.lineTo(0,        isoH / 2 + sideH);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = colors.right;
    ctx.beginPath();
    ctx.moveTo(isoW / 2, isoH);
    ctx.lineTo(isoW,     isoH / 2);
    ctx.lineTo(isoW,     isoH / 2 + sideH);
    ctx.lineTo(isoW / 2, isoH + sideH);
    ctx.closePath();
    ctx.fill();

    // Soft inner shadow along the top corner edge so the diamond reads
    // as resting on top of the slab (without crisp aliased seams).
    const grad = ctx.createLinearGradient(0, isoH, 0, isoH + sideH * 0.4);
    grad.addColorStop(0, 'rgba(0,0,0,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0,        isoH / 2);
    ctx.lineTo(isoW / 2, isoH);
    ctx.lineTo(isoW,     isoH / 2);
    ctx.lineTo(isoW,     isoH / 2 + sideH * 0.4);
    ctx.lineTo(isoW / 2, isoH + sideH * 0.4);
    ctx.lineTo(0,        isoH / 2 + sideH * 0.4);
    ctx.closePath();
    ctx.fill();
}

/**
 * Render an iso voxel-block terrain tile as a clean diamond top PLUS a
 * procedural side-wall sampled from the AI-drawn block.
 *
 * Per-cell side-walls used to staircase at the platform edge because each
 * AI image had its own irregular voxel pattern there. Now every cell of
 * the same asset shares the same uniform side-wall shape and color, so
 * adjacent cells tile perfectly: inner cells' sides get covered by the
 * cell-in-front via the renderer's painter's-order pass, and the outer
 * front-edge cells expose a clean continuous slab.
 */
function renderTerrainTile(sourceCanvas, geo, isoW, isoH) {
    const colors = sampleSideWallColors(sourceCanvas, geo);
    // Use the source's actual side-wall thickness (scaled to cell) but
    // cap it at the iso height so a back-row cell's slab is fully
    // covered by the cell directly in front.
    const aiSideH = Math.max(0, sourceCanvas.height - geo.frontCornerY);
    const scale = isoW / geo.diamondWidth;
    const sideH = Math.max(8, Math.min(isoH, Math.round(aiSideH * scale)));

    const out = document.createElement('canvas');
    out.width  = isoW;
    out.height = isoH + sideH;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (colors) paintCleanSideWalls(ctx, isoW, isoH, sideH, colors);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(isoW / 2, 0);
    ctx.lineTo(isoW,     isoH / 2);
    ctx.lineTo(isoW / 2, isoH);
    ctx.lineTo(0,        isoH / 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
        sourceCanvas,
        geo.xMin, geo.topY, geo.diamondWidth, geo.diamondHeight,
        0, 0, isoW, isoH,
    );
    ctx.restore();

    return { canvas: out, anchorX: isoW / 2, anchorY: 0 };
}

/**
 * Like renderTerrainTile, but for tile-like objects that have content
 * sticking up above their planter (crop_patch wheat, garden_bed plants).
 * The diamond top is clipped, the procedural side-wall is added beneath
 * it (sampled from the wooden planter), and the plants/stalks above are
 * drawn at the same scale extending upward from the diamond's back corner.
 */
function renderTileLikeObject(sourceCanvas, geo, isoW, isoH) {
    const colors = sampleSideWallColors(sourceCanvas, geo);
    const scale = isoW / geo.diamondWidth;
    const aiSideH = Math.max(0, sourceCanvas.height - geo.frontCornerY);
    const sideH = Math.max(6, Math.min(isoH, Math.round(aiSideH * scale)));

    // Source rows above the diamond's back corner = the plants reaching up.
    const backCornerY = Math.max(
        geo.topY,
        geo.cornerY - Math.round(geo.diamondWidth / 4),
    );
    const aboveSrcH = backCornerY - geo.topY;
    const aboveOutH = Math.max(0, Math.round(aboveSrcH * scale));

    const canvasW = isoW;
    const canvasH = aboveOutH + isoH + sideH;
    const anchorY = aboveOutH;

    const out = document.createElement('canvas');
    out.width  = canvasW;
    out.height = canvasH;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Side-wall first (lowest visual layer of this canvas).
    if (colors) {
        ctx.save();
        ctx.translate(0, aboveOutH);
        paintCleanSideWalls(ctx, isoW, isoH, sideH, colors);
        ctx.restore();
    }

    // Diamond top, clipped.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(canvasW / 2, aboveOutH);
    ctx.lineTo(canvasW,     aboveOutH + isoH / 2);
    ctx.lineTo(canvasW / 2, aboveOutH + isoH);
    ctx.lineTo(0,           aboveOutH + isoH / 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
        sourceCanvas,
        geo.xMin, backCornerY, geo.diamondWidth, geo.frontCornerY - backCornerY,
        0, aboveOutH, canvasW, isoH,
    );
    ctx.restore();

    // Plants / stalks above the back corner, unclipped.
    if (aboveOutH > 0) {
        ctx.drawImage(
            sourceCanvas,
            geo.xMin, geo.topY, geo.diamondWidth, aboveSrcH,
            0, 0, canvasW, aboveOutH,
        );
    }

    return { canvas: out, anchorX: canvasW / 2, anchorY };
}

/**
 * Build the canonical asset record from a loaded image, given its footprint
 * and asset kind ('terrain' | 'object').
 *
 *   • Terrain PNGs are AI-rendered as full iso voxel cubes. We strip the
 *     side-walls (extract just the top diamond), stretch into the cell
 *     diamond, and clip to the diamond polygon. Adjacent terrain tiles
 *     then meet at clean edges — no per-cell side-wall staircase.
 *   • Tile-like objects follow the
 *     same trick — strip side-walls, keep stalks/plants above the diamond.
 *   • Fit-to-cell objects keep their original high-resolution PNG intact
 *     but draw it within the cell's diamond width.
 *   • Free-standing object PNGs with a real foundation slab use the base-
 *     detection path: scale so the AI-drawn base width matches the cell's
 *     diamond width and anchor at the base's middle row.
 *   • Object PNGs without a visible foundation (trees, posts) fall back
 *     to width-fit + bottom-center anchor (legacy behavior).
 *
 * `sizeScale` (default 1) shrinks the asset's visual occupation of its
 * cell without changing the cell footprint. A pottery jar with sizeScale
 * 0.35 still sits on a 1×1 cell but only occupies ~35% of the cell width.
 *
 * The returned `canvas` is the *render-ready* canvas. For terrain and
 * tile-like objects it's a small composited canvas; for everything else
 * it's the full-resolution trimmed source (the renderer downscales at
 * draw time to keep zoom-in detail).
 */
export function imageToAsset(image, footprint, kind, options = {}) {
    const sizeScale = options.sizeScale ?? 1;
    const tileLike  = options.tileLike === true;
    const fitCell   = options.fitCell === true;
    const flatBase  = options.flatBase === true;

    const trimmed = trimTransparent(image);
    const cellIsoW = (footprint.w + footprint.d) * TW / 2;
    const cellIsoH = (footprint.w + footprint.d) * TH / 2;
    const isoW = cellIsoW * sizeScale;
    const isoH = cellIsoH * sizeScale;
    // Vertical offset between the trimmed image's bottom edge and the cell's
    // back corner on screen. Default: half a cell, so the asset's bottom
    // lands at the diamond's left/right-corner row (its visual centre).
    // flatBase shifts the bottom down to the diamond's front corner — used
    // when the source PNG has no slab/base painted, so the bottom of the
    // image IS the prop's feet.
    const baseDrop = flatBase ? cellIsoH : cellIsoH / 2;

    if (kind === 'terrain' && tileLike) {
        const geo = detectTopDiamondGeometry(trimmed.canvas);
        if (geo) {
            const tile = renderTerrainTile(trimmed.canvas, geo, cellIsoW, cellIsoH);
            return {
                canvas: tile.canvas,
                width:  tile.canvas.width,
                height: tile.canvas.height,
                anchorX: tile.anchorX,
                anchorY: tile.anchorY,
            };
        }
        // Detection failed — fall through to legacy aspect-preserved render.
        const scale = cellIsoW / trimmed.width;
        const dW = Math.max(1, Math.round(trimmed.width  * scale));
        const dH = Math.max(1, Math.round(trimmed.height * scale));
        return {
            canvas: trimmed.canvas,
            width:  dW,
            height: dH,
            anchorX: dW / 2,
            anchorY: 0,
        };
    } else if (kind === 'terrain') {
        const scale = cellIsoW / trimmed.width;
        const dW = Math.max(1, Math.round(trimmed.width  * scale));
        const dH = Math.max(1, Math.round(trimmed.height * scale));
        return {
            canvas: trimmed.canvas,
            width:  dW,
            height: dH,
            anchorX: dW / 2,
            anchorY: 0,
        };
    }

    if (kind === 'object' && fitCell) {
        const scale = isoW / trimmed.width;
        const displayW = Math.max(1, Math.round(trimmed.width  * scale));
        const displayH = Math.max(1, Math.round(trimmed.height * scale));
        return {
            canvas: trimmed.canvas,
            width:  displayW,
            height: displayH,
            anchorX: displayW / 2,
            anchorY: displayH - baseDrop,
        };
    }

    if (tileLike) {
        const geo = detectTopDiamondGeometry(trimmed.canvas);
        if (geo) {
            const tile = renderTileLikeObject(trimmed.canvas, geo, isoW, isoH);
            return {
                canvas: tile.canvas,
                width:  tile.canvas.width,
                height: tile.canvas.height,
                anchorX: tile.anchorX,
                anchorY: tile.anchorY,
            };
        }
        // fall through to base-detection path
    }

    const base = flatBase ? null : detectVisualBase(trimmed.canvas);
    let displayW, displayH, anchorX, anchorY;
    if (base) {
        const scale = isoW / base.width;
        displayW = Math.max(1, Math.round(trimmed.width  * scale));
        displayH = Math.max(1, Math.round(trimmed.height * scale));
        anchorX = ((base.left + base.right) / 2) * scale;
        anchorY = base.y * scale - cellIsoH / 2;
    } else {
        const scale = isoW / trimmed.width;
        displayW = Math.max(1, Math.round(trimmed.width  * scale));
        displayH = Math.max(1, Math.round(trimmed.height * scale));
        anchorX = displayW / 2;
        anchorY = displayH - baseDrop;
    }

    return {
        canvas: trimmed.canvas,
        width:  displayW,
        height: displayH,
        anchorX,
        anchorY,
    };
}

/**
 * Promise-based image loader. Appends a per-session cache buster to bypass
 * the browser's aggressive image cache when an asset PNG is replaced on
 * disk while the dev server is running.
 */
const SESSION_BUST = Date.now().toString(36);

export function loadImageElement(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => reject(new Error(`Image not found: ${src}`));
        img.decoding = 'async';
        const sep = src.includes('?') ? '&' : '?';
        img.src = `${src}${sep}v=${SESSION_BUST}`;
    });
}
