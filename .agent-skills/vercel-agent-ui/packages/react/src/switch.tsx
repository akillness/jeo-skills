import {
  switchPrimitive,
  type SwitchOptions,
  type SwitchState,
} from "@ui-sdk/core/switch"
import {
  controlRender,
  useFieldControl,
  type ButtonControlProps,
} from "./field-context"
import { createParts, usePart } from "./use-primitive"

const parts = createParts(switchPrimitive, { root: "button", thumb: "span" })

// The hidden native input that takes part in the form.
function SwitchInput() {
  return usePart(switchPrimitive, "input", {}, {}, "input")
}

/**
 * A control that turns a setting on or off, with the hidden native input that takes part in the form.
 * @stable
 */
function Switch({
  disabled,
  name,
  render,
  ...props
}: SwitchOptions & ButtonControlProps<SwitchState>) {
  const field = useFieldControl()
  return (
    <parts.Root
      {...props}
      disabled={disabled || field?.disabled}
      name={name ?? field?.name}
      render={controlRender(field, "button", render, <SwitchInput />)}
    />
  )
}

/**
 * The thumb that slides along the switch as it turns on or off.
 * @stable
 */
const SwitchThumb = parts.Thumb

export { createSwitchController } from "@ui-sdk/core/switch"
export type {
  SwitchApi,
  SwitchCheckedChangeReason,
  SwitchController,
  SwitchOptions,
  SwitchPrimitive,
  SwitchState,
  SwitchThumbState,
} from "@ui-sdk/core/switch"

export { Switch, SwitchThumb }
