/**
 * Camera.js
 *
 * A simple 2D camera with pan & zoom. The camera maps world (canvas) pixels
 * to screen pixels via an offset and a uniform zoom factor.
 */

import { CONFIG } from '../config.js';

export class Camera {
    constructor() {
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = CONFIG.camera.defaultZoom;
        // Optional listener for mutations. The renderer subscribes to
        // this so it can flip its dirty flag without polling the camera.
        this._onChange = null;
    }

    onChange(cb) { this._onChange = cb; }
    _notify() { if (this._onChange) this._onChange(); }

    /** Compute world (pre-zoom) point under a screen pixel. */
    screenToWorld(sx, sy) {
        return {
            x: (sx - this.offsetX) / this.zoom,
            y: (sy - this.offsetY) / this.zoom,
        };
    }

    /** Compute screen pixel for a world point. */
    worldToScreen(wx, wy) {
        return {
            x: wx * this.zoom + this.offsetX,
            y: wy * this.zoom + this.offsetY,
        };
    }

    pan(dx, dy) {
        if (dx === 0 && dy === 0) return;
        this.offsetX += dx;
        this.offsetY += dy;
        this._notify();
    }

    zoomAt(screenX, screenY, factor) {
        const next = Math.max(CONFIG.camera.minZoom,
                     Math.min(CONFIG.camera.maxZoom, this.zoom * factor));
        if (next === this.zoom) return;
        // Keep the world point under the cursor anchored.
        const before = this.screenToWorld(screenX, screenY);
        this.zoom = next;
        const after = this.screenToWorld(screenX, screenY);
        this.offsetX += (after.x - before.x) * this.zoom;
        this.offsetY += (after.y - before.y) * this.zoom;
        this._notify();
    }

    /** Center on a world point at the given canvas size. */
    centerOn(wx, wy, canvasW, canvasH) {
        this.offsetX = canvasW / 2 - wx * this.zoom;
        this.offsetY = canvasH / 2 - wy * this.zoom;
        this._notify();
    }
}
