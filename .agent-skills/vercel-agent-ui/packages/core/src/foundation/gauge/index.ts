// What the rest of core may import from gauge's files. import-layers checks every
// import from another folder against this list. Nothing imports this file, so bundles
// don't pay for it.
export {
  finite,
  formatGaugeValue,
  gaugeAria,
  type GaugeLabelDetails,
  type GaugeOptions,
  gaugeSettings,
  type GaugeSettings,
  gaugeApi,
  indicatorStyle,
  labelId,
  labelledBy,
  type NumberFormat,
  percentBetween,
  roundPercent,
} from "./gauge"
