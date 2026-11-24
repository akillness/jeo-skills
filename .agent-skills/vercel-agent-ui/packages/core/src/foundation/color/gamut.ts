import { colorDistance } from "./compare"
import { convertColor, type Color } from "./convert"

/**
 * A range of colors a screen can show: `"srgb"`, which every screen shows, or
 * `"p3"`, the wider range of most phones and laptops.
 * @experimental
 */
type ColorGamut = "srgb" | "p3"

const spaceOf = (gamut: ColorGamut) => (gamut === "p3" ? "display-p3" : "srgb")

// How far past an edge still counts as inside, so a color that round-trips
// through another space doesn't fall out of its gamut.
const tolerance = 0.000075

const justNoticeable = 0.02

const clip = (color: Color) => ({
  ...color,
  coords: color.coords.map((value) =>
    Math.min(1, Math.max(0, value ?? 0))
  ) as Color["coords"],
})

/**
 * Whether a screen with this gamut can show the color.
 * @experimental
 */
function isInGamut(color: Color, gamut: ColorGamut = "srgb") {
  return convertColor(color, spaceOf(gamut)).coords.every(
    (value) => (value ?? 0) >= -tolerance && (value ?? 0) <= 1 + tolerance
  )
}

/**
 * The closest color the gamut holds, in the color's own space. It keeps the
 * lightness and hue and lowers the chroma in OKLCH until the color fits, the
 * way CSS Color 4 maps colors (binary search with local MINDE).
 * @experimental
 */
function toGamut(color: Color, gamut: ColorGamut = "srgb") {
  const mapped: Color = convertColor(mapToGamut(color, gamut), color.space)
  return mapped
}

function mapToGamut(color: Color, gamut: ColorGamut) {
  const space = spaceOf(gamut)
  const origin = convertColor(color, "oklch")
  const [lightness, chroma, hue] = origin.coords
  if ((lightness ?? 0) >= 1) {
    return { space, coords: [1, 1, 1], alpha: color.alpha } satisfies Color
  }
  if ((lightness ?? 0) <= 0) {
    return { space, coords: [0, 0, 0], alpha: color.alpha } satisfies Color
  }
  if (isInGamut(origin, gamut)) {
    return color
  }
  const withChroma = (value: number) =>
    ({ ...origin, coords: [lightness, value, hue] }) satisfies Color
  let clipped = clip(convertColor(origin, space))
  if (colorDistance(clipped, origin) < justNoticeable) {
    return clipped
  }
  let min = 0
  let max = chroma ?? 0
  let minInGamut = true
  while (max - min > 0.0001) {
    const middle = (min + max) / 2
    const current = withChroma(middle)
    if (minInGamut && isInGamut(current, gamut)) {
      min = middle
      continue
    }
    clipped = clip(convertColor(current, space))
    const distance = colorDistance(clipped, current)
    if (distance >= justNoticeable) {
      max = middle
    } else if (justNoticeable - distance < 0.0001) {
      return clipped
    } else {
      minInGamut = false
      min = middle
    }
  }
  return clipped
}

export { isInGamut, toGamut, type ColorGamut }
