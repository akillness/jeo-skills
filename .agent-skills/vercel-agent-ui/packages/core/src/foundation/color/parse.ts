import type { Color, ColorSpace } from "./convert"
import { namedColors } from "./names"

// What a plain number and 100% mean on a channel, and the range CSS clamps it
// to when it parses.
type Channel =
  { number: number; percent: number; min?: number; max?: number } | "hue"

const rgb: Channel = { number: 1 / 255, percent: 1, min: 0, max: 1 }
const percentage: Channel = { number: 1, percent: 100 }
const unit: Channel = { number: 1, percent: 1 }
const alpha: Channel = { number: 1, percent: 1, min: 0, max: 1 }

const functions: Record<
  string,
  { space: ColorSpace; channels: [Channel, Channel, Channel] }
> = {
  rgb: { space: "srgb", channels: [rgb, rgb, rgb] },
  hsl: {
    space: "hsl",
    channels: ["hue", { number: 1, percent: 100, min: 0 }, percentage],
  },
  hwb: { space: "hwb", channels: ["hue", percentage, percentage] },
  lab: {
    space: "lab",
    channels: [
      { number: 1, percent: 100, min: 0, max: 100 },
      { number: 1, percent: 125 },
      { number: 1, percent: 125 },
    ],
  },
  lch: {
    space: "lch",
    channels: [
      { number: 1, percent: 100, min: 0, max: 100 },
      { number: 1, percent: 150, min: 0 },
      "hue",
    ],
  },
  oklab: {
    space: "oklab",
    channels: [
      { number: 1, percent: 1, min: 0, max: 1 },
      { number: 1, percent: 0.4 },
      { number: 1, percent: 0.4 },
    ],
  },
  oklch: {
    space: "oklch",
    channels: [
      { number: 1, percent: 1, min: 0, max: 1 },
      { number: 1, percent: 0.4, min: 0 },
      "hue",
    ],
  },
}

const predefined: Record<string, ColorSpace> = {
  srgb: "srgb",
  "srgb-linear": "srgb-linear",
  "display-p3": "display-p3",
  xyz: "xyz-d65",
  "xyz-d65": "xyz-d65",
  "xyz-d50": "xyz-d50",
}

const angles: Record<string, number> = {
  "": 1,
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360,
}

const token =
  /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|deg|grad|rad|turn)?$/

// One channel's text as a number, null for `none`, or undefined when the
// channel can't take it, like an angle on a lightness.
function readChannel(text: string, channel: Channel) {
  if (text === "none") {
    return null
  }
  const match = token.exec(text)
  if (!match) {
    return undefined
  }
  const [, digits, suffix = ""] = match
  const value = Number(digits)
  if (channel === "hue") {
    return suffix in angles
      ? (((value * angles[suffix]) % 360) + 360) % 360
      : undefined
  }
  if (suffix && suffix !== "%") {
    return undefined
  }
  const scaled = suffix
    ? (value / 100) * channel.percent
    : value * channel.number
  return Math.min(
    channel.max ?? Infinity,
    Math.max(channel.min ?? -Infinity, scaled)
  )
}

function readChannels(
  texts: string[],
  channels: Channel[],
  alphaText: string | undefined,
  space: ColorSpace
) {
  if (texts.length !== 3) {
    return null
  }
  const coords = texts.map((text, index) => readChannel(text, channels[index]))
  const opacity = alphaText === undefined ? 1 : readChannel(alphaText, alpha)
  if (coords.includes(undefined) || opacity === undefined) {
    return null
  }
  return {
    space,
    coords: coords as Color["coords"],
    alpha: opacity ?? 0,
  } satisfies Color
}

function parseHex(digits: string) {
  const full =
    digits.length < 5
      ? [...digits].map((digit) => digit + digit).join("")
      : digits
  const bytes = full.match(/../g)!.map((pair) => parseInt(pair, 16) / 255)
  return {
    space: "srgb",
    coords: [bytes[0], bytes[1], bytes[2]],
    alpha: bytes[3] ?? 1,
  } satisfies Color
}

function parseFunction(name: string, body: string) {
  if (name === "color") {
    const [channels, alphaText, extra] = body
      .split("/")
      .map((part) => part.trim())
    const [spaceName, ...texts] = channels.split(/\s+/)
    if (extra !== undefined || !Object.hasOwn(predefined, spaceName)) {
      return null
    }
    return readChannels(
      texts,
      [unit, unit, unit],
      alphaText,
      predefined[spaceName]
    )
  }
  const legacyName =
    name === "rgba" || name === "hsla" ? name.slice(0, 3) : name
  if (!Object.hasOwn(functions, legacyName)) {
    return null
  }
  const definition = functions[legacyName]
  if (body.includes(",")) {
    if (definition.space !== "srgb" && definition.space !== "hsl") {
      return null
    }
    const parts = body.split(",").map((part) => part.trim())
    if (parts.length > 4 || parts.includes("none")) {
      return null
    }
    return readChannels(
      parts.slice(0, 3),
      definition.channels,
      parts[3],
      definition.space
    )
  }
  const [channels, alphaText, extra] = body
    .split("/")
    .map((part) => part.trim())
  if (extra !== undefined) {
    return null
  }
  return readChannels(
    channels.split(/\s+/),
    definition.channels,
    alphaText,
    definition.space
  )
}

/**
 * Reads a CSS color: hex, a named color, `transparent`, or `rgb()`, `hsl()`,
 * `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` and `color()` in the
 * `srgb`, `srgb-linear`, `display-p3` and `xyz` spaces. The color keeps the
 * space it was written in. Returns null for anything else.
 * @experimental
 */
function parseColor(text: string) {
  const color: Color | null = readColor(text.trim().toLowerCase())
  return color
}

function readColor(value: string) {
  if (value === "transparent") {
    return { space: "srgb", coords: [0, 0, 0], alpha: 0 } satisfies Color
  }
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(value)
  if (hex) {
    return parseHex(hex[1])
  }
  const call = /^([a-z]+)\((.*)\)$/.exec(value)
  if (call) {
    return parseFunction(call[1], call[2].trim())
  }
  const named = /^[a-z]+$/.test(value) ? namedColors.indexOf(` ${value}:`) : -1
  return named === -1
    ? null
    : parseHex(
        namedColors.slice(named + value.length + 2, named + value.length + 8)
      )
}

export { parseColor }
