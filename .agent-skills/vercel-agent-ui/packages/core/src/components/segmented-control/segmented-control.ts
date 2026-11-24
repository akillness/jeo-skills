import {
  type Direction,
  orientationOf,
} from "../../foundation/focus/collection"
import { isDisabled } from "../../foundation/forms/form"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PrimitiveOptions,
  WithGeneric,
} from "../../foundation/kernel/primitive-types"
import {
  bindIndicator,
  directionBetween,
} from "../../foundation/selection/indicator"
import {
  radioGroupApi,
  type RadioGroupApi,
  radioGroupState,
  syncRadioGroup,
} from "../radio/radio-api"
import { radioSlots } from "../radio/radio-parts"
import type { SegmentedControlGeneric } from "./segmented-control-generic"

/**
 * Which way the items run.
 * @experimental
 */
type SegmentedControlOrientation = "horizontal" | "vertical"

/**
 * Why a segmented control's value wants to change.
 * @experimental
 */
type SegmentedControlValueChangeReason =
  "item-press" | "list-navigation" | "reset" | "restore" | "imperative"

/**
 * Options for every write method on a controller.
 * @experimental
 */
type SegmentedControlChangeOptions =
  ChangeOptions<SegmentedControlValueChangeReason>

/**
 * Picks and inspects a segmented control's value from outside it. Pass it as the `controller` option.
 * @experimental
 */
function createSegmentedControlController<T extends string = string>() {
  return createController<{
    /** The checked item's value. */
    getValue: () => T | null
    /** Checks an item, as a user would. Disabled items and read-only controls ignore it. */
    setValue: (
      value: T | null,
      details?: SegmentedControlChangeOptions
    ) => boolean
    /** Moves focus to the checked item, or the first one. */
    focus: () => void
  }>()
}

/**
 * A controller from `createSegmentedControlController()`. Pass it as the
 * `controller` option.
 * @experimental
 */
type SegmentedControlController<T extends string = string> = ReturnType<
  typeof createSegmentedControlController<T>
>

/**
 * The options `segmentedControl` takes. A component takes them as props on its root.
 * @experimental
 */
type SegmentedControlOptions<T extends string = string> = {
  /** The checked item's value. Pass it to control the segmented control. `null` checks nothing. */
  value?: T | null
  /** The item checked at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: T | null
  /** Runs when a user or a form reset wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T | null,
    details: ChangeDetails<SegmentedControlValueChangeReason>
  ) => void
  /** Disables every item: they can't be focused or changed, and the value isn't submitted. */
  disabled?: boolean
  /** Keeps the items focusable and the value submitted, but stops changes. */
  readOnly?: boolean
  /** Blocks form submission until an item is checked, with the browser's own message. */
  required?: boolean
  /** The name the value submits under. Without one, the segmented control submits nothing. */
  name?: string
  /** The id of a form to belong to, when the segmented control isn't inside that form. */
  form?: string
  /**
   * Whether arrow keys wrap from the last item to the first.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * Which way the items run, for styling and for screen readers. Arrow keys
   * on both axes move between items either way, as in any radio group.
   * @defaultValue "horizontal"
   */
  orientation?: SegmentedControlOrientation
  /** Checks items from anywhere. Create one with `createSegmentedControlController()`. */
  controller?: SegmentedControlController<T>
} & PrimitiveOptions

/**
 * The props the `item` slot of `segmentedControl` takes.
 * @experimental
 */
type SegmentedControlItemProps = {
  /** What the value becomes when this item is checked. */
  value: string
  /** Skips the item, like a disabled native radio: arrow keys pass it and it can't be focused or checked. */
  disabled?: boolean
}

/**
 * What `render` functions and state-based class names receive.
 * @experimental
 */
type SegmentedControlState = {
  /** The checked item's value. */
  value: string | null
  /** Whether the segmented control is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether it's read-only: arrow keys still move focus, but nothing changes the checked item. */
  readOnly: boolean
  /** Whether a form won't submit until an item is checked. */
  required: boolean
  /** Which way the items run. */
  orientation: SegmentedControlOrientation
}

/**
 * The state an item hands `render` functions and state-based class names.
 * @experimental
 */
type SegmentedControlItemState = {
  /** Whether this item is the control's value, which the indicator sits behind. */
  checked: boolean
  /** Whether this item is disabled, by itself, the segmented control or a `<fieldset>`. */
  disabled: boolean
  /** Whether the control is read-only, so pressing this item changes nothing. */
  readOnly: boolean
  /** Whether a form won't submit until an item is checked. */
  required: boolean
}

/**
 * The state the `indicator` slot of `segmentedControl` hands `render`
 * functions and state-based class names.
 * @experimental
 */
type SegmentedControlIndicatorState = {
  /** The checked item's value, which the indicator sits behind. */
  value: string | null
  /** Which way the items run. */
  orientation: SegmentedControlOrientation
  /** Which way the checked item last moved on screen, `"none"` before it first moves. */
  direction: SegmentedControlDirection
}

/**
 * Which way the checked item moved, on screen.
 * @experimental
 */
type SegmentedControlDirection = Direction

const slotNames = { group: "root", item: "item" }

const indicatorVariables = [
  "left",
  "right",
  "top",
  "bottom",
  "width",
  "height",
] as const

const orientation = (options: SegmentedControlOptions) =>
  orientationOf(options.orientation, "horizontal")

/**
 * `segmentedControl`'s api, which its slots and controller call. Adapters
 * expose it as `api`.
 * @experimental
 */
interface SegmentedControlApi extends RadioGroupApi {}

const segmentedControlPrimitive = /* @__PURE__ */ definePrimitive({
  name: "segmented-control",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    loop: "boolean",
    orientation: "string",
    controller: "value",
  },
  state: (options: SegmentedControlOptions) =>
    radioGroupState(options, {
      orientation: orientation(options),
      direction: "none",
    }),
  sync: (options) => ({
    ...syncRadioGroup(options),
    orientation: orientation(options),
  }),
  api: (context) => radioGroupApi(context, slotNames),
  slots: (slot) => {
    const { group, item, input } = radioSlots(slot, (state) => ({
      value: state.value,
      disabled: isDisabled(state),
      readOnly: state.readOnly,
      required: state.required,
      orientation: state.orientation ?? "horizontal",
    }))
    return {
      root: group,
      item,
      input,
      indicator: slot<{}, SegmentedControlIndicatorState>({
        role: "presentation",
        state: (state) => ({
          value: state.value,
          orientation: state.orientation ?? "horizontal",
          direction: state.direction ?? "none",
        }),
        attrs: (state) => ({
          "data-orientation": state.orientation,
          "data-activation-direction": state.direction ?? "none",
        }),
        bind(el, { api, store }) {
          let value = store.get().value
          const rect = (key: string | null) =>
            key === null
              ? undefined
              : api.internal.radio(key)?.getBoundingClientRect()
          return bindIndicator({
            list: () => api.internal.group() ?? el.parentElement,
            active: () => {
              const { value } = store.get()
              return value === null ? undefined : api.internal.radio(value)
            },
            itemSelector: '[role="radio"]',
            subscribe: (remeasure) =>
              store.subscribe(() => {
                if (store.get().value === value) {
                  return
                }
                const direction = directionBetween(
                  rect(value),
                  rect(store.get().value),
                  store.get().orientation ?? "horizontal"
                ) as SegmentedControlDirection
                value = store.get().value
                // Ahead of the render, so styles that skip transitions while
                // the direction is "none" animate the first move too.
                el.setAttribute("data-activation-direction", direction)
                store.set({ direction })
                remeasure()
              }),
            write(box) {
              for (const name of indicatorVariables) {
                if (box) {
                  el.style.setProperty(
                    `--segmented-control-indicator-${name}`,
                    `${box[name]}px`
                  )
                } else {
                  el.style.removeProperty(
                    `--segmented-control-indicator-${name}`
                  )
                }
              }
            },
          })
        },
      }),
    }
  },
  agent: { actions: ["setValue"], closed: true },
})

/**
 * The type of `segmentedControl`.
 * @experimental
 */
interface SegmentedControlPrimitive extends WithGeneric<
  typeof segmentedControlPrimitive,
  SegmentedControlGeneric
> {}

/**
 * The segmented control primitive, with the slots `root`, `item`, `input`,
 * `indicator`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @experimental
 */
const segmentedControl = segmentedControlPrimitive as SegmentedControlPrimitive

export {
  createSegmentedControlController,
  segmentedControl,
  type SegmentedControlApi,
  type SegmentedControlChangeOptions,
  type SegmentedControlController,
  type SegmentedControlDirection,
  type SegmentedControlIndicatorState,
  type SegmentedControlItemProps,
  type SegmentedControlItemState,
  type SegmentedControlOptions,
  type SegmentedControlOrientation,
  type SegmentedControlPrimitive,
  type SegmentedControlState,
  type SegmentedControlValueChangeReason,
}
