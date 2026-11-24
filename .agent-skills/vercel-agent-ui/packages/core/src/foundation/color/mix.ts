import { convertColor, type Color, type ColorSpace } from "./convert"

/**
 * Which way a mix goes around the hue wheel, as in CSS `color-mix()`:
 * `"shorter"`, `"longer"`, `"increasing"` or `"decreasing"`.
 * @experimental
 */
type ColorHueInterpolation = "shorter" | "longer" | "increasing" | "decreasing"

/**
 * Options for `mixColor`.
 * @experimental
 */
type ColorMixOptions = {
  /**
   * The space the colors mix in, which the result is in too.
   * @defaultValue "oklab"
   */
  space?: ColorSpace
  /**
   * Which way the hue goes, in a space with one.
   * @defaultValue "shorter"
   */
  hue?: ColorHueInterpolation
}

const hueIndex: Partial<Record<ColorSpace, number>> = {
  hsl: 0,
  hsv: 0,
  hwb: 0,
  lch: 2,
  oklch: 2,
}

const normalize = (hue: number) => ((hue % 360) + 360) % 360

// CSS Color 4 adjusts the two hues before interpolating, by the method's rule.
function fixHues(first: number, second: number, method: ColorHueInterpolation) {
  const delta = second - first
  if (method === "shorter") {
    if (delta > 180) {
      first += 360
    } else if (delta < -180) {
      second += 360
    }
  } else if (method === "longer") {
    if (delta > 0 && delta < 180) {
      first += 360
    } else if (delta > -180 && delta <= 0) {
      second += 360
    }
  } else if (method === "increasing") {
    if (delta < 0) {
      second += 360
    }
  } else if (delta > 0) {
    first += 360
  }
  return [first, second]
}

/**
 * Mixes two colors like CSS `color-mix()`: `amount` of the second, from 0 to
 * 1, in Oklab by default. Channels mix premultiplied by alpha, and a channel
 * missing from one color takes the other's.
 * @experimental
 */
function mixColor(
  first: Color,
  second: Color,
  amount = 0.5,
  options: ColorMixOptions = {}
) {
  const space = options.space ?? "oklab"
  const hue = hueIndex[space]
  const weight = Math.min(1, Math.max(0, amount))
  const [a, b] = [first, second].map((color) => convertColor(color, space))
  const alpha = a.alpha + (b.alpha - a.alpha) * weight
  const coords = a.coords.map((own, index) => {
    const other = b.coords[index]
    if (own === null && other === null) {
      return null
    }
    const [from, to] = [own ?? other!, other ?? own!]
    if (index === hue) {
      const [start, end] = fixHues(
        normalize(from),
        normalize(to),
        options.hue ?? "shorter"
      )
      return normalize(start + (end - start) * weight)
    }
    const mixed = from * a.alpha + (to * b.alpha - from * a.alpha) * weight
    return alpha === 0 ? from + (to - from) * weight : mixed / alpha
  }) as Color["coords"]
  const mixed: Color = { space, coords, alpha }
  return mixed
}

export { mixColor, type ColorHueInterpolation, type ColorMixOptions }
