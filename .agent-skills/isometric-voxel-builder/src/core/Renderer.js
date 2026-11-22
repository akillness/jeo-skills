/**
 * Renderer.js
 *
 * Renders the world (tile map + placed objects + cursor preview) to the
 * main game canvas using painter's algorithm depth sorting.
 *
 * Layered architecture:
 *
 *   [SCREEN-SPACE STATIC CACHE]
 *     1. Soft warm sky + bloom + parchment dots backdrop.
 *     2. Multi-layer blurred drop shadow under the floating platform.
 *     3. Cream platform slab + back-edge highlight.
 *     4. Soft outer vignette.
 *     Rebuilt only on resize / grid resize.
 *
 *   [WORLD-SPACE TERRAIN CACHE]
 *     Every terrain tile composed once into an offscreen world-space
 *     canvas. Per-frame we just stamp it via the camera transform.
 *     Rebuilt only when `tileMap.terrainVersion` changes.
 *
 *   [WORLD-SPACE STATIC-OBJECTS CACHE]
 *     Every non-animating object's cast shadow + sprite, depth-sorted,
 *     composed into one world-space canvas. Rebuilt only when
 *     `tileMap.objectsVersion` changes (or when an animation completes
 *     and the object joins the static set).
 *
 *   [LIVE OVERLAY]
 *     Hover tile highlight, ghost preview & its shadow, plus any objects
 *     and tiles whose placement animation is still playing.
 *
 * Plus a dirty-flag pattern: `draw()` is skipped entirely when nothing
 * changed and no animations are running, so an idle scene with 200
 * placements costs ~0% CPU.
 */

import { CONFIG } from '../config.js';
import { cellToScreen } from '../grid/IsoGrid.js';
import { getAsset } from '../assets/assetLoader.js';
import { ASSET_INDEX } from '../assets/assetManifest.js';

const TW = CONFIG.tile.w;
const TH = CONFIG.tile.h;

// World-space padding around the platform when allocating cache canvases:
// objects can extend well above the platform top (windmill vanes, chapel
// tower) and slightly below it (side walls, drop shadows).
const WORLD_PAD_TOP    = 800;
const WORLD_PAD_BOTTOM = 240;
const WORLD_PAD_X      = 320;

/**
 * High-DPI scale for the world-space terrain & objects caches.
 *
 * The asset displayCanvases are pre-rendered at ~6× their reference
 * display size (DISPLAY_SUPERSAMPLE in the asset loader), so the only
 * quality bottleneck left is whatever resolution we store inside the
 * cached layers. At cache_scale = 1 the cache holds tiles at their
 * reference width (e.g. 64 px), and at default zoom on a retina screen
 * the camera then upscales that ~2.8× before painting — visibly soft.
 *
 * We raise the cache scale roughly to `defaultZoom × devicePixelRatio`
 * (≈ 3 on retina, 2 elsewhere) so the cached pixels themselves are at
 * or near final on-screen resolution at default zoom. Memory cost is
 * modest: ~80 MB per cache on retina, gone the moment the page closes.
 */
const _DPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
// Capped at 3 so we stay safely within canvas size limits on every
// browser even with our generous world-bounds padding (e.g. 1536 × 1488
// world × 3 = 4608 × 4464 cache, comfortably below the typical 8192/16384
// limits) and so memory stays bounded on very-high-DPI devices.
const CACHE_SCALE = Math.min(3, Math.max(2, Math.ceil(_DPR * 1.5)));

// Shadow tuning. Pre-blurring happens once at asset-load time; the
// renderer just transforms + alphas the silhouettes per frame.
const SHADOW_ALPHA       = 0.32;
const BACK_DRIFT_X       = 0.16;
const BACK_DRIFT_Y       = 0.48;

export class Renderer {
    constructor(canvas, camera, tileMap) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: true });
        this.camera = camera;
        this.tileMap = tileMap;

        // Visibility toggles
        this.showGrid = false;
        this.ambientOcclusion = true;
        this.showBorders = true;

        // Hover state set by the input manager
        this.hoverCell = null;       // { gx, gy }
        this.previewAssetId = null;  // null when not in place mode
        this.previewValid = true;
        this.eraseMode = false;
        // Flip flags applied to the ghost preview (set by Game).
        this.previewFlipH = false;
        this.previewFlipV = false;

        // Per-frame snapshot of currently-running placement animations.
        // Keyed by 'obj-<id>' for placed objects and 't-<gx>,<gy>' for
        // terrain tiles. Values are normalised progress in [0, 1).
        this._anims = new Map();
        this._frameAnims = new Map();
        this._animObjectIds = new Set();   // numeric obj ids currently animating
        this._animTerrainKeys = new Set(); // 'gx,gy' strings currently animating

        // Cached layers + the version stamps that produced them.
        // Chrome = backdrop + vignette in screen space (depends only on
        // resize). Platform / terrain / objects all live in a single
        // world-space coordinate frame and are stamped via the camera
        // transform, so pan & zoom never invalidate them.
        this._chromeCanvas   = null;
        this._chromeDirty    = true;
        this._platformCanvas = null;
        this._platformGridW  = -1;
        this._platformGridH  = -1;
        this._terrainCanvas  = null;
        this._terrainVersion = -1;
        this._objectsCanvas  = null;
        this._objectsVersion = -1;
        this._objectsAnimCount = 0;

        // World-space bounds (stored at first build, derived from grid).
        this._worldBounds = null;

        // Dirty flag for the render loop. We always draw at least once
        // after construction; otherwise the loop early-exits unless an
        // animation is running or `markDirty()` was called.
        this._dirty = true;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /** Mark the next frame as needing a redraw. */
    markDirty() { this._dirty = true; }

    /**
     * Trigger a one-shot elastic placement animation for the given key.
     * The cell rect is stored alongside the timer so the preview ghost can
     * step out of the way of any cell currently running an animation.
     *
     * `startAt` (default = now) lets callers schedule the animation to
     * begin in the future — used by the starter-scene reveal to ripple
     * the placements in back-to-front instead of all at once. Animations
     * with `startAt` in the future stay invisible until their start time
     * arrives, but they're already excluded from the static caches so
     * they don't pop in twice.
     */
    spawnAnim(key, cell = null, duration = 460, startAt = performance.now()) {
        this._anims.set(key, { start: startAt, duration, cell });
        if (key.startsWith('obj-')) {
            const id = +key.slice(4);
            if (!Number.isNaN(id)) this._animObjectIds.add(id);
            // The animating object is no longer part of the static cache.
            this._objectsVersion = -1;
        } else if (key.startsWith('t-')) {
            // 't-<gx>,<gy>' — stash the cell key for the terrain cache to
            // skip while the elastic effect plays, otherwise the baked
            // tile shows underneath the scaled overlay and the animation
            // looks like a faint ghost rather than a real pop.
            this._animTerrainKeys.add(key.slice(2));
            this._terrainVersion = -1;
        }
        this._dirty = true;
    }

    _snapshotAnims() {
        const now = performance.now();
        this._frameAnims.clear();
        let removedObj = false;
        let removedTerrain = false;
        for (const [key, a] of this._anims) {
            const t = (now - a.start) / a.duration;
            if (t >= 1) {
                this._anims.delete(key);
                if (key.startsWith('obj-')) {
                    const id = +key.slice(4);
                    if (!Number.isNaN(id)) this._animObjectIds.delete(id);
                    removedObj = true;
                } else if (key.startsWith('t-')) {
                    this._animTerrainKeys.delete(key.slice(2));
                    removedTerrain = true;
                }
                continue;
            }
            // Skip animations whose scheduled start time hasn't arrived
            // yet (used by the staggered starter-scene reveal). They're
            // still tracked in `_anims` so subsequent frames will pick
            // them up once their start window opens.
            if (t < 0) continue;
            this._frameAnims.set(key, { t, cell: a.cell });
        }
        // When an animation finishes we need to rebuild the corresponding
        // static cache so the freshly-settled tile / object joins the
        // baked layer. The dirty flag also has to flip on, otherwise the
        // next frame would early-exit and the just-settled cell would
        // briefly disappear.
        if (removedObj)     { this._objectsVersion = -1; this._dirty = true; }
        if (removedTerrain) { this._terrainVersion = -1; this._dirty = true; }
    }

    _animT(key) {
        const entry = this._frameAnims.get(key);
        return entry == null ? undefined : entry.t;
    }

    _isAnimAtCell(gx, gy) {
        for (const { cell } of this._frameAnims.values()) {
            if (!cell) continue;
            if (gx >= cell.gx && gx < cell.gx + (cell.w ?? 1)
                && gy >= cell.gy && gy < cell.gy + (cell.d ?? 1)) {
                return true;
            }
        }
        return false;
    }

    _easeOutElastic(t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.canvas.width  = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // The per-frame composite is just a handful of large drawImage
        // calls (chrome + platform + terrain + objects + a few overlays),
        // so 'high' is affordable and keeps assets crisp at zoom.
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this._chromeDirty = true;
        this._dirty = true;
    }

    /** Canvas size in CSS pixels. */
    cssSize() {
        return { w: window.innerWidth, h: window.innerHeight };
    }

    /** Draw the entire frame, but only when something has actually changed. */
    draw() {
        this._snapshotAnims();
        // Any pending anim — even one whose start time is still in the
        // future — must keep the loop alive so we eventually reach its
        // start window. Otherwise the dirty flag would settle to false
        // and the staggered reveal would freeze before it began.
        const animsPending = this._anims.size > 0;
        if (!this._dirty && !animsPending) return;
        this._dirty = false;

        const ctx = this.ctx;
        const { w, h } = this.cssSize();
        ctx.clearRect(0, 0, w, h);

        this._ensureChromeCache(w, h);
        this._ensurePlatformCache();
        this._ensureTerrainCache();
        this._ensureObjectsCache();

        // 1. Static screen-space chrome (backdrop dots + bloom + sky).
        ctx.drawImage(this._chromeCanvas.bottom, 0, 0, w, h);

        // 2. World layers via the camera transform — none of these depend
        //    on the camera state, so pan/zoom is just a transform change
        //    and four stamped images.
        ctx.save();
        this._applyCamera();
        const wb = this._worldBounds;

        if (this._platformCanvas) ctx.drawImage(this._platformCanvas, wb.x, wb.y);
        // Terrain + objects caches are stored at CACHE_SCALE world DPR for
        // crisp pixels at zoom; we explicitly size the stamp to world
        // units so the browser does the high-quality downsample as part
        // of the same hardware-resampled draw.
        if (this._terrainCanvas)  ctx.drawImage(this._terrainCanvas,  wb.x, wb.y, wb.w, wb.h);
        if (this.showGrid)        this._drawGrid();
        if (this._objectsCanvas)  ctx.drawImage(this._objectsCanvas,  wb.x, wb.y, wb.w, wb.h);

        // 3. Live overlays: actively-animating objects/tiles + hover +
        //    preview ghost. Sorted together so depth is sane.
        this._drawLiveOverlay();

        ctx.restore();

        // 4. Top-of-frame vignette (applied in screen space).
        ctx.drawImage(this._chromeCanvas.top, 0, 0, w, h);
    }

    _applyCamera() {
        const ctx = this.ctx;
        ctx.translate(this.camera.offsetX, this.camera.offsetY);
        ctx.scale(this.camera.zoom, this.camera.zoom);
    }

    /* ── World bounds ─────────────────────────────────────────── */

    _computeWorldBounds() {
        const W = this.tileMap.width, H = this.tileMap.height;
        const corners = [
            cellToScreen(0, 0),
            cellToScreen(W, 0),
            cellToScreen(W, H),
            cellToScreen(0, H),
        ];
        let minX =  Infinity, maxX = -Infinity;
        let minY =  Infinity, maxY = -Infinity;
        for (const c of corners) {
            if (c.x < minX) minX = c.x;
            if (c.x > maxX) maxX = c.x;
            if (c.y < minY) minY = c.y;
            if (c.y > maxY) maxY = c.y;
        }
        const x = Math.floor(minX - WORLD_PAD_X);
        const y = Math.floor(minY - WORLD_PAD_TOP);
        const w = Math.ceil(maxX - minX + WORLD_PAD_X * 2);
        const h = Math.ceil(maxY - minY + WORLD_PAD_TOP + WORLD_PAD_BOTTOM);
        return { x, y, w, h };
    }

    /* ── Cache builders ───────────────────────────────────────── */

    _ensureChromeCache(w, h) {
        const dpr = window.devicePixelRatio || 1;
        const dw = Math.round(w * dpr);
        const dh = Math.round(h * dpr);
        if (!this._chromeDirty
            && this._chromeCanvas
            && this._chromeCanvas.bottom.width  === dw
            && this._chromeCanvas.bottom.height === dh) {
            return;
        }
        this._chromeDirty = false;
        const bottom = document.createElement('canvas');
        bottom.width  = dw;
        bottom.height = dh;
        const top = document.createElement('canvas');
        top.width  = dw;
        top.height = dh;
        // Build at device-pixel resolution so the parchment 1px dots stay
        // crisp on retina, then draw at CSS size with the same dpr scale
        // applied via the live ctx transform.
        const bctx = bottom.getContext('2d');
        const tctx = top.getContext('2d');
        bctx.scale(dpr, dpr);
        tctx.scale(dpr, dpr);
        this._paintBackdrop(bctx, w, h);
        this._paintVignette(tctx, w, h);
        this._chromeCanvas = { bottom, top };
    }

    _ensurePlatformCache() {
        const W = this.tileMap.width, H = this.tileMap.height;
        if (this._platformCanvas
            && this._platformGridW === W
            && this._platformGridH === H) {
            return;
        }
        // Grid size changed (or first build): invalidate every world cache
        // since they all share the same world-coordinate frame.
        this._worldBounds = this._computeWorldBounds();
        this._terrainCanvas = null;
        this._objectsCanvas = null;
        const wb = this._worldBounds;
        const c = document.createElement('canvas');
        c.width  = wb.w;
        c.height = wb.h;
        const ctx = c.getContext('2d');
        ctx.translate(-wb.x, -wb.y);
        this._paintPlatform(ctx);
        this._platformCanvas = c;
        this._platformGridW = W;
        this._platformGridH = H;
    }

    _paintBackdrop(ctx, w, h) {
        // Soft warm sky, brighter to the upper-back-left (where the iso sun
        // sits), fading toward the lower-front for atmosphere.
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, 'rgba(255, 247, 224, 0.55)');
        sky.addColorStop(0.55, 'rgba(247, 235, 208, 0.0)');
        sky.addColorStop(1, 'rgba(214, 192, 158, 0.18)');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // Sun bloom: warm radial highlight from the upper-back area.
        const bloom = ctx.createRadialGradient(
            w * 0.70, h * 0.18, 0,
            w * 0.70, h * 0.18, Math.max(w, h) * 0.85,
        );
        bloom.addColorStop(0, 'rgba(255, 232, 188, 0.55)');
        bloom.addColorStop(0.45, 'rgba(255, 232, 188, 0.10)');
        bloom.addColorStop(1, 'rgba(255, 232, 188, 0)');
        ctx.fillStyle = bloom;
        ctx.fillRect(0, 0, w, h);

        // Subtle dotted parchment texture, fades toward the edges.
        // This used to be ~3,600 fillRect calls per frame; now it's done
        // once per resize.
        const cellSize = 24;
        const cx = w / 2, cy = h / 2;
        const maxR = Math.hypot(cx, cy);
        for (let y = 0; y < h; y += cellSize)
        for (let x = 0; x < w; x += cellSize) {
            const r = Math.hypot(x - cx, y - cy) / maxR;
            const a = 0.05 * (1 - r * 0.85);
            if (a <= 0) continue;
            ctx.fillStyle = `rgba(60, 50, 30, ${a.toFixed(3)})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }

    /**
     * Paint the platform (drop shadows + cream slab + back-edge highlight)
     * into a context already aligned to world coordinates. Cached once per
     * grid size; the camera transform applied at draw time scales / pans
     * the result naturally, so pan & zoom never re-trigger this work.
     */
    _paintPlatform(ctx) {
        const gw = this.tileMap.width, gh = this.tileMap.height;
        const corners = [
            cellToScreen(0, 0),
            cellToScreen(gw, 0),
            cellToScreen(gw, gh),
            cellToScreen(0, gh),
        ];

        const tracePlatform = () => {
            ctx.beginPath();
            ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
            ctx.closePath();
        };

        // Soft outer glow – multiple progressively darker offsets fake a
        // proper blurred drop shadow even when ctx.filter is unsupported.
        // Blur values are in world pixels here; the camera scales them
        // visually at draw time, which gives a free zoom-correct shadow.
        const passes = [
            { dx:  0, dy: 36, blur: 28, alpha: 0.10 },
            { dx:  4, dy: 24, blur: 14, alpha: 0.12 },
            { dx:  2, dy: 12, blur:  6, alpha: 0.14 },
        ];
        const supportsFilter = typeof ctx.filter === 'string';
        for (const p of passes) {
            ctx.save();
            if (supportsFilter) ctx.filter = `blur(${p.blur}px)`;
            ctx.translate(p.dx, p.dy);
            tracePlatform();
            ctx.fillStyle = `rgba(40, 28, 10, ${p.alpha})`;
            ctx.fill();
            ctx.restore();
        }

        tracePlatform();
        const base = ctx.createLinearGradient(
            corners[0].x, corners[0].y,
            corners[2].x, corners[2].y,
        );
        base.addColorStop(0, 'rgba(252, 245, 226, 0.85)');
        base.addColorStop(1, 'rgba(231, 217, 188, 0.85)');
        ctx.fillStyle = base;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(corners[3].x, corners[3].y);
        ctx.lineTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 248, 226, 0.55)';
        ctx.stroke();
    }

    _paintVignette(ctx, w, h) {
        const grad = ctx.createRadialGradient(
            w / 2, h * 0.55, Math.min(w, h) * 0.35,
            w / 2, h * 0.55, Math.max(w, h) * 0.85,
        );
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(0.7, 'rgba(40, 28, 10, 0.05)');
        grad.addColorStop(1, 'rgba(40, 28, 10, 0.20)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    /**
     * Force the screen-space chrome (backdrop + vignette) to be repainted
     * on the next frame. Called by `resize()` automatically; exposed for
     * any future caller that needs to invalidate it explicitly.
     */
    markChromeDirty() {
        this._chromeDirty = true;
        this.markDirty();
    }

    /* ── Terrain cache ────────────────────────────────────────── */

    _ensureTerrainCache() {
        if (this._terrainCanvas && this._terrainVersion === this.tileMap.terrainVersion) {
            return;
        }
        if (!this._worldBounds) this._worldBounds = this._computeWorldBounds();
        const wb = this._worldBounds;
        const cw = wb.w * CACHE_SCALE;
        const ch = wb.h * CACHE_SCALE;
        if (!this._terrainCanvas
            || this._terrainCanvas.width  !== cw
            || this._terrainCanvas.height !== ch) {
            const c = document.createElement('canvas');
            c.width  = cw;
            c.height = ch;
            this._terrainCanvas = c;
        }
        const ctx = this._terrainCanvas.getContext('2d');
        // Cache builds run only on actual content changes (placement /
        // erase / load), so we pay the 'high' smoothing cost once and
        // bank crisp pixels for every subsequent frame.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        // Pre-scale to CACHE_SCALE so the rest of the build can use plain
        // world coordinates; the stored pixels end up at high-DPI density.
        ctx.scale(CACHE_SCALE, CACHE_SCALE);
        ctx.translate(-wb.x, -wb.y);

        for (let gy = 0; gy < this.tileMap.height; gy++)
        for (let gx = 0; gx < this.tileMap.width; gx++) {
            const id = this.tileMap.getTerrain(gx, gy);
            if (!id) continue;
            // Skip cells that are mid-animation — the live overlay draws
            // the elastic-scaled version in their place. Without this
            // skip the baked tile shows underneath the overlay and the
            // pop animation looks like a faint ghost.
            if (this._animTerrainKeys.has(`${gx},${gy}`)) continue;
            const asset = getAsset(id);
            if (!asset) continue;
            const { x, y } = cellToScreen(gx, gy);
            const dx = x - asset.anchorX;
            const dy = y - asset.anchorY;
            const src = asset.displayCanvas || asset.canvas;
            ctx.drawImage(src, dx, dy, asset.width, asset.height);
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._terrainVersion = this.tileMap.terrainVersion;
    }

    /* ── Static-objects cache (objects + their cast shadows) ──── */

    _ensureObjectsCache() {
        const tm = this.tileMap;
        if (this._objectsCanvas
            && this._objectsVersion === tm.objectsVersion
            && this._objectsAnimCount === this._animObjectIds.size) {
            return;
        }
        if (!this._worldBounds) this._worldBounds = this._computeWorldBounds();
        const wb = this._worldBounds;
        const cw = wb.w * CACHE_SCALE;
        const ch = wb.h * CACHE_SCALE;
        if (!this._objectsCanvas
            || this._objectsCanvas.width  !== cw
            || this._objectsCanvas.height !== ch) {
            const c = document.createElement('canvas');
            c.width  = cw;
            c.height = ch;
            this._objectsCanvas = c;
        }
        const ctx = this._objectsCanvas.getContext('2d');
        // Same as the terrain cache — built only on object add/remove,
        // so we use 'high' for permanently crisp pixels in the cache.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        // Pre-scale to CACHE_SCALE — see _ensureTerrainCache for why.
        ctx.scale(CACHE_SCALE, CACHE_SCALE);
        ctx.translate(-wb.x, -wb.y);

        // Pass 1: shadows for every static (non-animating) object that
        // casts one.
        ctx.save();
        ctx.globalAlpha = SHADOW_ALPHA;
        for (const obj of tm.objects) {
            if (this._animObjectIds.has(obj.id)) continue;
            const asset = getAsset(obj.assetId);
            if (!this._castsShadow(asset)) continue;
            this._drawShadowFor(ctx, asset, obj.gx, obj.gy, obj.footprint, {
                flipH: obj.flipH,
                flipV: obj.flipV,
            });
        }
        ctx.restore();

        // Pass 2: objects depth-sorted via painter's algorithm.
        const drawables = [];
        for (const obj of tm.objects) {
            if (this._animObjectIds.has(obj.id)) continue;
            drawables.push(obj);
        }
        drawables.sort((a, b) => a.sortKey() - b.sortKey());
        for (const obj of drawables) {
            this._drawStaticObject(ctx, obj);
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._objectsVersion = tm.objectsVersion;
        this._objectsAnimCount = this._animObjectIds.size;
    }

    _drawStaticObject(ctx, obj) {
        const asset = getAsset(obj.assetId);
        if (!asset) return;
        const { x, y } = cellToScreen(obj.gx, obj.gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        this._drawAssetImage(ctx, asset, dx, dy, obj.gx, obj.gy, obj.footprint, {
            flipH: obj.flipH,
            flipV: obj.flipV,
        });
    }

    /* ── Live overlay (animations + hover + preview) ──────────── */

    _drawLiveOverlay() {
        const ctx = this.ctx;
        const items = [];

        // Currently-animating objects + their shadows.
        for (const obj of this.tileMap.objects) {
            if (!this._animObjectIds.has(obj.id)) continue;
            const t = this._animT(`obj-${obj.id}`);
            if (t == null) continue;
            const asset = getAsset(obj.assetId);
            if (!asset) continue;
            // Shadow first (sits below). Drawn at the same depth band.
            if (this._castsShadow(asset)) {
                items.push({
                    key: obj.sortKey() - 0.5,
                    draw: () => {
                        const prev = ctx.globalAlpha;
                        ctx.globalAlpha = prev * SHADOW_ALPHA * Math.min(1, Math.max(0, t * 1.4 - 0.1));
                        this._drawShadowFor(ctx, asset, obj.gx, obj.gy, obj.footprint, {
                            flipH: obj.flipH,
                            flipV: obj.flipV,
                        });
                        ctx.globalAlpha = prev;
                    },
                });
            }
            items.push({
                key: obj.sortKey(),
                draw: () => this._drawAnimatingObject(obj, t),
            });
        }

        // Currently-animating terrain tiles.
        for (const [key, entry] of this._frameAnims) {
            if (!key.startsWith('t-')) continue;
            const cell = entry.cell;
            if (!cell) continue;
            const id = this.tileMap.getTerrain(cell.gx, cell.gy);
            if (!id) continue;
            items.push({
                key: cell.gx + cell.gy - 0.0005,
                draw: () => this._drawAnimatingTile(id, cell.gx, cell.gy, entry.t),
            });
        }

        // Hover highlight + preview.
        if (this.hoverCell) {
            const { gx, gy } = this.hoverCell;
            const previewAsset = this.previewAssetId
                ? ASSET_INDEX[this.previewAssetId]
                : null;
            const fp = previewAsset?.footprint ?? { w: 1, d: 1 };
            items.push({
                key: gx + gy - 0.001,
                draw: () => this._drawHoverTiles(gx, gy, fp),
            });
            const ghostBlocked = this._isAnimAtCell(gx, gy);
            if (previewAsset && previewAsset.kind === 'object' && !this.eraseMode && !ghostBlocked) {
                if (this._castsShadow(getAsset(previewAsset.id))) {
                    items.push({
                        key: (gx + fp.w - 1) + (gy + fp.d - 1) - 0.5,
                        draw: () => this._drawPreviewShadow(previewAsset, gx, gy),
                    });
                }
                items.push({
                    key: (gx + fp.w - 1) + (gy + fp.d - 1) + 0.001,
                    draw: () => this._drawPreviewObject(previewAsset, gx, gy),
                });
            }
            if (previewAsset && previewAsset.kind === 'terrain' && !this.eraseMode && !ghostBlocked) {
                items.push({
                    key: gx + gy + 0.0005,
                    draw: () => this._drawPreviewTerrain(previewAsset, gx, gy),
                });
            }
        }

        if (items.length > 1) items.sort((a, b) => a.key - b.key);
        for (const item of items) item.draw();
    }

    _drawAnimatingObject(obj, t) {
        const ctx = this.ctx;
        const asset = getAsset(obj.assetId);
        if (!asset) return;
        const { x, y } = cellToScreen(obj.gx, obj.gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        const s = this._easeOutElastic(t);
        const pivot = cellToScreen(obj.gx + obj.footprint.w / 2, obj.gy + obj.footprint.d / 2);
        if (asset.flatBase) {
            pivot.y += (obj.footprint.w + obj.footprint.d) * TH / 4;
        }
        ctx.save();
        ctx.globalAlpha *= Math.min(1, t * 1.6);
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(s, s);
        ctx.translate(-pivot.x, -pivot.y);
        this._drawAssetImage(ctx, asset, dx, dy, obj.gx, obj.gy, obj.footprint, {
            flipH: obj.flipH,
            flipV: obj.flipV,
        });
        ctx.restore();
    }

    _drawAnimatingTile(assetId, gx, gy, t) {
        const ctx = this.ctx;
        const asset = getAsset(assetId);
        if (!asset) return;
        const { x, y } = cellToScreen(gx, gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        const s = this._easeOutElastic(t);
        const pivot = cellToScreen(gx + 0.5, gy + 0.5);
        ctx.save();
        ctx.globalAlpha *= Math.min(1, t * 1.6);
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(s, s);
        ctx.translate(-pivot.x, -pivot.y);
        const src = asset.displayCanvas || asset.canvas;
        ctx.drawImage(src, dx, dy, asset.width, asset.height);
        ctx.restore();
    }

    _drawPreviewShadow(previewAsset, gx, gy) {
        const ctx = this.ctx;
        const asset = getAsset(previewAsset.id);
        if (!asset) return;
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * SHADOW_ALPHA * (this.previewValid ? 1 : 0.5);
        this._drawShadowFor(ctx, asset, gx, gy, previewAsset.footprint, {
            flipH: this.previewFlipH,
            flipV: this.previewFlipV,
        });
        ctx.globalAlpha = prev;
    }

    /* ── Shadow drawing (uses pre-blurred silhouettes) ────────── */

    _castsShadow(asset) {
        return !!asset
            && !asset.tileLike
            && !asset.noShadow
            && asset.kind !== 'terrain'
            && (asset.shadowStyle === 'contact' || !!asset.shadowCanvas);
    }

    _drawShadowFor(ctx, asset, gx, gy, footprint, flip) {
        if (asset.shadowStyle === 'contact') {
            this._drawContactShadowFor(ctx, asset, gx, gy, footprint, flip);
            return;
        }
        this._drawCastShadowFor(ctx, asset, gx, gy, footprint, flip);
    }

    /**
     * Low props like railings look wrong with a long projected silhouette:
     * it reads as if they are floating. Give them a tight grounding shadow
     * directly below their feet instead.
     */
    _drawContactShadowFor(ctx, asset, gx, gy, footprint, flip = {}) {
        const back = cellToScreen(gx, gy);
        const dx = back.x - asset.anchorX;
        const dy = back.y - asset.anchorY;
        const padW = Math.max(7, asset.width * 0.18);
        const padH = Math.max(4, TH * 0.14);
        const points = asset.contactPoints?.length >= 2
            ? asset.contactPoints
            : [
                { x: asset.width * 0.28, y: asset.height },
                { x: asset.width * 0.72, y: asset.height },
            ];
        const posts = points.map(point => ({
            x: dx + (flip.flipH ? asset.width - point.x : point.x),
            y: dy + (flip.flipV ? asset.height - point.y : point.y),
        }));
        const center = {
            x: (posts[0].x + posts[1].x) / 2,
            y: (posts[0].y + posts[1].y) / 2,
        };
        const bridgeW = Math.hypot(posts[1].x - posts[0].x, posts[1].y - posts[0].y) + padW;
        const bridgeAngle = Math.atan2(posts[1].y - posts[0].y, posts[1].x - posts[0].x);

        ctx.save();
        ctx.fillStyle = 'rgba(35, 25, 10, 1)';
        ctx.save();
        ctx.globalAlpha *= 0.18;
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, bridgeW / 2, padH * 0.45, bridgeAngle, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha *= 0.82;
        for (const post of posts) {
            ctx.beginPath();
            ctx.ellipse(post.x, post.y, padW / 2, padH / 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /**
     * Project an asset's silhouette onto the ground plane using a 2D
     * affine transform. Taller pixels project toward the back of the map
     * (up on screen), with only a slight left drift.
     *
     * The silhouette is pre-blurred at asset-load time, so the per-frame
     * cost is one transformed `drawImage` — no `ctx.filter` blur in the
     * render loop at all.
     */
    _drawCastShadowFor(ctx, asset, gx, gy, footprint, flip) {
        const ground = cellToScreen(gx + footprint.w / 2, gy + footprint.d / 2);
        if (asset.flatBase) {
            const halfCellH = (footprint.w + footprint.d) * TH / 4;
            ground.y += halfCellH;
        }
        const ax = asset.width / 2;
        const ay = asset.height;
        const a = 1, b = 0, c = BACK_DRIFT_X, d = BACK_DRIFT_Y;
        const e = ground.x - ax - ay * BACK_DRIFT_X;
        const f = ground.y      - ay * BACK_DRIFT_Y;
        ctx.save();
        ctx.transform(a, b, c, d, e, f);
        if (flip?.flipH || flip?.flipV) {
            ctx.translate(ax, ay);
            ctx.scale(flip.flipH ? -1 : 1, flip.flipV ? -1 : 1);
            ctx.translate(-ax, -ay);
        }
        const pad = asset.shadowPadding || 0;
        ctx.drawImage(
            asset.shadowCanvas,
            -pad, -pad,
            asset.width + pad * 2,
            asset.height + pad * 2,
        );
        ctx.restore();
    }

    /* ── Preview drawing ──────────────────────────────────────── */

    _drawPreviewObject(previewAsset, gx, gy) {
        const ctx = this.ctx;
        const asset = getAsset(previewAsset.id);
        if (!asset) return;
        const { x, y } = cellToScreen(gx, gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        ctx.save();
        ctx.globalAlpha = this.previewValid ? 0.32 : 0.22;
        this._drawAssetImage(ctx, asset, dx, dy, gx, gy, previewAsset.footprint, {
            flipH: this.previewFlipH,
            flipV: this.previewFlipV,
        });
        ctx.restore();
    }

    _drawPreviewTerrain(previewAsset, gx, gy) {
        const ctx = this.ctx;
        const asset = getAsset(previewAsset.id);
        if (!asset) return;
        const { x, y } = cellToScreen(gx, gy);
        const dx = x - asset.anchorX;
        const dy = y - asset.anchorY;
        const src = asset.displayCanvas || asset.canvas;
        ctx.save();
        ctx.globalAlpha = 0.38;
        ctx.drawImage(src, dx, dy, asset.width, asset.height);
        ctx.restore();
    }

    /**
     * Draw an asset image into `ctx`, optionally mirrored horizontally /
     * vertically around the screen centre of its footprint diamond. Used
     * by both the static-objects cache builder and the live overlay so
     * the same flip logic applies in both passes.
     */
    _drawAssetImage(ctx, asset, dx, dy, gx, gy, footprint = { w: 1, d: 1 }, flip = {}) {
        const flipH = flip.flipH === true;
        const flipV = flip.flipV === true;
        const src = asset.displayCanvas || asset.canvas;
        if (!flipH && !flipV) {
            ctx.drawImage(src, dx, dy, asset.width, asset.height);
            return;
        }
        const pivot = cellToScreen(gx + footprint.w / 2, gy + footprint.d / 2);
        ctx.save();
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.translate(-pivot.x, -pivot.y);
        ctx.drawImage(src, dx, dy, asset.width, asset.height);
        ctx.restore();
    }

    /* ── Grid + hover ─────────────────────────────────────────── */

    _drawGrid() {
        const ctx = this.ctx;
        ctx.save();
        ctx.lineWidth = 1 / this.camera.zoom;
        ctx.strokeStyle = 'rgba(60, 50, 30, 0.18)';
        ctx.beginPath();
        for (let g = 0; g <= this.tileMap.width; g++) {
            const a = cellToScreen(g, 0);
            const b = cellToScreen(g, this.tileMap.height);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        for (let g = 0; g <= this.tileMap.height; g++) {
            const a = cellToScreen(0, g);
            const b = cellToScreen(this.tileMap.width, g);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    /** Draw highlighted footprint cells under the cursor. */
    _drawHoverTiles(gx, gy, footprint) {
        const ctx = this.ctx;
        ctx.save();
        const valid = this.previewValid;
        const stroke = this.eraseMode
            ? 'rgba(216, 91, 142, 1)'
            : (valid ? 'rgba(27, 91, 168, 1)' : 'rgba(216, 91, 91, 1)');
        const fill = this.eraseMode
            ? 'rgba(216, 91, 142, 0.18)'
            : (valid ? 'rgba(27, 91, 168, 0.16)' : 'rgba(216, 91, 91, 0.16)');

        ctx.lineWidth = 2 / this.camera.zoom;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;

        for (let ix = 0; ix < footprint.w; ix++)
        for (let iy = 0; iy < footprint.d; iy++) {
            const cx = gx + ix;
            const cy = gy + iy;
            if (!this.tileMap.inBounds(cx, cy)) continue;
            const a = cellToScreen(cx, cy);
            const b = cellToScreen(cx + 1, cy);
            const c = cellToScreen(cx + 1, cy + 1);
            const d = cellToScreen(cx, cy + 1);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(c.x, c.y);
            ctx.lineTo(d.x, d.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }
}
