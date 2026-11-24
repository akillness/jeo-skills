import { animateIn, animateOut } from "../../foundation/motion/presence"
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
import { selects } from "../../foundation/kernel/selects"
import { subscribe } from "../../foundation/kernel/part"
import {
  itemData,
  itemState,
  radioGroupApi,
  type RadioGroupApi,
  radioGroupState,
  syncRadioGroup,
} from "./radio-api"
import { radioSlots } from "./radio-parts"
import type { RadioGroupGeneric } from "./radio-generic"

/**
 * Why a radio group's value wants to change.
 * @stable
 */
type RadioGroupValueChangeReason =
  "item-press" | "list-navigation" | "reset" | "restore" | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type RadioGroupChangeOptions = ChangeOptions<RadioGroupValueChangeReason>

type Details = RadioGroupChangeOptions

/**
 * Checks and inspects a radio group from outside it. Pass it as the `controller` option.
 * @stable
 */
function createRadioGroupController<T extends string = string>() {
  return createController<{
    /** The checked radio's value. */
    getValue: () => T | null
    /** Checks a radio, as a user would. Disabled radios and read-only groups ignore it. */
    setValue: (value: T | null, details?: Details) => boolean
    /** Moves focus to the checked radio, or the first one. */
    focus: () => void
  }>()
}

/**
 * A controller from `createRadioGroupController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type RadioGroupController<T extends string = string> = ReturnType<
  typeof createRadioGroupController<T>
>

/**
 * The options `radioGroup` takes. A component takes them as props on its root.
 * @stable
 */
type RadioGroupOptions<T extends string = string> = {
  /** The checked radio's value. Pass it to control the group. `null` checks nothing. */
  value?: T | null
  /** The radio checked at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: T | null
  /** Runs when a user or a form reset wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T | null,
    details: ChangeDetails<RadioGroupValueChangeReason>
  ) => void
  /** Disables every radio like native ones: they can't be focused or changed, and the value isn't submitted. */
  disabled?: boolean
  /** Keeps the items focusable and the value submitted, but stops changes. */
  readOnly?: boolean
  /** Blocks form submission until an item is checked, with the browser's own message. */
  required?: boolean
  /** The name the value submits under. Without one, the group submits nothing. */
  name?: string
  /** The id of a form to belong to, when the group isn't inside that form. */
  form?: string
  /**
   * Whether arrow keys wrap from the last item to the first.
   * @defaultValue true
   */
  loop?: boolean
  /** Checks radios from anywhere. Create one with `createRadioGroupController()`. */
  controller?: RadioGroupController<T>
} & PrimitiveOptions

type ItemProps = {
  /** What the group's value becomes when this item is checked. */
  value: string
  /** Skips the item, like a disabled native radio: arrow keys pass it and it can't be focused or checked. */
  disabled?: boolean
}

type IndicatorProps = {
  /** The value of the item the indicator belongs to. Set for you inside an item. */
  value?: string
  /**
   * Whether the indicator stays in the page while its item is unchecked.
   * @defaultValue false
   */
  keepMounted?: boolean
}

/**
 * The props the `root` slot of a radio item takes: its `value` and `disabled`.
 * @stable
 */
type RadioProps = ItemProps
/**
 * The props the `indicator` slot of `radioGroup` takes, inside a radio item.
 * @stable
 */
type RadioIndicatorProps = Omit<IndicatorProps, "value">

/**
 * The state the `root` slot of `radioGroup` hands `render` functions and
 * state-based class names.
 * @stable
 */
type RadioGroupState = {
  /** The checked item's value. */
  value: string | null
  /** Whether the group is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the group is read-only: arrow keys still move focus, but nothing changes the checked item. */
  readOnly: boolean
  /** Whether a form won't submit until an item is checked. */
  required: boolean
}
/**
 * The state a radio item hands `render` functions and state-based class names.
 * @stable
 */
type RadioState = {
  /** Whether this item is checked. */
  checked: boolean
  /** Whether this item is disabled, by itself, its group or a `<fieldset>`. */
  disabled: boolean
  /** Whether the group is read-only. */
  readOnly: boolean
  /** Whether the group is required. */
  required: boolean
}
/**
 * The state the `indicator` slot of `radioGroup` hands `render` functions and
 * state-based class names.
 * @stable
 */
type RadioIndicatorState = RadioState

const radioGroupPrimitive = /* @__PURE__ */ definePrimitive({
  name: "radio",
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
    controller: "value",
  },
  state: radioGroupState,
  sync: syncRadioGroup,
  api: (context) => radioGroupApi(context),
  slots: (slot) => {
    const { group, item, input } = radioSlots(slot, (state) => ({
      value: state.value,
      disabled: isDisabled(state),
      readOnly: state.readOnly,
      required: state.required,
    }))
    return {
      group,
      root: item,
      input,
      indicator: slot<IndicatorProps, RadioIndicatorState>({
        props: {
          value: { kind: "string", from: "root" },
          keepMounted: "boolean",
        },
        // Every renderer fills the value from the item around it. Indicators skip
        // the tab stop, which moves with every arrow key, and only ask whether
        // their own value is exiting.
        selects: selects({
          value: ({ props }) => [props.value!],
          stop: [],
          exiting: ({ props }) => [props.value!],
        }),
        present: (state, { props: { value, keepMounted } }) =>
          !!keepMounted ||
          state.value === value ||
          state.exiting.includes(value!),
        state: (state, { props: { value }, api }) =>
          itemState(state, value!, api.internal.itemProps(value!)),
        attrs: (state, { props: { value }, api }) =>
          itemData(state, value!, api.internal.itemProps(value!)),
        bind(el, part) {
          const { api, store, props } = part
          const key = props.value!
          let stop: (() => void) | undefined
          let shown = store.get().value === key
          if (shown && api.isChanged()) {
            stop = animateIn(el)
          }
          const unsubscribe = subscribe(part, () => {
            const { value, exiting } = store.get()
            if ((value === key) === shown) {
              return
            }
            shown = value === key
            stop?.()
            stop = undefined
            // Ahead of the render, for exit keyframes keyed on the state.
            el.toggleAttribute("data-checked", shown)
            el.toggleAttribute("data-unchecked", !shown)
            if (shown) {
              stop = animateIn(el)
            } else if (exiting.includes(key) || props.keepMounted) {
              stop = animateOut(el, () => {
                stop = undefined
                api.internal.finishExit(key)
              })
            }
          })
          return () => {
            unsubscribe()
            stop?.()
          }
        },
      }),
    }
  },
  agent: { actions: ["setValue"], closed: true },
})
/**
 * The type of `radioGroup`.
 * @stable
 */
interface RadioGroupPrimitive extends WithGeneric<
  typeof radioGroupPrimitive,
  RadioGroupGeneric
> {}

/**
 * The radio group primitive, with the slots `group`, `root`, `input`,
 * `indicator`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const radioGroup = radioGroupPrimitive as RadioGroupPrimitive

export {
  createRadioGroupController,
  radioGroup,
  type RadioGroupApi,
  type RadioGroupChangeOptions,
  type RadioGroupController,
  type RadioGroupOptions,
  type RadioGroupPrimitive,
  type RadioGroupState,
  type RadioGroupValueChangeReason,
  type RadioIndicatorProps,
  type RadioIndicatorState,
  type RadioProps,
  type RadioState,
}
