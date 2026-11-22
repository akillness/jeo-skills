/**
 * IsoGrid.js
 *
 * Math helpers to convert between grid (cell) coordinates and screen
 * (pixel) coordinates for an isometric layout.
 */

import { CONFIG } from '../config.js';

const TW = CONFIG.tile.w;   // tile width (px)
const TH = CONFIG.tile.h;   // tile height (px)

/**
 * Convert grid cell (gx, gy) to the screen position of that cell's "anchor".
 * The anchor is the top corner of the diamond ground tile (closest-to-back).
 */
export function cellToScreen(gx, gy) {
    return {
        x: (gx - gy) * (TW / 2),
        y: (gx + gy) * (TH / 2),
    };
}

/**
 * Inverse: pixel point in the world → grid cell coordinates (floored).
 * Returns a plain object with floats; caller can floor them.
 */
export function screenToCell(px, py) {
    const gx = (px / (TW / 2) + py / (TH / 2)) / 2;
    const gy = (py / (TH / 2) - px / (TW / 2)) / 2;
    return { gx, gy };
}

export function cellInBounds(gx, gy, w = CONFIG.grid.width, h = CONFIG.grid.height) {
    return gx >= 0 && gy >= 0 && gx < w && gy < h;
}
