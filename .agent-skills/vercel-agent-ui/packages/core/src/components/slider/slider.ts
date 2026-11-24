import { bindValueInput, bindInternals } from "../../foundation/forms/form"
import { css } from "../../foundation/kernel/inline-style"
import { bindPageLocale } from "../../foundation/text/locale"
import { type NumberFormat } from "../../foundation/number/format"
import { parseRange } from "../../foundation/number/parse"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
  CommitDetails,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PrimitiveOptions,
  WithGeneric,
} from "../../foundation/kernel/primitive-types"
import {
  isDisabled,
  normalized,
  rangeOf,
  settings,
  sliderApi,
  submitted,
  formatValue,
  thumbValuesOf,
  valuesOf,
  type State,
} from "./slider-api"
import type { SliderGeneric } from "./slider-generic"
import { boundsBetween, percentOf } from "./slider-values"
import { selects } from "../../foundation/kernel/selects"
import { subscribe } from "../../foundation/kernel/part"

/**
 * Why a slider's value wants to change.
 * @stable
 */
type SliderValueChangeReason =
  | "track-press"
  | "drag"
  | "step-key"
  | "accessibility-adjust"
  | "reset"
  | "restore"
  | "imperative"

/**
 * What `onValueChange` receives after the value.
 * @stable
 */
type SliderValueChangeDetails = ChangeDetails<SliderValueChangeReason> & {
  /** The thumb that moved, or null when the whole value changed, like on a form reset. */
  thumb: number | null
}

/**
 * What `onValueCommit` receives after the value.
 * @stable
 */
type SliderValueCommitDetails = CommitDetails<SliderValueChangeReason> & {
  /** The thumb that moved. */
  thumb: number | null
}

/**
 * Options for every write method on a controller.
 * @stable
 */
type SliderChangeOptions = ChangeOptions<SliderValueChangeReason>

/**
 * Moves and inspects a slider from outside it. Pass it as the `controller` option.
 * @stable
 */
function createSliderController<
  Value extends number | number[] = number | number[],
>() {
  return createController<{
    /** The value: a number, or one number per thumb. */
    getValue: () => Value
    // A method, so a controller typed for one shape, like `number[]`, fits any slider's options.
    /** Sets the value, as a user would. It's clamped, snapped to the step and sorted. */
    setValue(value: Value, options?: SliderChangeOptions): boolean
    /** Moves focus to a thumb, the first by default. */
    focus: (thumb?: number) => void
  }>()
}

/**
 * A controller from `createSliderController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type SliderController<Value extends number | number[] = number | number[]> =
  ReturnType<typeof createSliderController<Value>>

/**
 * The options `slider` takes. A component takes them as props on its root.
 * @stable
 */
type SliderOptions<Value extends number | number[] = number | number[]> = {
  /** The value: a number for one thumb, or an array with one number per thumb, like `[20, 80]` for a range. Pass it to control the slider. */
  value?: Value
  /**
   * The value at first, when uncontrolled. A form reset returns to it.
   * @defaultValue min
   */
  defaultValue?: Value
  /** Runs while the value changes: on every step of a drag or a key. `details.thumb` says which thumb moved, and `details.cancel()` stops it. */
  onValueChange?: (value: Value, details: SliderValueChangeDetails) => void
  /** Runs once an interaction that changed the value ends: the pointer lifts, the key comes up, or a screen reader adjusts it. For saving. */
  onValueCommit?: (value: Value, details: SliderValueCommitDetails) => void
  /**
   * The lowest value.
   * @defaultValue 0
   */
  min?: number
  /**
   * The highest value. When the steps from `min` don't land on it, the highest step below it is the end.
   * @defaultValue 100
   */
  max?: number
  /**
   * How far one step moves, from `min`.
   * @defaultValue 1
   */
  step?: number
  /**
   * How far Page Up, Page Down and Shift with an arrow key move.
   * @defaultValue 10 steps
   */
  largeStep?: number
  /**
   * How many steps apart neighbouring thumbs stay. Thumbs never pass each other.
   * @defaultValue 0
   */
  minStepsBetweenThumbs?: number
  /**
   * The slider's axis. Vertical sliders grow upward.
   * @defaultValue "horizontal"
   */
  orientation?: "horizontal" | "vertical"
  /** Disables it like a native control: thumbs can't be focused or moved, and nothing is submitted. */
  disabled?: boolean
  /** Keeps it focusable and submitted, but stops drags, keys and screen reader adjustments from changing it. */
  readOnly?: boolean
  /** Marks it required, with `data-required`. A slider always has a value, so it never blocks a form. */
  required?: boolean
  /** The name it submits under: the number, or a range as `"start/end"`. Without one, it submits nothing. */
  name?: string
  /** The id of a form to belong to, when it isn't inside that form. */
  form?: string
  /**
   * How values read, for screen readers and `SliderValue`: `Intl.NumberFormat`
   * options, like `{ style: "currency", currency: "EUR" }`, or a function of the value.
   */
  format?: NumberFormat
  /**
   * The locale values are formatted in. Defaults to the page's `lang`, or the
   * browser's language without one, once the page is interactive. Server
   * markup uses English until then, so it never disagrees with the client.
   */
  locale?: string
  /** Moves the slider from anywhere. Create one with `createSliderController()`. */
  controller?: SliderController<Value>
} & PrimitiveOptions

/** What adapters pass on top: the id the field around it gives its first thumb's input. */
type SliderInternalOptions = SliderOptions & { thumbInputId?: string }

// Reads a `value` or `default-value` attribute: "50" is one thumb, "20/80" a
// range, like the value the form submits.
function valueAttribute(attribute: string | null) {
  const values = attribute === null ? null : parseRange(attribute)
  if (!values) {
    return undefined
  }
  return values.length === 1 ? values[0] : values
}

/**
 * The props the `thumb` slot of `slider` takes.
 * @stable
 */
type SliderThumbProps = {
  /**
   * Which value the thumb shows, from 0. Give each thumb of a range its own.
   * @defaultValue 0
   */
  index?: number
}

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type SliderState = {
  /** The value: a number, or one number per thumb. */
  value: number | number[]
  /** Whether it's disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether it's read-only: it stays focusable and submitted, but drags and keys don't change it. */
  readOnly: boolean
  /** Whether it's marked required. */
  required: boolean
  /** Whether a thumb is being dragged. */
  dragging: boolean
  /** The slider's axis. */
  orientation: "horizontal" | "vertical"
}
// A thumb shows its own value, not the whole one, so it renders only when its own moves.
/**
 * The state the `thumb` slot of `slider` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SliderThumbState = Omit<SliderState, "value"> & {
  /** Which value the thumb shows. */
  index: number
  /** The thumb's own value. */
  thumbValue: number
  /** Where the thumb sits, from 0 to 100. */
  percent: number
}
/**
 * The state the `value` slot of `slider` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SliderValueState = SliderState & {
  /** The formatted value, a range joined with an en dash. */
  text: string
}

function sliderState(state: State) {
  return { value: state.value, ...sharedState(state) }
}

function sharedState(state: State) {
  return {
    disabled: isDisabled(state),
    readOnly: state.readOnly,
    required: state.required,
    dragging: state.active !== null,
    orientation: state.orientation,
  }
}

const thumbValue = (state: State, index: number) =>
  state.thumbValues[index] ?? state.min

function dataAttrs(state: State) {
  return {
    "data-orientation": state.orientation,
    "data-disabled": isDisabled(state) ? "" : undefined,
    "data-readonly": state.readOnly ? "" : undefined,
    "data-required": state.required ? "" : undefined,
    "data-dragging": state.active !== null ? "" : undefined,
  }
}

// Centered on its value in either direction, with no need to know which:
// the insets make a box as wide as the track, centered on the value, and the
// thumb centers in it. `justify-self` centers a thumb of any width; browsers
// without it for positioned boxes center a sized thumb with the auto margins.
function thumbStyle(state: State, index: number, percent: number) {
  // A value that isn't a number leaves the thumb at the start, where an inset
  // the browser drops would have left it.
  percent ||= 0
  const vertical = state.orientation === "vertical"
  return css({
    position: "absolute",
    ...(vertical
      ? { bottom: `${percent}%`, left: "50%", translate: "-50% 50%" }
      : {
          "inset-inline": `calc(${percent}% - 50%) calc(50% - ${percent}%)`,
          "margin-inline": "auto",
          "justify-self": "center",
          top: "50%",
          translate: "0 -50%",
        }),
    "z-index":
      state.active === index ? 2 : state.last === index ? 1 : undefined,
    "--slider-thumb-position": `${percent}%`,
  })
}

// The filled part: from the start to a single thumb, or between the first and last.
function indicatorStyle(state: State) {
  const range = rangeOf(state)
  const all = valuesOf(state.value)
  const start = all.length > 1 ? percentOf(all[0], range) : 0
  const end = percentOf(all[all.length - 1], range)
  const size = Math.round((end - start) * 1e4) / 1e4
  const vertical = state.orientation === "vertical"
  return css({
    position: "absolute",
    [vertical ? "bottom" : "inset-inline-start"]: `${start}%`,
    [vertical ? "height" : "width"]: `${size}%`,
    ...(vertical ? { left: 0, right: 0 } : { top: 0, bottom: 0 }),
    "--slider-indicator-start": `${start}%`,
    "--slider-indicator-size": `${size}%`,
  })
}

// Invisible, but the size of the thumb, so a screen reader's focus ring matches it.
const rangeInputStyle = css({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  padding: 0,
  border: 0,
  opacity: 0,
  overflow: "hidden",
  "clip-path": "inset(50%)",
  "white-space": "nowrap",
  "pointer-events": "none",
})

// The first thumb's input takes the field's id even in a range, whose root
// is the control: the label renders first, and a <label for> can't point at
// a div. So a range's root takes an id of its own.
const thumbInputId = (state: State, id: string, index: number) =>
  (index === 0 && state.thumbInputId) || `${id}-thumb-${index}`

const sliderPrimitive = /* @__PURE__ */ definePrimitive({
  name: "slider",
  options: {
    value: valueAttribute,
    defaultValue: valueAttribute,
    onValueChange: "callback",
    onValueCommit: "callback",
    min: "number",
    max: "number",
    step: "number",
    largeStep: "number",
    minStepsBetweenThumbs: "number",
    orientation: "string",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    format: "value",
    locale: "string",
    controller: "value",
    // Internal: passed by renderers.
    thumbInputId: "string",
  },
  state: (options: SliderInternalOptions): State => {
    const initial = normalized(
      options.value ?? options.defaultValue ?? options.min ?? 0,
      options
    )
    return {
      ...settings(options),
      value: initial,
      initial: normalized(options.defaultValue ?? initial, options),
      formDisabled: false,
      pageLocale: null,
      active: null,
      last: null,
      thumbValues: thumbValuesOf(initial),
      thumbInputId: options.thumbInputId ?? null,
    }
  },
  sync: (options) => ({
    ...settings(options),
    // Like `defaultChecked`, changing it changes what a reset returns to.
    ...(options.defaultValue === undefined
      ? {}
      : { initial: normalized(options.defaultValue, options) }),
    ...(options.value === undefined
      ? {}
      : { value: normalized(options.value, options) }),
    ...(options.thumbInputId === undefined
      ? {}
      : { thumbInputId: options.thumbInputId }),
  }),
  commits: ["value"],
  api: sliderApi,
  slots: (slot) => ({
    root: slot<{}, SliderState>({
      role: "group",
      state: sliderState,
      attrs: (state, { id }) => ({
        id:
          state.thumbInputId && valuesOf(state.value).length > 1
            ? `${id}-group`
            : undefined,
        ...dataAttrs(state),
      }),
      bind: (el, { api, store }) => {
        bindPageLocale(el, (pageLocale) => store.set({ pageLocale }))
        return bindInternals(el, {
          value: api.internal.submitted,
          state: () => submitted(store.get()),
          restore: api.internal.restore,
          valueMissing: () => false,
          message: () => "",
          anchor: () =>
            el.querySelector<HTMLElement>('[data-slot="slider-thumb-input"]') ??
            el,
          focus: () => api.focus(),
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
          subscribe: store.subscribe,
        })
      },
    }),

    // Where presses land. A press on the track moves the nearest thumb there.
    control: slot<{}, SliderState>({
      state: sliderState,
      attrs: (state) => ({ ...dataAttrs(state), style: "touch-action:none" }),
      on: {
        pointerdown: (event, { api, el }) =>
          el && api.internal.press(event, el),
      },
    }),

    // The rail the thumbs move along. Positions are percentages of it.
    track: slot<{}, SliderState>({
      state: sliderState,
      attrs: (state) => ({ ...dataAttrs(state), style: "position:relative" }),
    }),

    indicator: slot<{}, SliderState>({
      state: sliderState,
      attrs: (state) => ({ ...dataAttrs(state), style: indicatorStyle(state) }),
    }),

    thumb: slot<SliderThumbProps, SliderThumbState>({
      props: { index: "number" },
      selects: selects({
        value: [],
        thumbValues: ({ props }) => [String(props.index ?? 0)],
        last: ({ props }) => [props.index ?? 0],
      }),
      state: (state, { props }) => {
        const index = props.index ?? 0
        const value = thumbValue(state, index)
        return {
          ...sharedState(state),
          index,
          thumbValue: value,
          percent: percentOf(value, rangeOf(state)),
        }
      },
      attrs: (state, { props }) => {
        const index = props.index ?? 0
        const percent = percentOf(thumbValue(state, index), rangeOf(state))
        return {
          ...dataAttrs(state),
          "data-index": String(index),
          "data-dragging": state.active === index ? "" : undefined,
          style: thumbStyle(state, index, percent),
        }
      },
    }),

    // The native range input inside each thumb, which takes focus. Screen
    // readers on phones adjust it with their own gestures. It takes its thumb's index.
    "thumb-input": slot<SliderThumbProps>({
      role: "slider",
      focus: "native",
      // Every arrow moves it whatever its orientation, as a native range's do.
      keys: [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "shift+ArrowUp",
        "shift+ArrowDown",
        "shift+ArrowLeft",
        "shift+ArrowRight",
        "PageUp",
        "PageDown",
        "Home",
        "End",
      ],
      props: { index: { kind: "number", from: "thumb" } },
      // Its range ends at its neighbours, so it hears their moves and its own.
      selects: selects({
        value: [],
        thumbValues: ({ props }) => {
          const index = props.index ?? 0
          return [String(index - 1), String(index), String(index + 1)]
        },
        active: [],
        last: [],
      }),
      attrs: (state, { id, props }) => {
        const index = props.index ?? 0
        const value = thumbValue(state, index)
        // Each thumb's range ends at its neighbours, as the APG's multi-thumb slider says.
        const { lower, upper } = boundsBetween(
          state.thumbValues[index - 1],
          state.thumbValues[index + 1],
          rangeOf(state)
        )
        return {
          type: "range",
          id: thumbInputId(state, id, index),
          min: String(lower),
          max: String(upper),
          step: String(state.step),
          value: String(value),
          // The range input's value says it, without another write per move.
          "aria-valuenow": undefined,
          "aria-valuetext": formatValue(value, state),
          "aria-orientation": state.orientation,
          disabled: isDisabled(state) ? "" : undefined,
          // A native range ignores `readonly`, so only its role says it.
          "aria-readonly": state.readOnly ? "true" : undefined,
          "data-disabled": isDisabled(state) ? "" : undefined,
          "data-readonly": state.readOnly ? "" : undefined,
          style: rangeInputStyle,
        }
      },
      on: {
        keydown: (event, { api, el, props }) =>
          el && api.internal.keydown(event, props.index ?? 0, el),
        keyup: (event, { api }) => api.internal.commitKeys(event),
        focusout: (_, { api }) => api.internal.commitKeys(),
        input: (event, { api, el, props }) => {
          const input = el as HTMLInputElement
          api.internal.adjust(props.index ?? 0, input.valueAsNumber, event)
          // Canceled or controlled, the input shows the value the slider has.
          api.internal.syncInput(input, props.index ?? 0)
        },
      },
      bind: (el, part) => {
        const { api, props } = part
        const input = el as HTMLInputElement
        const index = props.index ?? 0
        const write = () => api.internal.syncInput(input, index)
        write()
        const cleanups = [subscribe(part, write)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),

    // The formatted value. An <output> tied to the thumbs, never announced on
    // its own, since each thumb already says its value.
    value: slot<{}, SliderValueState>({
      // An <output> is a status already. Other elements, like a custom element, say so.
      role: "status",
      state: (state) => ({
        ...sliderState(state),
        text: valuesOf(state.value)
          .map((value) => formatValue(value, state))
          .join(" – "),
      }),
      attrs: (state, { id }) => ({
        for: valuesOf(state.value)
          .map((_, index) => thumbInputId(state, id, index))
          .join(" "),
        "aria-live": "off",
        ...dataAttrs(state),
      }),
    }),

    // React and Vue: the hidden input the form submits.
    input: slot({
      attrs: (state) => ({
        type: "hidden",
        name: state.name,
        value: submitted(state),
        form: state.form,
        disabled: state.disabled ? "" : undefined,
      }),
      bind: (el, { api, store }) =>
        bindValueInput(el as HTMLInputElement, {
          value: () => submitted(store.get()),
          subscribe: store.subscribe,
          focus: () => api.focus(),
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
        }),
    }),
  }),
  agent: { actions: ["setValue"] },
})
/**
 * The type of `slider`.
 * @stable
 */
interface SliderPrimitive extends WithGeneric<
  typeof sliderPrimitive,
  SliderGeneric
> {}

/**
 * The slider primitive, with the slots `root`, `control`, `track`,
 * `indicator`, `thumb`, `thumb-input`, `value`, `input`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const slider = sliderPrimitive as SliderPrimitive

export {
  createSliderController,
  slider,
  type SliderChangeOptions,
  type SliderController,
  type SliderOptions,
  type SliderPrimitive,
  type SliderState,
  type SliderThumbProps,
  type SliderThumbState,
  type SliderValueChangeDetails,
  type SliderValueChangeReason,
  type SliderValueCommitDetails,
  type SliderValueState,
}
export type { NumberFormat } from "../../foundation/number/format"
export type { SliderApi } from "./slider-api"
