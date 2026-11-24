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
 * Whether the task's progress is unknown, under way, or done.
 * @stable
 */
type ProgressStatus = "indeterminate" | "progressing" | "complete"

/**
 * The options `progress` takes. A component takes them as props on its root.
 * @stable
 */
type ProgressOptions = GaugeOptions & {
  /**
   * How far the task has come, between `min` and `max`. Null means it's under
   * way but how far is unknown, and the bar is indeterminate.
   * @defaultValue null
   */
  value?: number | null
} & PrimitiveOptions

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type ProgressState = {
  /** The value, or null while indeterminate. */
  value: number | null
  /** Where the value sits between `min` and `max`, from 0 to 100, or null while indeterminate. */
  percent: number | null
  /** Whether the progress is unknown, under way, or done. */
  status: ProgressStatus
}

/**
 * What the Value part's render functions receive.
 * @stable
 */
type ProgressValueState = ProgressState & {
  /** The formatted value, like "40%". Empty while indeterminate. */
  text: string
}

type State = GaugeSettings & {
  value: number | null
  // How many Label parts are on the page. Any of them names the bar.
  labels: number
  bound: boolean
}

const valueOf = (options: ProgressOptions) =>
  options.value === null || options.value === undefined
    ? null
    : finite(options.value, 0)

function percentOf(state: State) {
  return state.value === null
    ? null
    : percentBetween(state.value, state.min, state.max)
}

// check-code: allow return-type its literals would widen to string in the parts' state.
function statusOf(state: State): ProgressStatus {
  if (state.value === null) {
    return "indeterminate"
  }
  return state.value >= state.max ? "complete" : "progressing"
}

function progressState(state: State) {
  return {
    value: state.value,
    percent: percentOf(state),
    status: statusOf(state),
  }
}

// Every part carries the status, so any of them can style it.
function statusAttrs(state: State) {
  const status = statusOf(state)
  return {
    "data-indeterminate": status === "indeterminate" ? "" : undefined,
    "data-progressing": status === "progressing" ? "" : undefined,
    "data-complete": status === "complete" ? "" : undefined,
  }
}

const settings = (options: ProgressOptions) => ({
  ...gaugeSettings(options),
  value: valueOf(options),
})

const progressPrimitive = /* @__PURE__ */ definePrimitive({
  name: "progress",
  options: {
    min: "number",
    max: "number",
    format: "value",
    locale: "string",
    getValueLabel: "value",
    value: "number",
  },
  state: (options: ProgressOptions): State => ({
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
    root: slot<{}, ProgressState>({
      role: "progressbar",
      state: progressState,
      attrs: (state, { id }) => {
        const percent = percentOf(state)
        return {
          ...gaugeAria(state.value, state),
          "aria-labelledby": labelledBy(state, id),
          ...statusAttrs(state),
          // For anything else that should follow the value, like a gradient stop.
          style:
            percent === null
              ? undefined
              : css({ "--progress-value": `${roundPercent(percent)}%` }),
        }
      },
      bind: (el, { store, id }) => {
        bindPageLocale(el, (pageLocale) => store.set({ pageLocale }))
        // A progress bar's content never names it, so only a label or `aria-label` does.
        if (dev) {
          checkName(el, "Progress", { component: "progress", id })
        }
        return flagWhileBound(store, "bound")
      },
    }),
    track: slot<{}, ProgressState>({
      state: progressState,
      attrs: statusAttrs,
    }),
    // Placed with inline styles, from the track's start, as wide as the value.
    indicator: slot<{}, ProgressState>({
      state: progressState,
      attrs: (state) => ({
        ...statusAttrs(state),
        style: indicatorStyle(percentOf(state)),
      }),
    }),
    label: slot<{}, ProgressState>({
      state: progressState,
      attrs: (state, { id }) => ({ id: labelId(id), ...statusAttrs(state) }),
      bind: (_, { api }) => api.internal.label(),
    }),
    // The bar reads the value through `aria-valuetext`. Chromium still exposes a
    // progressbar's text, so the visible value is hidden to keep it from being read twice.
    value: slot<{}, ProgressValueState>({
      state: (state) => ({
        ...progressState(state),
        text: formatGaugeValue(state.value, state),
      }),
      attrs: (state) => ({ ...statusAttrs(state), "aria-hidden": "true" }),
    }),
  }),
})

/**
 * The type of `progress`.
 * @stable
 */
interface ProgressPrimitive extends Named<typeof progressPrimitive> {}

/**
 * The progress primitive, with the slots `root`, `track`, `indicator`,
 * `label`, `value`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const progress: ProgressPrimitive = progressPrimitive

export {
  progress,
  type ProgressOptions,
  type ProgressPrimitive,
  type ProgressState,
  type ProgressStatus,
  type ProgressValueState,
}
export type {
  GaugeLabelDetails,
  NumberFormat,
} from "../../foundation/gauge/gauge"
