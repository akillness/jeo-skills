// `@ui-sdk/core/number`: steps, scales, formatting and reading numbers through
// `Intl`, and one keyboard map. Slider, Number Input, Progress and Meter are
// built on it, and so can any numeric component of your own.
export {
  formatNumber,
  formatNumberRange,
  formatNumberToParts,
  type NumberFormat,
  numberFormatter,
} from "./format"
export { type NumberKeyOptions, stepFromKey } from "./keys"
export { isPartialNumber, parseNumber } from "./parse"
export { fractionOf, type NumberScale, valueAt } from "./scale"
export {
  clamp,
  decimalsOf,
  maxOnGrid,
  type NumberMove,
  type NumberRange,
  type NumberScrub,
  type NumberSnap,
  roundTo,
  scrubTo,
  type StepRange,
  stepBy,
  stepValue,
  wrap,
} from "./steps"
