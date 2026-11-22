// kit-families.js - the palette-hex to surface-family maps each blueprint record declares under
// tiers.T2.families, copied verbatim from the catalog (scripts/resolve.py <blueprint-id>).
// buildKit(create, { tier: 'T2', surface: { families: FAMILIES.<id>, ... } }) needs them: an
// unmapped colour keeps its flat material, so T2 degrades visibly rather than silently.
export const FAMILIES = {
  'timber-cottage': { '#e5dccb': 'plaster', '#6b4f34': 'wood', '#8d5a4a': 'roof-tile',
    '#9c6a55': 'stone', '#b3aa9c': 'stone', '#a07a52': 'wood' },
  'long-hall': { '#6a5036': 'wood', '#7d6141': 'wood', '#a07a52': 'wood', '#5e472f': 'wood',
    '#533e29': 'wood', '#745a3c': 'wood', '#73593b': 'wood', '#785d3e': 'wood', '#765b3d': 'wood',
    '#775d3e': 'wood', '#795e3f': 'wood', '#aaa19b': 'wood', '#ada59f': 'wood', '#b0a698': 'stone',
    '#96654f': 'stone', '#7a7369': 'stone', '#625c54': 'stone', '#beb6ac': 'stone',
    '#cac4bd': 'stone', '#ccc6bf': 'stone', '#8b5d48': 'stone', '#93634d': 'stone',
    '#7d5348': 'roof-tile', '#624038': 'roof-tile', '#724b41': 'roof-tile', '#e2d8c4': 'plaster',
    '#2b2b30': 'metal', '#a3a3a4': 'metal' },
  watermill: { '#9a938a': 'stone', '#ddd2bd': 'plaster', '#54402c': 'wood', '#6f5145': 'roof-tile',
    '#33322f': 'metal' },
  'round-tower': { '#a49b8e': 'stone', '#6a6357': 'stone', '#7c766c': 'stone', '#877f74': 'stone',
    '#726b62': 'stone', '#c1bcb5': 'stone', '#b5aea4': 'stone', '#bbb5ad': 'stone',
    '#5b554e': 'stone', '#bdb7af': 'stone', '#54402c': 'wood', '#513d2a': 'wood',
    '#503d2a': 'wood', '#4e3c29': 'wood', '#4d3b28': 'wood', '#4f545a': 'roof-tile',
    '#8c3f45': 'fabric', '#33322f': 'metal', '#2b2b30': 'metal', '#a3a3a4': 'metal',
    '#2d2826': 'metal' },
  'market-stall': { '#8a6a45': 'wood', '#5d4630': 'wood', '#7d6242': 'wood', '#715637': 'wood',
    '#483624': 'wood', '#957a60': 'wood', '#9e8873': 'wood', '#a9a29e': 'wood',
    '#d9d2c2': 'fabric', '#a8443f': 'fabric', '#9c8455': 'fabric', '#c9bb98': 'fabric',
    '#ab9f81': 'fabric', '#2b2b30': 'metal' },
  'stone-bridge': { '#a79c8c': 'stone', '#7e7466': 'stone', '#8f887c': 'stone', '#8e8577': 'stone',
    '#afa698': 'stone', '#9c9283': 'stone', '#958b7d': 'stone', '#9f9585': 'stone',
    '#b9b1a6': 'stone', '#7d7569': 'stone', '#bdb6ab': 'stone', '#938a7b': 'stone',
    '#b7b3ac': 'stone', '#b2a99d': 'stone' },
  'lantern-post': { '#5f636d': 'metal', '#b6bcc4': 'metal', '#8d9099': 'metal', '#a49d90': 'stone' },
  well: { '#6d5335': 'wood', '#8a6a45': 'wood', '#7a5a49': 'roof-tile', '#34343a': 'metal',
    '#c2ab7e': 'fabric', '#9d968a': 'stone', '#b0a999': 'stone' },
  cart: { '#a57f52': 'wood', '#6f5334': 'wood', '#5d4529': 'wood', '#33333a': 'metal',
    '#c6bfb2': 'metal' },
  barrel: { '#a8794a': 'wood', '#b78e5e': 'wood', '#8d6a44': 'wood', '#3a3a40': 'metal',
    '#cfc9bd': 'metal' },
  crate: { '#b08a5c': 'wood', '#8a6a45': 'wood', '#7d6140': 'wood', '#3a2c1e': 'wood',
    '#cfc9bd': 'metal' },
  signboard: { '#6b533a': 'wood', '#8d5f3a': 'wood', '#4c4e56': 'metal', '#a9a49a': 'metal',
    '#c2a15f': 'metal', '#7d7a72': 'metal', '#efe3c8': 'plaster', '#928b7e': 'stone' },
  clothesline: { '#7a6142': 'wood', '#a8834f': 'wood', '#cbb98d': 'fabric', '#d9cdb4': 'fabric',
    '#a89c86': 'fabric', '#d3c3b1': 'fabric' },
  'fence-run': { '#8b6f4a': 'wood', '#ab8b60': 'wood', '#d8d2c6': 'metal' }
};

/** One T2 surface block. Size 512 everywhere but the objects a viewer walks up to. */
export function surfaceFor(key, seed, { size = 512, samples = 16 } = {}) {
  return { families: FAMILIES[key], seed, size, anisotropy: 4,
           ao: { samples, radius_m: 0.45, ground_dirt_m: 0.6 } };
}
