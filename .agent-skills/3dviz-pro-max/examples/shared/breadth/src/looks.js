// looks.js - three `defaults.values` blocks pasted from the catalog, not invented. Reproduce with
//   cd skills/3dviz-pro-max
//   python3 scripts/resolve.py knowledge.style-technical-illustration \
//     knowledge.style-scientific-encoding knowledge.style-stylized-realism \
//     knowledge.lighting-mood-dark-studio-product
// Departures are listed in ../design-system.md. A view applies one whole block: half a look reads
// as a mistake, so nothing here is mixed with anything else at runtime.

export const LOOKS = {
  // knowledge.style-technical-illustration: unlit flat fills on a white page, Neutral tone
  // mapping at exposure 1.0, no fog, no bloom, two saturated hues only.
  illustration: {
    records: ['knowledge.style-technical-illustration'],
    lit: false,
    background: { model: 'solid', zenith: '#ffffff', horizon: '#ffffff' },
    fog: null,
    toneMapping: { mode: 'Neutral', exposure: 1.0 },
    camera: { fovDeg: 24 },
    palette: {
      page: '#ffffff', secondary: '#d7dde3', line: '#3a4650', focus: '#2f7dd1', callout: '#e2622f'
    }
  },
  // knowledge.style-stylized-realism (materials, camera) under
  // knowledge.lighting-mood-dark-studio-product (three RectAreaLight panels, gradient set,
  // ACESFilmic at exposure 1.0, environment 0.15).
  studio: {
    records: ['knowledge.style-stylized-realism', 'knowledge.lighting-mood-dark-studio-product'],
    lit: true,
    background: { model: 'gradient', zenith: '#0d0f12', horizon: '#1c2026' },
    fog: null,
    toneMapping: { mode: 'ACESFilmic', exposure: 1.0 },
    camera: { fovDeg: 38 },
    environmentIntensity: 0.15,
    palette: { steel: '#b9c0c8', brass: '#c9a227', plate: '#191d22', shaft: '#8f959c' },
    materials: { metalRoughness: 0.35, plateRoughness: 0.85 }
  },
  // knowledge.style-scientific-encoding: unlit, Neutral at exposure 1.0, fixed neutral
  // background outside the ramp, five monotonic-luminance ramp stops owning the colour channel.
  encoding: {
    records: ['knowledge.style-scientific-encoding'],
    lit: false,
    background: { model: 'solid', zenith: '#16181c', horizon: '#16181c' },
    fog: null,
    toneMapping: { mode: 'Neutral', exposure: 1.0 },
    camera: { fovDeg: 30 },
    ramp: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
    palette: { neutral: '#16181c', outline: '#0b0c0e', halo: '#ffffff', label: '#e8ebef' }
  }
};
