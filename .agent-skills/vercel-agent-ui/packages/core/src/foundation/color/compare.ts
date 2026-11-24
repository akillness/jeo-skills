import { convertColor, type Color } from "./convert"

/**
 * How different two colors look, as ΔEOK: the distance between them in
 * Oklab. About 0.02 is the smallest difference most people notice. Alpha
 * doesn't count.
 * @experimental
 */
function colorDistance(first: Color, second: Color) {
  const [l1, a1, b1] = convertColor(first, "oklab").coords
  const [l2, a2, b2] = convertColor(second, "oklab").coords
  return Math.hypot(
    (l1 ?? 0) - (l2 ?? 0),
    (a1 ?? 0) - (a2 ?? 0),
    (b1 ?? 0) - (b2 ?? 0)
  )
}

const luminance = (color: Color) =>
  Math.max(0, convertColor(color, "xyz-d65").coords[1] ?? 0)

/**
 * The WCAG 2 contrast ratio between two colors, from 1 to 21, whichever is
 * lighter. Text needs 4.5 against its background, or 3 when it's large.
 * Alpha doesn't count, so blend a translucent color over its background first.
 * @experimental
 */
function contrastRatio(first: Color, second: Color) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a
  )
  return (lighter + 0.05) / (darker + 0.05)
}

export { colorDistance, contrastRatio }
