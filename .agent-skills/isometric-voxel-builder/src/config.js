/**
 * Game configuration.
 *
 * All shared dimensions, colors and tuning live here so that the rest of the
 * code can speak in terms of grid cells / world tiles, while only this file
 * cares about pixel sizes.
 */

export const CONFIG = Object.freeze({
    grid: {
        width: 14,
        height: 14,
    },

    // A "tile" is one cell on the isometric ground grid.
    // 2:1 isometric tile (classic look), 64px wide × 32px tall.
    tile: {
        w: 64,
        h: 32,
    },

    // Each tile is 4×4 voxels. So a single voxel cube is 16×16 (top face)
    // and 16 px tall on screen. This keeps assets crisp and chunky.
    voxel: {
        perTile: 4,        // voxels per tile edge
        size: 16,          // screen pixels (top-face width)
        height: 16,        // screen pixels (vertical extent)
    },

    camera: {
        minZoom: 0.5,
        maxZoom: 3.0,
        defaultZoom: 1.4,
    },

    // For depth sorting in the scene.
    layers: Object.freeze({
        TERRAIN: 0,
        WATER:   1,
        OBJECT:  2,
    }),

    storageKey: 'mykonos-island-voxels.save.v1',

    // Bright Mediterranean palette used by procedurally-generated assets.
    palette: Object.freeze({
        // Whites
        white:        '#fafaf5',
        whiteShadow:  '#e6e2d3',
        whiteDeep:    '#cfc9b7',

        // Cobalt / blues
        cobalt:       '#1b5ba8',
        cobaltLight:  '#2e6fbc',
        cobaltDeep:   '#134680',
        skyBlue:      '#4287d5',

        // Terrain
        grass:        '#7eaa5f',
        grassDark:    '#5c8a44',
        grassLight:   '#9bc377',
        sand:         '#e8d4a8',
        sandDark:     '#c9b084',
        path:         '#c4b49c',
        pathDark:     '#a89878',
        pathLight:    '#d6c8b0',
        sea:          '#6ec8e0',
        seaDeep:      '#4da8c4',
        seaShine:     '#a8e0ee',
        seaWall:      '#ddd3c4',

        // Vegetation
        cypress:      '#3d7355',
        cypressDark:  '#28533a',
        cypressLight: '#5a8d6e',
        olive:        '#7a9460',
        oliveDark:    '#5a7448',
        oliveLight:   '#9bb37e',
        leaf:         '#4a7a3e',
        leafDark:     '#2f5527',
        bougain:      '#d85b8e',
        bougainDark:  '#b03a6a',
        bougainLight: '#ee84ad',
        agave:        '#a4b87a',
        agaveDark:    '#7a8e54',
        dryGrass:     '#cdb874',

        // Wood / earthen
        wood:         '#a07344',
        woodDark:     '#704c27',
        woodLight:    '#bd8e5b',
        terracotta:   '#c4622e',
        terraLight:   '#dc7d44',
        terraDark:    '#9a4720',
        roof:         '#bb6b3f',
        roofDark:     '#8b4825',

        // Stone / metal
        stone:        '#b5b0a2',
        stoneDark:    '#8d8878',
        stoneLight:   '#cdc8b8',
        iron:         '#3a3833',
        ironLight:    '#5a5750',
        gold:         '#e5c065',

        // Misc
        flower:       '#e16ea6',
        flowerYellow: '#f4d168',
        flowerWhite:  '#fff8e6',
        soil:         '#7a5a3c',
        soilDark:     '#5a3f25',
        crop:         '#9bc377',
        cropDark:     '#6b8e3e',
        glass:        '#eef4f7',
        flame:        '#ffc24a',
    }),
});
