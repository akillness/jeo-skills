/**
 * assetDefinitions.js
 *
 * The procedural definitions for every visible asset in the game.
 *
 * Each builder function returns a list of voxels (see voxelRenderer.js).
 * Coordinates use grid-cell-relative voxel coordinates: a 1×1 footprint
 * occupies voxels x,y in [0..VPT) where VPT = CONFIG.voxel.perTile.
 *
 * Buildings naturally span multiple tile footprints; we just emit voxels in
 * the footprint's voxel range.
 */

import { CONFIG } from '../config.js';
import {
    box, shell, dome, cylinder, pyramidRoof, compose, paintAt,
} from './voxelRenderer.js';

const P = CONFIG.palette;
const VPT = CONFIG.voxel.perTile; // 4

/* ───────────────────────── TERRAIN TILES ───────────────────────── */

/** Single 1-voxel-thick floor of one tile, with optional accents. */
function flatTileFloor(color, accents = null) {
    const voxels = [];
    for (let ix = 0; ix < VPT; ix++)
    for (let iy = 0; iy < VPT; iy++) {
        let c = color;
        if (accents) c = accents(ix, iy) ?? color;
        voxels.push({ x: ix, y: iy, z: 0, c });
    }
    return voxels;
}

export function tileGrass() {
    return flatTileFloor(P.grass, (ix, iy) => {
        if ((ix + iy) % 3 === 0) return P.grassDark;
        if ((ix * 7 + iy * 13) % 5 === 0) return P.grassLight;
        return null;
    });
}
export function tileSand() {
    return flatTileFloor(P.sand, (ix, iy) => {
        if ((ix * 5 + iy * 3) % 7 === 0) return P.sandDark;
        return null;
    });
}
export function tileStonePath() {
    return flatTileFloor(P.path, (ix, iy) => {
        // Brick-like alternating darker stones
        const brick = ((Math.floor(iy / 1) + (ix % 2 === 0 ? 0 : 1))) % 2;
        if (brick === 0) return P.pathDark;
        if ((ix === 1 && iy === 2) || (ix === 3 && iy === 0)) return P.pathLight;
        return null;
    });
}
export function tileWhiteStone() {
    return flatTileFloor(P.white, (ix, iy) => {
        if ((ix + iy) % 4 === 0) return P.whiteShadow;
        return null;
    });
}
export function tileWater() {
    // Water: flat, slightly below ground (z = 0 still but darker)
    const voxels = flatTileFloor(P.sea, (ix, iy) => {
        if ((ix * 13 + iy * 7) % 6 === 0) return P.seaShine;
        if ((ix + iy) % 3 === 0) return P.seaDeep;
        return null;
    });
    // Tag this tile as water so the renderer can apply a slight transparency.
    voxels.forEach(v => { v.water = true; });
    return voxels;
}
export function tileSeaWall() {
    // A canal-edge piece: low wall along one side + a strip of water on the
    // other side. Compact so it can sit on the grid.
    return compose(
        // Sand base (back half)
        box(0, 0, 0, VPT, 2, 1, P.sand),
        // Water strip (front half)
        (() => {
            const w = box(0, 2, 0, VPT, 2, 1, P.sea);
            w.forEach(v => { v.water = true; });
            return w;
        })(),
        // Low wall divider
        box(0, 1, 1, VPT, 1, 1, P.seaWall),
    );
}
export function tileStairs() {
    // Two steps going up to the right (east).
    return compose(
        box(0, 0, 0, VPT, VPT, 1, P.white),
        box(VPT - 1, 0, 1, 1, VPT, 1, P.white),
        box(VPT - 2, 0, 2, 2, VPT, 1, P.whiteShadow),
    );
}

/* ───────────────────────── BORDERS / FENCES ─────────────────────── */

export function lowWhiteWall() {
    // Spans full back edge, 2 voxels tall.
    return compose(
        box(0, 0, 0, VPT, 1, 2, P.white),
        // top trim slightly darker
        box(0, 0, 2, VPT, 1, 1, P.whiteShadow),
    );
}
export function blueRailing() {
    // Cobalt railing: posts + horizontal rails along front edge.
    const out = [];
    for (let ix = 0; ix < VPT; ix++) {
        if (ix === 0 || ix === VPT - 1 || ix === Math.floor(VPT / 2)) {
            for (let iz = 0; iz < 3; iz++) out.push({ x: ix, y: VPT - 1, z: iz, c: P.cobalt });
        }
    }
    // top rail
    for (let ix = 0; ix < VPT; ix++) out.push({ x: ix, y: VPT - 1, z: 2, c: P.cobaltLight });
    return out;
}
export function cornerWall() {
    // L-shape corner.
    return compose(
        box(0, 0, 0, VPT, 1, 3, P.white),
        box(0, 0, 0, 1, VPT, 3, P.white),
        box(0, 0, 3, VPT, 1, 1, P.whiteShadow),
        box(0, 0, 3, 1, VPT, 1, P.whiteShadow),
    );
}
export function woodenGateFence() {
    // Wooden post + slats spanning the cell.
    const out = [];
    out.push(...box(0, 1, 0, 1, 1, 4, P.woodDark));
    out.push(...box(VPT - 1, 1, 0, 1, 1, 4, P.woodDark));
    // horizontal planks
    for (let ix = 0; ix < VPT; ix++) {
        out.push({ x: ix, y: 1, z: 1, c: P.wood });
        out.push({ x: ix, y: 1, z: 3, c: P.wood });
    }
    // vertical slats
    for (let ix = 1; ix < VPT - 1; ix++) {
        for (let iz = 0; iz < 4; iz++) out.push({ x: ix, y: 1, z: iz, c: P.woodLight });
    }
    return out;
}
export function lanternPost() {
    // Tall slender post + lit head.
    const cx = Math.floor(VPT / 2);
    const cy = Math.floor(VPT / 2);
    return compose(
        box(cx, cy, 0, 1, 1, 6, P.iron),
        box(cx - 1, cy - 1, 6, 3, 3, 1, P.iron),
        box(cx, cy, 7, 1, 1, 1, P.flame),
        box(cx - 1, cy - 1, 8, 3, 3, 1, P.iron),
    );
}

/* ───────────────────────── NATURE ──────────────────────────────── */

export function cypressCluster() {
    // Two slim conical trees.
    const out = [];
    const trunkColor = P.woodDark;
    const leafC = P.cypress;
    const leafD = P.cypressDark;
    function tree(cx, cy, hMax) {
        out.push({ x: cx, y: cy, z: 0, c: trunkColor });
        for (let z = 1; z <= hMax; z++) {
            const ringR = z >= hMax - 1 ? 0 : 1;
            for (let dx = -ringR; dx <= ringR; dx++)
            for (let dy = -ringR; dy <= ringR; dy++) {
                if (Math.abs(dx) + Math.abs(dy) > ringR) continue;
                const c = (dx + dy + z) % 3 === 0 ? leafD : leafC;
                out.push({ x: cx + dx, y: cy + dy, z, c });
            }
        }
        // top point
        out.push({ x: cx, y: cy, z: hMax + 1, c: leafD });
    }
    tree(1, 2, 6);
    tree(2, 1, 5);
    return out;
}

export function bougainvilleaTree() {
    // Round canopy of pink + dark pink with a small pot/base.
    const out = [];
    // Pot
    out.push(...box(1, 1, 0, 2, 2, 1, P.terracotta));
    // Trunk
    out.push({ x: 1, y: 1, z: 1, c: P.woodDark });
    out.push({ x: 1, y: 1, z: 2, c: P.woodDark });
    // Canopy: 3-wide blob
    const canopy = [
        // bottom layer
        { dx: 0, dy: 0, dz: 3 }, { dx: 1, dy: 0, dz: 3 }, { dx: 2, dy: 0, dz: 3 },
        { dx: 0, dy: 1, dz: 3 }, { dx: 1, dy: 1, dz: 3 }, { dx: 2, dy: 1, dz: 3 },
        { dx: 0, dy: 2, dz: 3 }, { dx: 1, dy: 2, dz: 3 }, { dx: 2, dy: 2, dz: 3 },
        // top layer slightly smaller
        { dx: 1, dy: 0, dz: 4 }, { dx: 0, dy: 1, dz: 4 }, { dx: 1, dy: 1, dz: 4 }, { dx: 2, dy: 1, dz: 4 }, { dx: 1, dy: 2, dz: 4 },
    ];
    for (const v of canopy) {
        const noise = (v.dx * 5 + v.dy * 7 + v.dz * 3) % 4;
        let c = P.bougain;
        if (noise === 0) c = P.bougainDark;
        else if (noise === 1) c = P.bougainLight;
        else if (noise === 2) c = P.leafDark;
        out.push({ x: v.dx, y: v.dy, z: v.dz, c });
    }
    return out;
}

export function oliveTree() {
    const out = [];
    // Trunk
    out.push({ x: 1, y: 2, z: 0, c: P.woodDark });
    out.push({ x: 1, y: 2, z: 1, c: P.wood });
    out.push({ x: 1, y: 2, z: 2, c: P.wood });
    // Canopy (mottled olive green)
    const blobs = [
        { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 },
        { dx: 0, dy: 2 }, { dx: 1, dy: 2 }, { dx: 2, dy: 2 },
        { dx: 0, dy: 3 }, { dx: 1, dy: 3 }, { dx: 2, dy: 3 },
    ];
    for (const v of blobs) {
        for (let dz = 0; dz < 2; dz++) {
            const z = 3 + dz;
            const noise = (v.dx * 3 + v.dy * 5 + dz * 7) % 4;
            const c = noise === 0 ? P.oliveDark : noise === 1 ? P.oliveLight : P.olive;
            out.push({ x: v.dx, y: v.dy, z, c });
        }
    }
    out.push({ x: 1, y: 2, z: 5, c: P.olive });
    return out;
}

export function agavePlant() {
    const out = [];
    // Spiked rosette: blades reach outwards.
    const cx = 1, cy = 2;
    for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const len = 2;
        for (let s = 0; s <= len; s++) {
            const dx = Math.round(Math.cos(angle) * s);
            const dy = Math.round(Math.sin(angle) * s);
            const z = Math.floor(s / 2);
            out.push({ x: cx + dx, y: cy + dy, z, c: s === len ? P.agaveDark : P.agave });
        }
    }
    out.push({ x: cx, y: cy, z: 1, c: P.agave });
    return out;
}

export function dryGrassTuft() {
    // Sparse golden tuft.
    return [
        { x: 1, y: 2, z: 0, c: P.dryGrass },
        { x: 2, y: 2, z: 0, c: P.dryGrass },
        { x: 1, y: 2, z: 1, c: P.dryGrass },
        { x: 2, y: 1, z: 0, c: P.dryGrass },
        { x: 2, y: 1, z: 1, c: P.dryGrass },
    ];
}

export function flowerPot() {
    // Terracotta pot with bushy pink/white flowers.
    return compose(
        box(1, 1, 0, 2, 2, 1, P.terracotta),
        box(1, 1, 1, 2, 2, 1, P.terraDark),
        // bush
        box(1, 1, 2, 2, 2, 1, P.leaf),
        [
            { x: 1, y: 1, z: 3, c: P.flower },
            { x: 2, y: 1, z: 3, c: P.flowerWhite },
            { x: 1, y: 2, z: 3, c: P.flowerYellow },
            { x: 2, y: 2, z: 3, c: P.flower },
        ],
    );
}

/* ───────────────────────── PROPS ───────────────────────────────── */

export function stoneLantern() {
    return compose(
        box(1, 1, 0, 2, 2, 1, P.stoneDark),
        box(1, 1, 1, 2, 2, 1, P.stone),
        box(1, 1, 2, 2, 2, 1, P.flame),
        box(1, 1, 3, 2, 2, 1, P.stoneDark),
    );
}
export function hangingLantern() {
    return compose(
        box(1, 1, 0, 1, 1, 5, P.iron),
        box(2, 1, 5, 2, 1, 1, P.iron),
        box(2, 1, 4, 1, 1, 1, P.iron),
        box(2, 1, 3, 1, 1, 1, P.flame),
        box(2, 1, 2, 1, 1, 1, P.iron),
    );
}

export function whiteArchway() {
    // Two pillars + arched top with rounded inner.
    const out = [];
    out.push(...box(0, 1, 0, 1, 2, 4, P.white));
    out.push(...box(VPT - 1, 1, 0, 1, 2, 4, P.white));
    out.push(...box(0, 1, 4, VPT, 2, 1, P.whiteShadow));
    out.push(...box(0, 1, 5, VPT, 2, 1, P.white));
    // small bougainvillea drape
    out.push({ x: 0, y: 1, z: 5, c: P.bougain });
    out.push({ x: VPT - 1, y: 1, z: 5, c: P.bougain });
    out.push({ x: 1, y: 1, z: 5, c: P.bougainLight });
    return out;
}

export function signpost() {
    return compose(
        box(1, 2, 0, 1, 1, 3, P.woodDark),
        box(0, 2, 2, 3, 1, 1, P.wood),
        [{ x: 1, y: 2, z: 3, c: P.woodLight }],
    );
}

export function bannerFlag() {
    return compose(
        box(1, 2, 0, 1, 1, 5, P.iron),
        box(2, 2, 4, 1, 1, 1, P.cobalt),
        box(2, 2, 3, 1, 1, 1, P.cobaltLight),
        box(2, 2, 2, 1, 1, 1, P.cobalt),
    );
}

export function smallChapelAltar() {
    // 2×2 cell altar/shrine: stepped white plinth with a cobalt dome and
    // a small cross on top — reads as a small chapel-style building.
    const W = VPT * 2;
    const cx = Math.floor(W / 2) - 1;
    const cy = Math.floor(W / 2) - 1;
    return compose(
        box(0, 0, 0, W, W, 2, P.white),
        box(1, 1, 2, W - 2, W - 2, 1, P.whiteShadow),
        box(2, 2, 3, W - 4, W - 4, 2, P.white),
        dome(cx, cy, 5, 2, P.cobalt),
        [
            { x: cx, y: cy, z: 8, c: P.white },
            { x: cx, y: cy, z: 9, c: P.white },
            { x: cx - 1, y: cy, z: 9, c: P.white },
            { x: cx + 1, y: cy, z: 9, c: P.white },
        ],
    );
}

export function smallBridge() {
    // 2-cell wide arched bridge.
    const out = [];
    for (let ix = 0; ix < VPT * 2; ix++) {
        const arch = Math.floor(Math.sin((ix / (VPT * 2 - 1)) * Math.PI) * 2);
        for (let iy = 0; iy < VPT; iy++) {
            out.push({ x: ix, y: iy, z: 0 + arch, c: P.wood });
        }
        if (arch > 0) {
            out.push({ x: ix, y: 0, z: arch + 1, c: P.cobalt });
            out.push({ x: ix, y: VPT - 1, z: arch + 1, c: P.cobalt });
        }
    }
    return out;
}

export function well() {
    // Stone well with bucket on top.
    return compose(
        box(0, 0, 0, VPT, VPT, 1, P.stone),
        shell(1, 1, 1, 2, 2, 2, P.stone),
        [
            { x: 1, y: 1, z: 1, c: P.sea },
            { x: 2, y: 1, z: 1, c: P.sea },
            { x: 1, y: 2, z: 1, c: P.sea },
            { x: 2, y: 2, z: 1, c: P.sea },
        ],
        // Posts and roof
        box(0, 0, 3, 1, 1, 3, P.woodDark),
        box(VPT - 1, VPT - 1, 3, 1, 1, 3, P.woodDark),
        box(0, 0, 6, VPT, VPT, 1, P.roof),
        pyramidRoof(0, 0, 7, VPT, VPT, 2, P.roofDark),
    );
}

export function plantedGardenBed() {
    // 1 cell raised garden with mixed plants.
    return compose(
        box(0, 0, 0, VPT, VPT, 1, P.wood),
        box(1, 1, 1, 2, 2, 1, P.soil),
        [
            { x: 1, y: 1, z: 2, c: P.flower },
            { x: 2, y: 1, z: 2, c: P.flowerYellow },
            { x: 1, y: 2, z: 2, c: P.flowerWhite },
            { x: 2, y: 2, z: 2, c: P.flower },
            { x: 0, y: 0, z: 1, c: P.leaf },
            { x: 3, y: 3, z: 1, c: P.leaf },
        ],
    );
}

export function cropPatch() {
    return compose(
        box(0, 0, 0, VPT, VPT, 1, P.soilDark),
        // rows of crops
        (() => {
            const o = [];
            for (let row = 0; row < VPT; row += 2) {
                for (let ix = 0; ix < VPT; ix++) {
                    o.push({ x: ix, y: row, z: 1, c: P.crop });
                }
            }
            return o;
        })(),
    );
}

export function vegetableGarden() {
    return compose(
        box(0, 0, 0, VPT, VPT, 1, P.wood),
        box(1, 1, 1, 2, 2, 1, P.soilDark),
        [
            { x: 0, y: 1, z: 1, c: P.cropDark },
            { x: 1, y: 0, z: 1, c: P.cropDark },
            { x: 2, y: 0, z: 1, c: P.crop },
            { x: 3, y: 1, z: 1, c: P.crop },
            { x: 3, y: 2, z: 1, c: P.cropDark },
            { x: 2, y: 3, z: 1, c: P.crop },
            { x: 1, y: 3, z: 1, c: P.cropDark },
            { x: 0, y: 2, z: 1, c: P.crop },
        ],
    );
}

export function waterBucket() {
    return compose(
        box(1, 1, 0, 2, 2, 2, P.wood),
        box(1, 1, 2, 2, 2, 1, P.sea),
        [{ x: 1, y: 1, z: 3, c: P.iron }, { x: 2, y: 2, z: 3, c: P.iron }],
    );
}

export function potteryJar() {
    return compose(
        box(1, 1, 0, 2, 2, 1, P.terracotta),
        box(1, 1, 1, 2, 2, 1, P.terraLight),
        box(1, 1, 2, 2, 2, 1, P.terracotta),
        [{ x: 1, y: 1, z: 3, c: P.terraDark }, { x: 2, y: 2, z: 3, c: P.terraDark }],
    );
}

export function woodenCrate() {
    return compose(
        box(1, 1, 0, 2, 2, 2, P.wood),
        // X braces
        [
            { x: 1, y: 1, z: 0, c: P.woodDark },
            { x: 2, y: 2, z: 0, c: P.woodDark },
            { x: 1, y: 1, z: 1, c: P.woodLight },
            { x: 2, y: 2, z: 1, c: P.woodLight },
        ],
    );
}

export function blueBench() {
    return compose(
        // legs
        box(0, 1, 0, 1, 2, 1, P.wood),
        box(VPT - 1, 1, 0, 1, 2, 1, P.wood),
        // seat
        box(0, 1, 1, VPT, 2, 1, P.cobalt),
        // back
        box(0, 0, 1, VPT, 1, 2, P.cobalt),
    );
}

export function hayBale() {
    return compose(
        box(0, 1, 0, VPT, 2, 2, P.dryGrass),
        // accents to read as straw
        [
            { x: 0, y: 1, z: 0, c: P.woodDark },
            { x: VPT - 1, y: 1, z: 1, c: P.woodDark },
            { x: 1, y: 2, z: 1, c: P.dryGrass },
        ],
    );
}

export function rockCluster() {
    return compose(
        box(0, 1, 0, 2, 2, 1, P.stone),
        box(2, 0, 0, 2, 2, 2, P.stoneDark),
        [{ x: 1, y: 2, z: 1, c: P.stoneLight }],
    );
}
export function largeRock() {
    return compose(
        box(0, 0, 0, VPT, VPT, 1, P.stone),
        box(1, 0, 1, 3, 3, 1, P.stoneDark),
        box(1, 1, 2, 2, 2, 1, P.stone),
        [{ x: 1, y: 1, z: 3, c: P.stoneLight }],
    );
}
export function mossyStone() {
    const v = compose(
        box(0, 1, 0, 3, 3, 1, P.stone),
        box(1, 1, 1, 2, 2, 1, P.stoneDark),
        [
            { x: 0, y: 1, z: 0, c: P.leaf },
            { x: 2, y: 3, z: 0, c: P.leafDark },
            { x: 1, y: 2, z: 1, c: P.leaf },
        ],
    );
    return v;
}
export function flatStone() {
    return box(0, 0, 0, VPT, VPT, 1, P.stoneLight);
}
export function pebbles() {
    return [
        { x: 0, y: 1, z: 0, c: P.stone },
        { x: 1, y: 2, z: 0, c: P.stoneDark },
        { x: 2, y: 1, z: 0, c: P.stoneLight },
        { x: 3, y: 2, z: 0, c: P.stone },
        { x: 1, y: 0, z: 0, c: P.stoneDark },
    ];
}
export function stonePile() {
    return compose(
        box(0, 1, 0, 3, 2, 1, P.stone),
        box(1, 1, 1, 2, 1, 1, P.stoneDark),
        [{ x: 1, y: 1, z: 2, c: P.stoneLight }],
    );
}
export function boulder() {
    return compose(
        box(0, 0, 0, 3, 3, 2, P.stone),
        box(1, 1, 2, 2, 2, 1, P.stoneDark),
        [{ x: 1, y: 1, z: 3, c: P.stone }],
    );
}
export function woodPile() {
    const out = [];
    for (let iz = 0; iz < 3; iz++) {
        const c = iz % 2 === 0 ? P.wood : P.woodLight;
        for (let ix = 0; ix < VPT; ix++) {
            out.push({ x: ix, y: 1, z: iz, c });
            out.push({ x: ix, y: 2, z: iz, c: P.woodDark });
        }
    }
    return out;
}
export function storageBox() {
    return compose(
        box(0, 0, 0, VPT, VPT, 2, P.white),
        box(1, 1, 2, 2, 2, 1, P.cobalt),
        [{ x: 1, y: 0, z: 1, c: P.cobaltDeep }, { x: 2, y: 0, z: 1, c: P.cobaltDeep }],
    );
}
export function stoneBasin() {
    return compose(
        box(0, 0, 0, VPT, VPT, 1, P.stone),
        shell(1, 1, 1, 2, 2, 1, P.stone),
        [
            { x: 1, y: 1, z: 1, c: P.sea },
            { x: 2, y: 1, z: 1, c: P.sea },
            { x: 1, y: 2, z: 1, c: P.sea },
            { x: 2, y: 2, z: 1, c: P.sea },
        ],
    );
}
export function terracottaPot() {
    return compose(
        box(1, 1, 0, 2, 2, 1, P.terracotta),
        box(1, 1, 1, 2, 2, 1, P.terraDark),
        [
            { x: 1, y: 1, z: 2, c: P.flower },
            { x: 2, y: 1, z: 2, c: P.flowerWhite },
            { x: 1, y: 2, z: 2, c: P.flowerYellow },
            { x: 2, y: 2, z: 2, c: P.flower },
        ],
    );
}

/* ───────────────────────── BUILDINGS ───────────────────────────── */

/** Helper: paint windows / accents on a wall slab of voxels. */
function addWindow(voxels, x, y, z, color = P.cobalt) {
    voxels.push({ x, y, z, c: color });
}
function addDoor(voxels, x, y, z, color = P.cobalt) {
    voxels.push({ x, y, z, c: color });
    voxels.push({ x, y, z: z + 1, c: color });
}

export function smallMykonosHouse() {
    // 2×2 footprint = 8×8 voxels. Whitewashed cube with blue door, flat roof.
    const W = VPT * 2, D = VPT * 2;
    const out = [];
    // Walls
    out.push(...shell(0, 0, 0, W, D, 5, P.white, { floor: false }));
    // Fill interior (so the inside isn't see-through)
    out.push(...box(0, 0, 0, W, D, 1, P.whiteShadow));
    // Door (front face at y = D-1)
    addDoor(out, 3, D - 1, 0, P.cobalt);
    // Windows
    addWindow(out, 1, D - 1, 2, P.cobalt);
    addWindow(out, 5, D - 1, 2, P.cobalt);
    addWindow(out, 0, 3, 2, P.cobalt);
    // Flat roof + small chimney
    out.push(...box(0, 0, 5, W, D, 1, P.whiteShadow));
    out.push(...box(W - 2, 1, 6, 1, 1, 2, P.white));
    // Pots beside the door
    out.push(...box(2, D - 1, 0, 1, 1, 1, P.terracotta));
    out.push({ x: 2, y: D - 1, z: 1, c: P.flower });
    out.push(...box(4, D - 1, 0, 1, 1, 1, P.terracotta));
    out.push({ x: 4, y: D - 1, z: 1, c: P.bougain });
    // Bougainvillea cascade on side
    out.push({ x: 0, y: 2, z: 5, c: P.bougain });
    out.push({ x: 0, y: 1, z: 4, c: P.bougainLight });
    out.push({ x: 0, y: 0, z: 5, c: P.bougainDark });
    return out;
}

export function twoStoryHouse() {
    // 3×3 footprint with stairs and balcony.
    const W = VPT * 3, D = VPT * 3;
    const out = [];
    // Bottom floor
    out.push(...box(0, 0, 0, W, D, 1, P.whiteShadow));
    out.push(...shell(0, 0, 0, W, D, 5, P.white, {}));
    // Floor at z=5
    out.push(...box(0, 0, 5, W, D, 1, P.whiteShadow));
    // Top floor walls (slightly inset)
    out.push(...shell(1, 1, 6, W - 2, D - 2, 4, P.white));
    // Roof
    out.push(...box(1, 1, 10, W - 2, D - 2, 1, P.whiteShadow));
    // Door
    addDoor(out, 5, D - 1, 0);
    // Windows
    addWindow(out, 2, D - 1, 2);
    addWindow(out, 8, D - 1, 2);
    addWindow(out, 0, 5, 2);
    addWindow(out, W - 1, 5, 2);
    // Upper windows
    addWindow(out, 4, D - 2, 8);
    addWindow(out, 7, D - 2, 8);
    // External staircase on right side
    for (let i = 0; i < 5; i++) {
        out.push(...box(W - 1 + 0, D - 1 - i, 0, 1, 1, i + 1, P.white));
    }
    // Balcony railing
    for (let ix = 1; ix < W - 1; ix++) {
        out.push({ x: ix, y: D - 1, z: 6, c: P.cobalt });
    }
    // Bougainvillea on side
    out.push({ x: 0, y: 1, z: 5, c: P.bougain });
    out.push({ x: 0, y: 2, z: 4, c: P.bougainLight });
    out.push({ x: 0, y: 0, z: 4, c: P.bougainDark });
    return out;
}

export function mainVilla() {
    // 4×4 footprint, multi-tiered, roof terrace + pergola.
    const W = VPT * 4, D = VPT * 4;
    const out = [];
    // base
    out.push(...box(0, 0, 0, W, D, 1, P.whiteShadow));
    out.push(...shell(0, 0, 0, W, D, 5, P.white));
    out.push(...box(0, 0, 5, W, D, 1, P.whiteShadow));
    // upper block (left half)
    out.push(...shell(0, 0, 6, Math.floor(W * 0.6), Math.floor(D * 0.6), 5, P.white));
    out.push(...box(0, 0, 11, Math.floor(W * 0.6), Math.floor(D * 0.6), 1, P.whiteShadow));
    // doorway / front
    addDoor(out, 7, D - 1, 0);
    addWindow(out, 3, D - 1, 2);
    addWindow(out, 11, D - 1, 2);
    addWindow(out, 0, 8, 2);
    addWindow(out, W - 1, 8, 2);
    // pergola on terrace
    for (let ix = 0; ix < Math.floor(W * 0.6); ix += 2) {
        out.push(...box(ix, Math.floor(D * 0.6), 6, 1, 1, 4, P.cobalt));
    }
    for (let ix = 0; ix < Math.floor(W * 0.6); ix++) {
        out.push({ x: ix, y: Math.floor(D * 0.6), z: 10, c: P.cobalt });
    }
    // Pots along front
    for (let i = 1; i < 4; i++) {
        out.push({ x: i * 3, y: D - 1, z: 0, c: P.terracotta });
        out.push({ x: i * 3, y: D - 1, z: 1, c: P.bougain });
    }
    // Bougainvillea cascade
    for (let i = 0; i < 4; i++) {
        out.push({ x: 0, y: i, z: 5, c: i % 2 ? P.bougain : P.bougainLight });
    }
    return out;
}

export function windmillBuilding() {
    // 2×2 footprint, round tower.
    const cx = Math.floor(VPT * 2 / 2);
    const cy = Math.floor(VPT * 2 / 2);
    const out = [];
    out.push(...cylinder(cx, cy, 0, 3, 7, P.white));
    out.push(...cylinder(cx, cy, 7, 3, 1, P.whiteShadow));
    // Conical thatched roof
    for (let iz = 0; iz < 3; iz++) {
        const r = 3 - iz;
        for (let ix = -r; ix <= r; ix++)
        for (let iy = -r; iy <= r; iy++) {
            if (ix * ix + iy * iy <= r * r + 0.3) {
                out.push({ x: cx + ix, y: cy + iy, z: 8 + iz, c: iz === 2 ? P.roofDark : P.roof });
            }
        }
    }
    // Blade hub + 4 blades
    out.push({ x: cx, y: cy, z: 6, c: P.iron });
    out.push({ x: cx + 2, y: cy, z: 6, c: P.wood });
    out.push({ x: cx + 3, y: cy, z: 6, c: P.wood });
    out.push({ x: cx - 2, y: cy, z: 6, c: P.wood });
    out.push({ x: cx - 3, y: cy, z: 6, c: P.wood });
    out.push({ x: cx, y: cy, z: 4, c: P.wood });
    out.push({ x: cx, y: cy, z: 8, c: P.wood });
    // Blue door + window
    addDoor(out, cx, cy + 3, 0);
    addWindow(out, cx, cy - 3, 3);
    return out;
}

export function towerChapel() {
    // 2×2 footprint with bell tower + small dome.
    const W = VPT * 2, D = VPT * 2;
    const out = [];
    out.push(...box(0, 0, 0, W, D, 1, P.whiteShadow));
    out.push(...shell(0, 0, 0, W, D, 6, P.white));
    out.push(...box(0, 0, 6, W, D, 1, P.whiteShadow));
    // tower above
    out.push(...shell(2, 2, 7, 4, 4, 5, P.white));
    // bell window
    out.push(...box(3, 1, 9, 2, 1, 2, P.cobaltDeep));
    out.push(...box(3, D - 2, 9, 2, 1, 2, P.cobaltDeep));
    // dome
    out.push(...box(2, 2, 12, 4, 4, 1, P.whiteShadow));
    out.push(...dome(3, 3, 13, 2, P.cobalt));
    // cross
    out.push({ x: 3, y: 3, z: 16, c: P.white });
    out.push({ x: 3, y: 3, z: 17, c: P.white });
    out.push({ x: 2, y: 3, z: 16, c: P.white });
    out.push({ x: 4, y: 3, z: 16, c: P.white });
    // door
    addDoor(out, 3, D - 1, 0);
    addWindow(out, 1, D - 1, 3);
    addWindow(out, 5, D - 1, 3);
    return out;
}

export function mainChapel() {
    // 3×3 chapel with iconic blue dome.
    const W = VPT * 3, D = VPT * 3;
    const out = [];
    out.push(...box(0, 0, 0, W, D, 1, P.whiteShadow));
    out.push(...shell(0, 0, 0, W, D, 6, P.white));
    out.push(...box(0, 0, 6, W, D, 1, P.whiteShadow));
    // Drum (round-ish)
    const cx = Math.floor(W / 2), cy = Math.floor(D / 2);
    out.push(...cylinder(cx, cy, 7, 3, 2, P.white));
    out.push(...cylinder(cx, cy, 9, 3, 1, P.whiteShadow));
    // Dome
    out.push(...dome(cx, cy, 10, 3, P.cobalt));
    // Cross
    out.push({ x: cx, y: cy, z: 14, c: P.white });
    out.push({ x: cx, y: cy, z: 15, c: P.white });
    out.push({ x: cx - 1, y: cy, z: 14, c: P.white });
    out.push({ x: cx + 1, y: cy, z: 14, c: P.white });
    // Big arched door
    addDoor(out, cx, D - 1, 0);
    addDoor(out, cx - 1, D - 1, 0);
    addWindow(out, 1, D - 1, 3);
    addWindow(out, W - 2, D - 1, 3);
    addWindow(out, 0, cy, 3);
    addWindow(out, W - 1, cy, 3);
    // Bougainvillea trellis
    out.push({ x: 0, y: 0, z: 5, c: P.bougain });
    out.push({ x: 0, y: 1, z: 5, c: P.bougainLight });
    out.push({ x: 0, y: 2, z: 5, c: P.bougainDark });
    return out;
}

export function whiteCubeHouse() {
    // 2×2 minimalist cube house.
    const W = VPT * 2, D = VPT * 2;
    const out = [];
    out.push(...box(0, 0, 0, W, D, 1, P.whiteShadow));
    out.push(...shell(0, 0, 0, W, D, 4, P.white));
    out.push(...box(0, 0, 4, W, D, 1, P.whiteShadow));
    addDoor(out, 3, D - 1, 0);
    addWindow(out, 1, D - 1, 2);
    addWindow(out, 5, D - 1, 2);
    out.push({ x: 0, y: 1, z: 4, c: P.bougain });
    out.push({ x: 0, y: 2, z: 4, c: P.bougainLight });
    return out;
}

export function terraceHouse() {
    // 3×2 with a terrace and stairs.
    const W = VPT * 3, D = VPT * 2;
    const out = [];
    out.push(...box(0, 0, 0, W, D, 1, P.whiteShadow));
    out.push(...shell(0, 0, 0, W, D, 4, P.white));
    out.push(...box(0, 0, 4, W, D, 1, P.whiteShadow));
    // Half-sized upper
    out.push(...shell(0, 0, 5, Math.floor(W / 2), D, 4, P.white));
    out.push(...box(0, 0, 9, Math.floor(W / 2), D, 1, P.whiteShadow));
    // Railing on terrace
    for (let ix = Math.floor(W / 2); ix < W; ix++) {
        out.push({ x: ix, y: D - 1, z: 5, c: P.cobalt });
        out.push({ x: ix, y: 0, z: 5, c: P.cobalt });
    }
    // Stairs
    for (let i = 0; i < 4; i++) {
        out.push(...box(W - 1, D - 1 - i, 0, 1, 1, i + 1, P.white));
    }
    addDoor(out, 4, D - 1, 0);
    addWindow(out, 1, D - 1, 2);
    addWindow(out, 7, D - 1, 2);
    addWindow(out, 2, D - 1, 7);
    return out;
}

export function pergolaHouse() {
    // 3×3 with prominent pergola.
    const W = VPT * 3, D = VPT * 3;
    const out = [];
    out.push(...box(0, 0, 0, W, D, 1, P.whiteShadow));
    out.push(...shell(0, 0, 0, W, D, 5, P.white));
    out.push(...box(0, 0, 5, W, D, 1, P.whiteShadow));
    // Pergola posts
    for (let ix = 0; ix < W; ix += 3) {
        for (let iy = D - 2; iy <= D - 1; iy++) {
            out.push(...box(ix, iy, 5, 1, 1, 3, P.cobalt));
        }
    }
    // Beams
    for (let ix = 0; ix < W; ix++) {
        out.push({ x: ix, y: D - 2, z: 8, c: P.cobalt });
        out.push({ x: ix, y: D - 1, z: 8, c: P.cobalt });
    }
    addDoor(out, 5, D - 1, 0);
    addWindow(out, 1, D - 1, 2);
    addWindow(out, 9, D - 1, 2);
    addWindow(out, 0, 5, 2);
    // Bougainvillea on pergola
    for (let ix = 1; ix < W; ix += 2) {
        out.push({ x: ix, y: D - 2, z: 8, c: P.bougain });
    }
    return out;
}
