/**
 * InputManager.js
 *
 * Handles mouse, touch, and keyboard input on the game canvas, translating
 * it to game-level events (place, erase, hover, pan, zoom).
 *
 * Touch model (mirrors the desktop mouse/keyboard model as closely as a
 * fingers-only device allows):
 *
 *   • Single-finger tap            → primary click (place / erase, depending on tool)
 *   • Single-finger long-press     → secondary click (erase) — the "right click" stand-in
 *   • Single-finger drag (place)   → brush-place across cells
 *   • Single-finger drag (erase)   → brush-erase across cells
 *   • Single-finger drag (pan)     → pan camera
 *   • Two-finger pinch             → zoom in / out, anchored at the gesture midpoint
 *   • Two-finger drag              → pan (always works, regardless of active tool)
 */

import { CONFIG } from '../config.js';
import { screenToCell } from '../grid/IsoGrid.js';
import { playUiClick } from '../ui/Audio.js';

// How long a stationary single-finger touch must be held before we
// treat it as the "erase" gesture. Tuned to feel responsive but not
// trip while panning slowly.
const LONG_PRESS_MS = 420;
// Pixel distance the finger may drift before we cancel the long-press
// timer and reclassify the gesture as a drag.
const TOUCH_MOVE_THRESHOLD = 8;
// Max pixels a finger may drift and still register as a tap on release.
const TAP_SLOP = 10;
// Max ms a touch may stay down and still register as a tap on release.
const TAP_MAX_MS = 350;

export class InputManager {
    constructor(canvas, camera, game) {
        this.canvas = canvas;
        this.camera = camera;
        this.game = game;

        this._dragging = false;
        this._dragMoved = false;
        this._lastX = 0;
        this._lastY = 0;
        this._pressedButton = null;
        this._brushActive = false;
        this._lastBrushKey = null;

        // Touch state — kept entirely separate from the mouse path so the
        // two input modes don't fight each other on hybrid devices.
        this._touches = new Map(); // touch.identifier → { x, y, startX, startY, startTime }
        this._touchMode = null;    // null | 'single' | 'pinch'
        this._touchMoved = false;
        this._touchSecondaryFired = false;
        this._longPressTimer = null;
        this._lastBrushTouchKey = null;
        this._pinchLastDist = 0;
        this._pinchLastMid = { x: 0, y: 0 };
        this._lastTouchScreen = null; // last x/y of the active finger, for tap on release

        this._bind();
    }

    _bind() {
        const c = this.canvas;
        c.addEventListener('mousedown',   e => this._onMouseDown(e));
        window.addEventListener('mousemove', e => this._onMouseMove(e));
        window.addEventListener('mouseup',   e => this._onMouseUp(e));
        c.addEventListener('contextmenu', e => e.preventDefault());
        c.addEventListener('wheel',       e => this._onWheel(e), { passive: false });

        // Touch handlers — passive: false so we can preventDefault and
        // stop the browser from scrolling, pinch-zooming the page, or
        // firing synthetic mouse events that would double-trigger us.
        c.addEventListener('touchstart',  e => this._onTouchStart(e),  { passive: false });
        c.addEventListener('touchmove',   e => this._onTouchMove(e),   { passive: false });
        c.addEventListener('touchend',    e => this._onTouchEnd(e),    { passive: false });
        c.addEventListener('touchcancel', e => this._onTouchEnd(e),    { passive: false });

        window.addEventListener('keydown', e => this._onKeyDown(e));
    }

    _toCell(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.camera.screenToWorld(sx, sy);
        const c = screenToCell(world.x, world.y);
        return { gx: Math.floor(c.gx), gy: Math.floor(c.gy), sx, sy };
    }

    _onMouseDown(e) {
        const { gx, gy, sx, sy } = this._toCell(e);
        this._dragging = true;
        this._dragMoved = false;
        this._lastX = sx;
        this._lastY = sy;
        this._pressedButton = e.button;

        const canBrush = this.game.tool !== 'pan'
            && (e.button === 0 || e.button === 2)
            && !e.shiftKey;
        if (canBrush) {
            e.preventDefault();
            this._brushActive = true;
            this._lastBrushKey = null;
            this._brushCell(gx, gy);
        }
    }

    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.camera.screenToWorld(sx, sy);
        const c = screenToCell(world.x, world.y);
        const cell = { gx: Math.floor(c.gx), gy: Math.floor(c.gy) };
        this.game.onHover(cell);

        if (!this._dragging) return;
        const dx = sx - this._lastX;
        const dy = sy - this._lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) this._dragMoved = true;

        if (this._brushActive && !e.shiftKey) {
            this._brushCell(cell.gx, cell.gy);
            this._lastX = sx;
            this._lastY = sy;
            return;
        }

        // Pan with middle button always; with left only in pan mode.
        const panMode = this.game.tool === 'pan';
        if (this._pressedButton === 1 || panMode || (this._dragMoved && e.shiftKey)) {
            this.camera.pan(dx, dy);
        }
        this._lastX = sx;
        this._lastY = sy;
    }

    _onMouseUp(e) {
        if (!this._dragging) return;
        this._dragging = false;
        if (this._brushActive) {
            this._brushActive = false;
            this._lastBrushKey = null;
            this._pressedButton = null;
            return;
        }
        if (this._dragMoved) { this._pressedButton = null; return; }

        const { gx, gy } = this._toCell(e);

        if (e.button === 0) {
            this.game.onPrimaryClick(gx, gy);
        } else if (e.button === 2) {
            this.game.onSecondaryClick(gx, gy);
        }
        this._pressedButton = null;
    }

    _brushCell(gx, gy) {
        const key = `${gx},${gy}`;
        if (key === this._lastBrushKey) return;
        this._lastBrushKey = key;

        if (this._pressedButton === 0) {
            this.game.onPrimaryClick(gx, gy);
        } else if (this._pressedButton === 2) {
            this.game.onSecondaryClick(gx, gy);
        }
        this.game.onHover({ gx, gy });
    }

    _onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.0015);
        this.camera.zoomAt(sx, sy, factor);
    }

    /* ── Touch input ──────────────────────────────────────────── */

    _touchToCanvas(touch) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }

    _screenToCellXY(sx, sy) {
        const world = this.camera.screenToWorld(sx, sy);
        const c = screenToCell(world.x, world.y);
        return { gx: Math.floor(c.gx), gy: Math.floor(c.gy) };
    }

    _onTouchStart(e) {
        // Stop the browser from generating synthetic mouse events,
        // scrolling, or doing the iOS double-tap-zoom.
        e.preventDefault();

        for (const t of e.changedTouches) {
            const { x, y } = this._touchToCanvas(t);
            this._touches.set(t.identifier, {
                x, y,
                startX: x, startY: y,
                startTime: performance.now(),
            });
            this._lastTouchScreen = { x, y };
        }

        const n = this._touches.size;
        if (n === 1) {
            this._touchMode = 'single';
            this._touchMoved = false;
            this._touchSecondaryFired = false;
            this._lastBrushTouchKey = null;

            // Hover the cell under the finger right away so the placement
            // preview tracks where the user touched.
            const [tp] = this._touches.values();
            this.game.onHover(this._screenToCellXY(tp.x, tp.y));

            // Long-press = erase. We schedule it once at touch-down and
            // any drift / lift / second finger cancels it.
            this._clearLongPressTimer();
            this._longPressTimer = setTimeout(() => {
                this._longPressTimer = null;
                if (this._touches.size !== 1 || this._touchMoved) return;
                const cell = this._screenToCellXY(tp.x, tp.y);
                this._touchSecondaryFired = true;
                this.game.onSecondaryClick(cell.gx, cell.gy);
                if (navigator.vibrate) navigator.vibrate(18);
            }, LONG_PRESS_MS);
        } else if (n >= 2) {
            // Promote to pinch. Cancel any in-flight single-finger
            // intent so we don't accidentally place when the second
            // finger lands a few ms later than the first.
            this._clearLongPressTimer();
            this._touchMode = 'pinch';
            this._touchSecondaryFired = false;
            const [a, b] = Array.from(this._touches.values()).slice(0, 2);
            this._pinchLastDist = Math.max(1, this._distance(a, b));
            this._pinchLastMid = this._midpoint(a, b);
        }
    }

    _onTouchMove(e) {
        e.preventDefault();

        for (const t of e.changedTouches) {
            const tp = this._touches.get(t.identifier);
            if (!tp) continue;
            const { x, y } = this._touchToCanvas(t);
            // Track per-frame delta on the touch itself so a single
            // pan-tool finger can scroll the world without us having to
            // remember the last position globally.
            tp.lastX = tp.x; tp.lastY = tp.y;
            tp.x = x; tp.y = y;
            this._lastTouchScreen = { x, y };
        }

        if (this._touchMode === 'single') {
            const [tp] = this._touches.values();
            const dx = tp.x - tp.startX;
            const dy = tp.y - tp.startY;
            if (!this._touchMoved && (Math.abs(dx) + Math.abs(dy)) > TOUCH_MOVE_THRESHOLD) {
                this._touchMoved = true;
                this._clearLongPressTimer();
            }
            // Always keep the hover preview tracking the finger so the
            // valid/invalid state visualises correctly while dragging.
            const cell = this._screenToCellXY(tp.x, tp.y);
            this.game.onHover(cell);

            if (!this._touchMoved) return;

            const tool = this.game.tool;
            if (tool === 'pan') {
                const fdx = tp.x - (tp.lastX ?? tp.x);
                const fdy = tp.y - (tp.lastY ?? tp.y);
                if (fdx || fdy) this.camera.pan(fdx, fdy);
            } else if (tool === 'place' || tool === 'erase') {
                const key = `${cell.gx},${cell.gy}`;
                if (key !== this._lastBrushTouchKey) {
                    this._lastBrushTouchKey = key;
                    // Primary click respects the active tool — in erase
                    // mode it erases, in place mode it places. Same as
                    // the mouse brush path.
                    this.game.onPrimaryClick(cell.gx, cell.gy);
                }
            }
        } else if (this._touchMode === 'pinch') {
            const [a, b] = Array.from(this._touches.values()).slice(0, 2);
            if (!a || !b) return;
            const dist = Math.max(1, this._distance(a, b));
            const mid  = this._midpoint(a, b);

            // Frame-relative scale: the camera's zoom is already
            // accumulating, so we only multiply by the change since
            // last frame. This stays stable when fingers add or lift.
            const factor = dist / this._pinchLastDist;
            if (factor !== 1) this.camera.zoomAt(mid.x, mid.y, factor);

            // Two-finger pan: midpoint drift moves the camera too.
            const pdx = mid.x - this._pinchLastMid.x;
            const pdy = mid.y - this._pinchLastMid.y;
            if (pdx || pdy) this.camera.pan(pdx, pdy);

            this._pinchLastDist = dist;
            this._pinchLastMid = mid;
        }
    }

    _onTouchEnd(e) {
        e.preventDefault();

        // Snapshot the finger that's lifting so we can do tap-on-release
        // from its actual final position (the map entry is about to go).
        let lifted = null;
        for (const t of e.changedTouches) {
            lifted = this._touches.get(t.identifier) || lifted;
            this._touches.delete(t.identifier);
        }

        const wasSingle = this._touchMode === 'single';
        const remaining = this._touches.size;

        if (wasSingle && remaining === 0 && lifted) {
            this._clearLongPressTimer();
            const elapsed = performance.now() - lifted.startTime;
            const dx = lifted.x - lifted.startX;
            const dy = lifted.y - lifted.startY;
            const moved = (Math.abs(dx) + Math.abs(dy)) > TAP_SLOP;
            const tap = !moved && elapsed < TAP_MAX_MS && !this._touchSecondaryFired;
            if (tap) {
                const cell = this._screenToCellXY(lifted.x, lifted.y);
                this.game.onPrimaryClick(cell.gx, cell.gy);
            }
        }

        if (remaining === 0) {
            this._touchMode = null;
            this._touchMoved = false;
            this._touchSecondaryFired = false;
            this._lastBrushTouchKey = null;
            this._clearLongPressTimer();
        } else if (remaining === 1 && this._touchMode === 'pinch') {
            // Dropped from pinch back to single — restart the single
            // path with the surviving finger as a fresh "drag" so we
            // don't snap-pan from its old start position. We also
            // suppress tap detection (mark moved) since the user is
            // mid-gesture, not tapping.
            const [tp] = this._touches.values();
            tp.startX = tp.x;
            tp.startY = tp.y;
            tp.startTime = performance.now();
            tp.lastX = tp.x;
            tp.lastY = tp.y;
            this._touchMode = 'single';
            this._touchMoved = true;
            this._touchSecondaryFired = true; // belt + suspenders: also blocks tap
        }
    }

    _clearLongPressTimer() {
        if (this._longPressTimer != null) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
    }

    _distance(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _midpoint(a, b) {
        return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
    }

    _onKeyDown(e) {
        // Skip when user is typing in an input.
        if (e.target instanceof HTMLInputElement
            || e.target instanceof HTMLTextAreaElement) return;
        const k = e.key.toLowerCase();
        const map = {
            '1': () => this.game.setCategory('terrain'),
            '2': () => this.game.setCategory('nature'),
            '3': () => this.game.setCategory('props'),
            '4': () => this.game.setCategory('water'),
            '5': () => this.game.setCategory('buildings'),
            'e': () => this.game.setTool(this.game.tool === 'erase' ? 'place' : 'erase'),
            'g': () => this.game.toggleGrid(),
            's': () => this.game.save(),
            'r': () => this.game.reset(),
            'h': () => this.game.toggleFlipH(),
            'v': () => this.game.toggleFlipV(),
        };
        if (map[k]) {
            e.preventDefault();
            playUiClick();
            map[k]();
        }
    }
}
