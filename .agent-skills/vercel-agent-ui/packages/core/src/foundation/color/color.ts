// `@ui-sdk/core/color`: CSS colors as plain data. Read any CSS color, convert it
// between spaces, write it back as CSS, fit it to a screen's gamut, mix and compare
// two colors, for any color component of your own.
export { colorDistance, contrastRatio } from "./compare"
export { convertColor, type Color, type ColorSpace } from "./convert"
export {
  formatColor,
  type ColorFormat,
  type ColorFormatOptions,
} from "./format"
export { isInGamut, toGamut, type ColorGamut } from "./gamut"
export {
  mixColor,
  type ColorHueInterpolation,
  type ColorMixOptions,
} from "./mix"
export { parseColor } from "./parse"
