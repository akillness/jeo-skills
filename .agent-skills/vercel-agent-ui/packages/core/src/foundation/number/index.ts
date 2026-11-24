// What the rest of core may import from number's files. import-layers checks every
// import from another folder against this list. Nothing imports this file, so bundles
// don't pay for it.
export {
  displayOptions,
  formatNumber,
  formatNumberRange,
  formatNumberToParts,
  type NumberFormat,
  numberFormatter,
} from "./format"
export { type NumberKeyOptions, stepFromKey } from "./keys"
export { isPartialNumber, parseNumber, parseRange } from "./parse"
export { fractionOf, type NumberScale, valueAt } from "./scale"
export {
  clamp,
  decimalsOf,
  maxOnGrid,
  onGrid,
  type NumberMove,
  type NumberRange,
  type NumberSnap,
  roundTo,
  scrubTo,
  snapToStep,
  type StepRange,
  stepBy,
  stepOnGrid,
  stepValue,
  wrap,
} from "./steps"
