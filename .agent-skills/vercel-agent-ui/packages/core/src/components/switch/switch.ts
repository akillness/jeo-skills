import {
  switchState,
  syncToggle,
  toggleControl,
  toggleDataAttrs,
  toggleSlots,
  toggleState,
  type CheckboxChangeOptions,
  type CheckboxCheckedChangeReason,
  type CheckboxState,
  type ToggleOptions,
} from "../../foundation/forms/toggle-control"
import { createChange } from "../../foundation/kernel/input-source"
import { createController } from "../../foundation/kernel/controller"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

/**
 * Why the switch checked change happened, as `reason` in its change details:
 * `"imperative"`, `"reset"`, `"press"`, `"restore"`.
 * @stable
 */
type SwitchCheckedChangeReason = CheckboxCheckedChangeReason

type Details = CheckboxChangeOptions

/**
 * Toggles and inspects a switch from outside it. Pass it as the `controller` option.
 * @stable
 */
function createSwitchController() {
  return createController<{
    /** Turns it on, or off. */
    toggle: (details?: Details) => boolean
    /** Whether it's on. */
    getChecked: () => boolean
    /** Turns it on or off, as a user would. */
    setChecked: (checked: boolean, details?: Details) => boolean
    /** Moves focus to it. */
    focus: () => void
  }>()
}

/**
 * A controller from `createSwitchController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type SwitchController = ReturnType<typeof createSwitchController>

/**
 * The options `switchPrimitive` takes. A component takes them as props on its
 * root.
 * @stable
 */
type SwitchOptions = ToggleOptions<boolean> & {
  /** Toggles it from anywhere. Create one with `createSwitchController()`. */
  controller?: SwitchController
} & PrimitiveOptions

/**
 * The state the `root` slot of `switchPrimitive` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SwitchState = Omit<CheckboxState, "indeterminate">
/**
 * The state the `thumb` slot of `switchPrimitive` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SwitchThumbState = SwitchState

/**
 * `switchPrimitive`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
type SwitchApi = ReturnType<typeof toggleControl<boolean>>

const switchDefinition = /* @__PURE__ */ definePrimitive({
  name: "switch",
  options: {
    checked: "boolean",
    defaultChecked: "boolean",
    onCheckedChange: "callback",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    value: "string",
    form: "string",
    controller: "value",
  },
  state: (options: SwitchOptions) => toggleState(options),
  controlled: ["checked"],
  sync: syncToggle,
  api: (context) => toggleControl<boolean>(context, createChange(context)),
  slots: (slot) => ({
    ...toggleSlots("switch", slot, switchState),
    // The part that slides.
    thumb: slot<{}, SwitchState>({
      state: switchState,
      attrs: (state) => toggleDataAttrs(state),
    }),
  }),
  agent: { actions: ["setChecked"] },
})

/**
 * The type of `switchPrimitive`.
 * @stable
 */
interface SwitchPrimitive extends Named<typeof switchDefinition> {}

/**
 * The switch primitive, with the slots `thumb`, `root`, `input`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const switchPrimitive: SwitchPrimitive = switchDefinition

export {
  createSwitchController,
  type SwitchApi,
  type SwitchCheckedChangeReason,
  type SwitchController,
  type SwitchOptions,
  switchPrimitive,
  type SwitchPrimitive,
  type SwitchState,
  type SwitchThumbState,
}
