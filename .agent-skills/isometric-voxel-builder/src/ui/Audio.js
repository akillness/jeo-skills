/**
 * Audio.js
 *
 * Tiny one-shot SFX player for in-game cues. Each clip is loaded once,
 * decoded into an AudioBuffer, and played via short-lived
 * AudioBufferSourceNodes so that rapid-fire triggers overlap cleanly
 * (instead of restarting / cutting off a single shared <audio> element).
 *
 * Audio policies on every modern browser require a user gesture before
 * sound can play, so we lazily resume the AudioContext on the first
 * trigger and silently ignore the call if the context is still suspended.
 */

const DEFAULT_VOLUME = 0.55;

let _audioCtx = null;
let _enabled = true;

// Per-clip state. Each entry is { buffer, loading, lastPlayAt, minIntervalMs }.
const _clips = new Map();

function getCtx() {
    if (_audioCtx) return _audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
        _audioCtx = new Ctx();
    } catch {
        return null;
    }
    return _audioCtx;
}

/**
 * Fetch + decode a clip and register it under `name`. Safe to call
 * multiple times — re-registering with the same name returns the
 * memoised promise. Failures are logged and swallowed: a missing
 * sound file should never break the UI.
 *
 * `minIntervalMs` debounces rapid-fire triggers (default 18ms keeps a
 * keyboard-repeat from machine-gunning the clip).
 */
export async function registerClip(name, url, { minIntervalMs = 18 } = {}) {
    let entry = _clips.get(name);
    if (entry?.buffer || entry?.loading) return entry.loading ?? Promise.resolve();
    if (!entry) {
        entry = { buffer: null, loading: null, lastPlayAt: 0, minIntervalMs };
        _clips.set(name, entry);
    } else {
        entry.minIntervalMs = minIntervalMs;
    }
    entry.loading = (async () => {
        const ctx = getCtx();
        if (!ctx) return;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.arrayBuffer();
            entry.buffer = await new Promise((resolve, reject) => {
                ctx.decodeAudioData(data, resolve, reject);
            });
        } catch (err) {
            console.warn(`[audio] failed to load clip "${name}":`, err);
        }
    })();
    return entry.loading;
}

/**
 * Trigger a registered clip. No-op when audio is disabled, the buffer
 * hasn't loaded yet, or the AudioContext is still suspended waiting for
 * a user gesture (the very first interaction primes it).
 */
export function play(name, volume = DEFAULT_VOLUME) {
    if (!_enabled) return;
    const entry = _clips.get(name);
    if (!entry || !entry.buffer) return;
    const ctx = getCtx();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }

    const now = performance.now();
    if (now - entry.lastPlayAt < entry.minIntervalMs) return;
    entry.lastPlayAt = now;

    try {
        const src = ctx.createBufferSource();
        src.buffer = entry.buffer;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain).connect(ctx.destination);
        src.start(0);
    } catch {
        /* swallow — sound failures are non-fatal */
    }
}

/* ── Convenience wrappers for the clips we ship ─────────────────── */

export async function loadUiAudio() {
    // Seven clips: a soft click for menus / palette / toolbar / shortcuts,
    // a generic "thud" fallback, a wet splash for water tiles, a chunky
    // knock for stone / brick / plaster masonry, a hollow tap for fences
    // / wooden decorations, a soft rustle for small vegetation, and a
    // leafier whoosh for trees / large vegetation. All loaded in parallel.
    await Promise.all([
        registerClip('ui',                'menu_select_lightbulb.ogg',   { minIntervalMs: 18 }),
        // Brushing across cells fires very rapidly; allow modest overlap
        // but throttle a touch more aggressively than the UI click.
        registerClip('placement',         'new-placement.ogg',            { minIntervalMs: 35 }),
        registerClip('placementWater',    'waterPlacement.ogg',           { minIntervalMs: 50 }),
        registerClip('placementStone',    'brick-stone.ogg',              { minIntervalMs: 35 }),
        registerClip('placementWood',     'fence-woodenDecorations.ogg',  { minIntervalMs: 35 }),
        registerClip('placementVeg',      'small-vegetations.ogg',        { minIntervalMs: 30 }),
        registerClip('placementTree',     'large-vegetations.ogg',        { minIntervalMs: 40 }),
    ]);
}

export function playUiClick(volume = DEFAULT_VOLUME)   { play('ui',             volume); }
export function playPlacement(volume = 0.6)            { play('placement',      volume); }
export function playWaterPlacement(volume = 0.6)       { play('placementWater', volume); }
export function playStonePlacement(volume = 0.6)       { play('placementStone', volume); }
export function playWoodPlacement(volume = 0.6)        { play('placementWood',  volume); }
export function playVegPlacement(volume = 0.6)         { play('placementVeg',   volume); }
export function playTreePlacement(volume = 0.6)        { play('placementTree',  volume); }

/**
 * Asset ids whose placement / erase should trigger the brick-stone SFX.
 * Includes the obvious stone terrain + props plus the white-plastered
 * Mykonos buildings (which are masonry under the paint).
 *
 * Kept as flat Sets so membership checks stay O(1) inside the per-click
 * `playPlacementFor` lookup.
 */
const STONE_ASSET_IDS = new Set([
    // Terrain
    'stone', 'path', 'sea_wall', 'stairs',
    // Walls / arches / lanterns / basins
    'low_wall', 'corner_wall', 'archway',
    'stone_lantern', 'stone_basin', 'well',
    // Rock clutter
    'rocks', 'large_rock', 'mossy_stone', 'flat_stone',
    'pebbles', 'stone_pile', 'boulder',
    // Buildings (whitewashed masonry)
    'house', 'two_story', 'cube_house', 'terrace_house', 'pergola_house',
    'villa', 'altar', 'tower_chapel', 'main_chapel', 'windmill',
]);

/**
 * Asset ids whose placement / erase should trigger the wood / fence SFX.
 * Covers wooden fences and railings, wooden furniture and props, and
 * the wooden planter boxes / bridges in the water category.
 */
const WOOD_ASSET_IDS = new Set([
    // Fences / railings / gates
    'blue_railing', 'gate_fence',
    // Wooden furniture / signage
    'bench', 'signpost', 'banner',
    // Lantern posts (wooden mast)
    'lantern_post', 'hanging_lantern',
    // Wooden carryables
    'crate', 'hay_bale', 'storage_box', 'wood_pile', 'water_bucket',
    // Wooden water-category structures
    'small_bridge', 'garden_bed', 'crop_patch', 'veg_garden',
]);

/**
 * Asset ids whose placement / erase should trigger the small-vegetation
 * rustle. Includes the grass terrain plus low-lying plant props
 * (succulents, grass tufts, potted flowers).
 */
const SMALL_VEG_ASSET_IDS = new Set([
    'grass',
    'agave', 'dry_grass', 'flower_pot', 'terracotta_pot',
]);

/**
 * Asset ids whose placement / erase should trigger the large-vegetation /
 * tree whoosh. Reserved for full trees and tall flowering plants.
 */
const LARGE_VEG_ASSET_IDS = new Set([
    'cypress', 'olive', 'bougainvillea',
]);

/**
 * Pick the right placement SFX for a given asset id:
 *   - water tiles       → splash
 *   - stone / masonry   → brick knock
 *   - fence / wood      → hollow wood tap
 *   - small vegetation  → soft rustle
 *   - trees / large veg → leafy whoosh
 *   - everything else   → generic placement thud
 *
 * Centralising the lookup here means callers don't need to know the
 * asset taxonomy.
 */
export function playPlacementFor(assetId) {
    if (assetId === 'water') {
        playWaterPlacement();
        return;
    }
    if (STONE_ASSET_IDS.has(assetId)) {
        playStonePlacement();
        return;
    }
    if (WOOD_ASSET_IDS.has(assetId)) {
        playWoodPlacement();
        return;
    }
    if (SMALL_VEG_ASSET_IDS.has(assetId)) {
        playVegPlacement();
        return;
    }
    if (LARGE_VEG_ASSET_IDS.has(assetId)) {
        playTreePlacement();
        return;
    }
    playPlacement();
}

export function setUiAudioEnabled(on) { _enabled = !!on; }
export function isUiAudioEnabled() { return _enabled; }
