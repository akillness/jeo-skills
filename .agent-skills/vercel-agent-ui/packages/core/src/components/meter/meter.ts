import {
  finite,
  gaugeAria,
  gaugeApi,
  gaugeSettings,
  formatGaugeValue,
  indicatorStyle,
  labelId,
  labelledBy,
  percentBetween,
  roundPercent,
  type GaugeLabelDetails,
  type GaugeOptions,
  type GaugeSettings,
} from "../../foundation/gauge/gauge"
import { dev } from "#dev"
import { checkName } from "#name-check"
import { flagWhileBound } from "../../foundation/kernel/bound-keys"
import { css } from "../../foundation/kernel/inline-style"
import { bindPageLocale } from "../../foundation/text/locale"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

/**
 * What `getValueLabel` receives after the value.
 * @stable
 */
type MeterLabelDetails = GaugeLabelDetails<number>

/**
 * The options `meter` takes. A component takes them as props on its root.
 * @stable
 */
type MeterOptions = GaugeOptions<number> & {
  /**
   * The reading, between `min` and `max`. Outside them, the fill, the percentage
   * and `aria-valuenow` are clamped, while the state keeps the value as given. A
   * meter always has a value, since there's no busy state.
   */
  value: number
} & PrimitiveOptions

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type MeterState = {
  /** The value, as given. */
  value: number
  /** Where the value sits between `min` and `max`, from 0 to 100. */
  percent: number
}

/**
 * What the Value part's render functions receive.
 * @stable
 */
type MeterValueState = MeterState & {
  /** The formatted value, like "40%". */
  text: string
}

type State = GaugeSettings & {
  value: number
  // How many Label parts are on the page. Any of them names the meter.
  labels: number
  bound: boolean
}

const percentOf = (state: State) =>
  percentBetween(state.value, state.min, state.max)

function meterState(state: State) {
  return { value: state.value, percent: percentOf(state) }
}

// The value is never null, so `getValueLabel` never receives null, and the
// settings Progress shares take the meter's narrower function as their own.
// A missing or non-finite value reads as the minimum: an empty meter.
function settings(options: MeterOptions) {
  const shared = gaugeSettings(options as GaugeOptions)
  return { ...shared, value: finite(options.value, shared.min) }
}

const meterPrimitive = /* @__PURE__ */ definePrimitive({
  name: "meter",
  options: {
    min: "number",
    max: "number",
    format: "value",
    locale: "string",
    getValueLabel: "value",
    value: "number",
  },
  state: (options: MeterOptions): State => ({
    ...settings(options),
    labels: 0,
    bound: false,
    pageLocale: null,
  }),
  sync: settings,
  // `value` is a reading, not state a user changes, so it has no `onValueChange`.
  controlled: [],
  api: ({ store }) => gaugeApi(store),
  slots: (slot) => ({
    root: slot<{}, MeterState>({
      role: "meter",
      state: meterState,
      attrs: (state, { id }) => ({
        ...gaugeAria(state.value, state),
        "aria-labelledby": labelledBy(state, id),
        // For anything else that should follow the value, like a ring's sweep.
        style: css({ "--meter-value": `${roundPercent(percentOf(state))}%` }),
      }),
      bind: (el, { store, id }) => {
        bindPageLocale(el, (pageLocale) => store.set({ pageLocale }))
        // A meter's content never names it, so only a label or `aria-label` does.
        if (dev) {
          checkName(el, "Meter", { component: "meter", id })
        }
        return flagWhileBound(store, "bound")
      },
    }),
    track: slot<{}, MeterState>({ state: meterState }),
    // Placed with inline styles, from the track's start, as wide as the value.
    indicator: slot<{}, MeterState>({
      state: meterState,
      attrs: (state) => ({ style: indicatorStyle(percentOf(state)) }),
    }),
    label: slot<{}, MeterState>({
      state: meterState,
      attrs: (_, { id }) => ({ id: labelId(id) }),
      bind: (_, { api }) => api.internal.label(),
    }),
    // The meter reads the value through `aria-valuetext`. Chromium still exposes a
    // meter's text, so the visible value is hidden to keep it from being read twice.
    value: slot<{}, MeterValueState>({
      state: (state) => ({
        ...meterState(state),
        text: formatGaugeValue(state.value, state),
      }),
      attrs: () => ({ "aria-hidden": "true" }),
    }),
  }),
})

/**
 * The type of `meter`.
 * @stable
 */
interface MeterPrimitive extends Named<typeof meterPrimitive> {}

/**
 * The meter primitive, with the slots `root`, `track`, `indicator`, `label`,
 * `value`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const meter: MeterPrimitive = meterPrimitive

export {
  meter,
  type MeterLabelDetails,
  type MeterOptions,
  type MeterPrimitive,
  type MeterState,
  type MeterValueState,
}
export type { NumberFormat } from "../../foundation/gauge/gauge"
