/**
 * PlacedObject.js
 *
 * Lightweight value class for an object placed on the grid.
 */

export class PlacedObject {
    constructor({ id, assetId, gx, gy, footprint, flipH = false, flipV = false }) {
        this.id = id;             // unique runtime id
        this.assetId = assetId;   // asset manifest key
        this.gx = gx;             // grid x of footprint origin (back-left)
        this.gy = gy;             // grid y of footprint origin
        this.footprint = footprint; // { w, d }
        this.flipH = !!flipH;     // mirrored horizontally on the screen
        this.flipV = !!flipV;     // mirrored vertically on the screen
    }

    occupies(gx, gy) {
        return gx >= this.gx && gx < this.gx + this.footprint.w
            && gy >= this.gy && gy < this.gy + this.footprint.d;
    }

    /** Cells covered, in row-major order. */
    cells() {
        const out = [];
        for (let ix = 0; ix < this.footprint.w; ix++)
        for (let iy = 0; iy < this.footprint.d; iy++) {
            out.push({ gx: this.gx + ix, gy: this.gy + iy });
        }
        return out;
    }

    /** Used for depth sorting: the "back-most" cell is the smallest gx+gy. */
    sortKey() {
        // Front-most cell (largest gx+gy) drives draw order so larger objects
        // are drawn after objects fully behind them.
        return (this.gx + this.footprint.w - 1) + (this.gy + this.footprint.d - 1);
    }

    serialize() {
        return {
            id: this.id,
            assetId: this.assetId,
            gx: this.gx,
            gy: this.gy,
            footprint: { ...this.footprint },
            flipH: this.flipH,
            flipV: this.flipV,
        };
    }
}
