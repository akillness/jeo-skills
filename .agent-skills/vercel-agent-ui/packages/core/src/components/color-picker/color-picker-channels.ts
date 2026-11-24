// The channels a color picker edits in each space, their ranges in the units
// people read them in, and the CSS gradients that draw them.
import { convertColor, type Color } from "../../foundation/color/convert"
import { formatColor } from "../../foundation/color/format"
import {
  isInGamut,
  toGamut,
  type ColorGamut,
} from "../../foundation/color/gamut"
import { parseColor } from "../../foundation/color/parse"

/**
 * The spaces a color picker edits in: HSV (also called HSB), HSL, sRGB's red,
 * green and blue, and OKLCH.
 * @experimental
 */
type ColorPickerSpace = "hsv" | "hsl" | "srgb" | "oklch"

/**
 * A channel a color picker part edits. Which ones there are depends on the
 * space: `"brightness"` is HSV's, `"chroma"` OKLCH's, `"lightness"` HSL's or
 * OKLCH's. `"alpha"` is in every space.
 * @experimental
 */
type ColorChannel =
  | "hue"
  | "saturation"
  | "brightness"
  | "lightness"
  | "chroma"
  | "red"
  | "green"
  | "blue"
  | "alpha"

// `scale` turns a coordinate into what people read: 0 to 255 for red, a
// percentage for OKLCH's lightness.
type ChannelSpec = {
  index: number
  max: number
  step: number
  scale: number
  unit: "°" | "%" | ""
}

const hue: ChannelSpec = { index: 0, max: 360, step: 1, scale: 1, unit: "°" }
const percent = (index: number) =>
  ({ index, max: 100, step: 1, scale: 1, unit: "%" }) satisfies ChannelSpec
const byte = (index: number) =>
  ({ index, max: 255, step: 1, scale: 255, unit: "" }) satisfies ChannelSpec
const alpha: ChannelSpec = {
  index: 3,
  max: 100,
  step: 1,
  scale: 100,
  unit: "%",
}

const channels: Record<
  ColorPickerSpace,
  Partial<Record<ColorChannel, ChannelSpec>>
> = {
  hsv: { hue, saturation: percent(1), brightness: percent(2), alpha },
  hsl: { hue, saturation: percent(1), lightness: percent(2), alpha },
  srgb: { red: byte(0), green: byte(1), blue: byte(2), alpha },
  oklch: {
    lightness: { index: 0, max: 100, step: 0.1, scale: 100, unit: "%" },
    chroma: { index: 1, max: 0.4, step: 0.001, scale: 1, unit: "" },
    hue: { ...hue, index: 2 },
    alpha,
  },
}

const labels: Record<ColorChannel, string> = {
  hue: "Hue",
  saturation: "Saturation",
  brightness: "Brightness",
  lightness: "Lightness",
  chroma: "Chroma",
  red: "Red",
  green: "Green",
  blue: "Blue",
  alpha: "Alpha",
}

// The area's axes and the slider's channel when a part names none.
const defaultAxes: Record<
  ColorPickerSpace,
  { x: ColorChannel; y: ColorChannel; slider: ColorChannel }
> = {
  hsv: { x: "saturation", y: "brightness", slider: "hue" },
  hsl: { x: "saturation", y: "lightness", slider: "hue" },
  srgb: { x: "red", y: "green", slider: "blue" },
  oklch: { x: "chroma", y: "lightness", slider: "hue" },
}

const spaces = Object.keys(channels) as ColorPickerSpace[]

const spaceOf = (space: string | undefined) =>
  spaces.find((name) => name === space) ?? "hsv"

// A channel the space doesn't have reads as its slider's, so a typo never throws.
function channelOf(space: ColorPickerSpace, channel: ColorChannel | undefined) {
  const name =
    channel && channels[space][channel] ? channel : defaultAxes[space].slider
  return { name, label: labels[name], ...channels[space][name]! }
}

type Channel = ReturnType<typeof channelOf>

const black = (space: ColorPickerSpace) =>
  convertColor({ space: "srgb", coords: [0, 0, 0], alpha: 1 }, space)

// Spaces other than OKLCH hold only sRGB colors, so a wider one fits sRGB first.
const inSpace = (color: Color, space: ColorPickerSpace) =>
  convertColor(space === "oklch" ? color : toGamut(color, "srgb"), space)

function colorIn(text: string, space: ColorPickerSpace) {
  const parsed = parseColor(text)
  return parsed && inSpace(parsed, space)
}

function readChannel(color: Color, spec: ChannelSpec) {
  const coord = spec.index === 3 ? color.alpha : color.coords[spec.index]
  return Number(((coord ?? 0) * spec.scale).toFixed(4))
}

function withChannel(color: Color, spec: ChannelSpec, value: number) {
  const coord = Math.min(spec.max, Math.max(0, value)) / spec.scale
  if (spec.index === 3) {
    return { ...color, alpha: coord }
  }
  const coords = [...color.coords] as Color["coords"]
  coords[spec.index] = coord
  return { ...color, coords }
}

function channelText(value: number, spec: ChannelSpec) {
  const rounded = Number(
    value.toFixed(spec.step < 1 ? String(spec.step).length - 2 : 0)
  )
  return spec.unit === "°" ? `${rounded}°` : `${rounded}${spec.unit}`
}

// What the picker shows on screen: the color fit into the gamut, or into sRGB
// for a format that can't write more.
function shown(color: Color, gamut: ColorGamut | false) {
  return gamut && !isInGamut(color, gamut) ? toGamut(color, gamut) : color
}

const cssOf = (color: Color) =>
  formatColor(
    color,
    color.space === "hsv"
      ? "hsl"
      : color.space === "oklch"
        ? "oklch"
        : color.space
  )

// A track's background: the color as the channel runs from its start to its
// end, the rest held. Hues take more stops, so the gradient follows the wheel.
function channelGradient(color: Color, spec: ChannelSpec, direction: string) {
  const count = spec.unit === "°" ? 13 : spec.index === 3 ? 2 : 5
  const stops = Array.from({ length: count }, (_, at) => {
    const stop = withChannel(color, spec, (spec.max * at) / (count - 1))
    return cssOf(spec.index === 3 ? stop : { ...stop, alpha: 1 })
  })
  return `linear-gradient(${direction}, ${stops.join(", ")})`
}

// The area's background, where two gradients draw it exactly: saturation by
// brightness in HSV, and saturation by lightness in HSL. Others use the canvas.
function areaGradient(
  color: Color,
  x: ColorChannel,
  y: ColorChannel,
  rtl: boolean
) {
  const space = color.space
  const flat = space === "hsv" || space === "hsl"
  if (
    !flat ||
    x !== "saturation" ||
    (y !== "brightness" && y !== "lightness")
  ) {
    return undefined
  }
  const hueOf = Math.round((color.coords[0] ?? 0) * 100) / 100
  const across = rtl ? "to left" : "to right"
  if (space === "hsv") {
    return `linear-gradient(to top, #000, transparent), linear-gradient(${across}, #fff, hsl(${hueOf} 100% 50%))`
  }
  return `linear-gradient(to top, #000, transparent, #fff), linear-gradient(${across}, hsl(${hueOf} 0% 50%), hsl(${hueOf} 100% 50%))`
}

const hueNames: [number, string][] = [
  [20, "pink"],
  [45, "red"],
  [70, "orange"],
  [110, "yellow"],
  [135, "lime"],
  [170, "green"],
  [215, "cyan"],
  [270, "blue"],
  [320, "purple"],
  [350, "magenta"],
  [360, "pink"],
]

// A name screen readers say for a color, like "dark vivid blue", in English.
function describeColor(color: Color) {
  if (color.alpha === 0) {
    return "transparent"
  }
  const [lightness = 0, chroma = 0, angle = 0] = convertColor(
    color,
    "oklch"
  ).coords.map((n) => n ?? 0)
  const opacity =
    color.alpha < 1 ? `, ${Math.round(color.alpha * 100)}% opaque` : ""
  if (chroma < 0.02) {
    const gray =
      lightness < 0.15 ? "black" : lightness > 0.97 ? "white" : undefined
    if (gray) {
      return gray + opacity
    }
  }
  const tone = lightness < 0.45 ? "dark " : lightness > 0.82 ? "light " : ""
  const strength =
    chroma < 0.02
      ? ""
      : chroma < 0.08
        ? "grayish "
        : chroma > 0.2
          ? "vivid "
          : ""
  const name =
    chroma < 0.02 ? "gray" : hueNames.find(([end]) => angle % 360 < end)![1]
  return `${tone}${strength}${name}${opacity}`
}

export {
  areaGradient,
  black,
  type Channel,
  channelGradient,
  channelOf,
  channelText,
  colorIn,
  type ColorChannel,
  type ColorPickerSpace,
  cssOf,
  defaultAxes,
  describeColor,
  inSpace,
  readChannel,
  shown,
  spaceOf,
  withChannel,
}
