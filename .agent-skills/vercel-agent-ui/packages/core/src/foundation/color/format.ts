import { convertColor, type Color, type ColorSpace } from "./convert"

/**
 * What `formatColor` writes: `"hex"`, or a space in its CSS syntax. `"srgb"`
 * writes `rgb()`, and the spaces without a function of their own write `color()`.
 * @experimental
 */
type ColorFormat = Exclude<ColorSpace, "hsv"> | "hex"

/**
 * Options for `formatColor`.
 * @experimental
 */
type ColorFormatOptions = {
  /**
   * Significant digits per channel, counted against the channel's range: 5
   * writes `rgb(212.41 0 52.94)` and `oklch(0.6276 0.2577 29.23)`.
   * @defaultValue 5
   */
  precision?: number
}

type Syntax = {
  name: string
  scale: number
  ranges: [number, number, number]
  percent?: boolean
}

const syntaxes: Record<Exclude<ColorFormat, "hex">, Syntax> = {
  srgb: { name: "rgb", scale: 255, ranges: [255, 255, 255] },
  hsl: { name: "hsl", scale: 1, ranges: [360, 100, 100], percent: true },
  hwb: { name: "hwb", scale: 1, ranges: [360, 100, 100], percent: true },
  lab: { name: "lab", scale: 1, ranges: [100, 125, 125] },
  lch: { name: "lch", scale: 1, ranges: [100, 150, 360] },
  oklab: { name: "oklab", scale: 1, ranges: [1, 0.4, 0.4] },
  oklch: { name: "oklch", scale: 1, ranges: [1, 0.4, 360] },
  "srgb-linear": { name: "color(srgb-linear", scale: 1, ranges: [1, 1, 1] },
  "display-p3": { name: "color(display-p3", scale: 1, ranges: [1, 1, 1] },
  "xyz-d65": { name: "color(xyz-d65", scale: 1, ranges: [1, 1, 1] },
  "xyz-d50": { name: "color(xyz-d50", scale: 1, ranges: [1, 1, 1] },
}

// The formats CSS clamps to sRGB, where a color from a wider space is clipped.
const srgbBound = new Set<ColorFormat>(["hex", "srgb", "hsl", "hwb"])

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))

function writeNumber(value: number, range: number, precision: number) {
  const digits = range < 1 ? 1 : Math.floor(Math.log10(range)) + 1
  const text = value.toFixed(Math.max(0, precision - digits))
  const trimmed = text.includes(".") ? text.replace(/\.?0+$/, "") : text
  return trimmed === "-0" ? "0" : trimmed
}

const clampChannel = (value: number | null, max: number) =>
  value === null ? null : clamp(value, max)

// The color in the format's space, clipped to the range that format can hold.
// A hue that only went missing in the conversion writes 0, as browsers do.
function fit(color: Color, format: ColorFormat) {
  const space = format === "hex" ? "srgb" : format
  const bound = srgbBound.has(format)
  if (color.space === space) {
    if (!bound) {
      return color
    }
    const [first, second, third] = color.coords
    const max = space === "srgb" ? 1 : 100
    const coords: Color["coords"] = [
      space === "srgb" ? clampChannel(first, 1) : first,
      clampChannel(second, max),
      clampChannel(third, max),
    ]
    return { ...color, coords }
  }
  let source = color
  if (bound) {
    const srgb = convertColor(color, "srgb")
    source = {
      ...srgb,
      coords: srgb.coords.map((value) =>
        clamp(value ?? 0, 1)
      ) as Color["coords"],
    }
  }
  const converted = convertColor(source, space)
  return {
    ...converted,
    coords: converted.coords.map((value) => value ?? 0) as Color["coords"],
  }
}

function writeHex({ coords, alpha }: Color) {
  const bytes = [
    ...coords.map((value) => value ?? 0),
    ...(alpha < 1 ? [alpha] : []),
  ]
  return `#${bytes
    .map((value) =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

/**
 * Writes a color as CSS: in `format`, or in its own space by default (HSV
 * writes `hsl()`). `hex`, `rgb()`, `hsl()` and `hwb()` hold only sRGB colors,
 * so a wider color is clipped to fit: map it with `toGamut` first to keep its
 * lightness and hue. A missing channel writes `none`.
 * @experimental
 */
function formatColor(
  color: Color,
  format?: ColorFormat,
  options: ColorFormatOptions = {}
) {
  const target = format ?? (color.space === "hsv" ? "hsl" : color.space)
  const { precision = 5 } = options
  const fitted = fit(color, target)
  if (target === "hex") {
    return writeHex(fitted)
  }
  const { name, scale, ranges, percent } = syntaxes[target]
  const channels = fitted.coords.map((value, index) => {
    if (value === null) {
      return "none"
    }
    const text = writeNumber(value * scale, ranges[index], precision)
    return percent && index > 0 ? `${text}%` : text
  })
  const alpha =
    fitted.alpha < 1 ? ` / ${writeNumber(fitted.alpha, 1, precision)}` : ""
  return `${name}${name.startsWith("color(") ? " " : "("}${channels.join(" ")}${alpha})`
}

export { formatColor, type ColorFormat, type ColorFormatOptions }
