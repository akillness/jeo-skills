/**
 * PlacementSystem.js
 *
 * Bridge between the user's "intent" (a selected asset and a hovered cell)
 * and the world (tile map).
 */

import { ASSET_INDEX } from '../assets/assetManifest.js';
import { PlacedObject } from './PlacedObject.js';

export class PlacementSystem {
    constructor(tileMap) {
        this.tileMap = tileMap;
    }

    /** Test whether the given asset can be placed at (gx, gy). */
    canPlace(assetId, gx, gy) {
        const asset = ASSET_INDEX[assetId];
        if (!asset) return false;

        if (asset.kind === 'terrain') {
            return this.tileMap.inBounds(gx, gy);
        }

        // Object kind: footprint must fit and be free.
        return this.tileMap.isFreeFor(gx, gy, asset.footprint.w, asset.footprint.d);
    }

    place(assetId, gx, gy, opts = {}) {
        const asset = ASSET_INDEX[assetId];
        if (!asset || !this.canPlace(assetId, gx, gy)) return null;

        if (asset.kind === 'terrain') {
            // Replacing terrain leaves any objects above untouched.
            this.tileMap.setTerrain(gx, gy, assetId);
            return { kind: 'terrain', gx, gy, assetId };
        }

        const obj = new PlacedObject({
            id: this.tileMap.nextId(),
            assetId,
            gx,
            gy,
            footprint: asset.footprint,
            flipH: !!opts.flipH,
            flipV: !!opts.flipV,
        });
        this.tileMap.addObject(obj);
        return { kind: 'object', object: obj };
    }

    /**
     * Erase whatever sits on (gx, gy) — preferring objects over terrain.
     * Returns true if anything was erased.
     */
    erase(gx, gy) {
        const obj = this.tileMap.objectAt(gx, gy);
        if (obj) {
            this.tileMap.removeObjectAt(gx, gy);
            return true;
        }
        if (this.tileMap.getTerrain(gx, gy)) {
            this.tileMap.clearTerrain(gx, gy);
            return true;
        }
        return false;
    }
}
