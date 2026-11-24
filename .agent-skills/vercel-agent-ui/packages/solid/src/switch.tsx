import {
  switchPrimitive,
  type SwitchOptions,
  type SwitchState,
} from "@ui-sdk/core/switch"
import { omit } from "solid-js"
import {
  joinField,
  useFieldControl,
  type ButtonControlProps,
} from "./field-context"
import { createParts, rootScope, usePart, usePrimitive } from "./use-primitive"

const parts = createParts(switchPrimitive, { thumb: "span" })

/**
 * A control that turns a setting on or off, with the hidden native input that takes part in the form.
 * @stable
 */
const Switch = /* @__PURE__ */ rootScope(function Switch(
  props: SwitchOptions & ButtonControlProps<SwitchState>
) {
  const field = useFieldControl()
  const control = usePrimitive(switchPrimitive, () => ({
    checked: props.checked,
    defaultChecked: props.defaultChecked,
    onCheckedChange: props.onCheckedChange,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    required: props.required,
    name: props.name ?? field?.name(),
    value: props.value,
    form: props.form,
    controller: props.controller,
    debug: props.debug,
  }))
  const rest = omit(
    props,
    "checked",
    "defaultChecked",
    "onCheckedChange",
    "disabled",
    "readOnly",
    "required",
    "name",
    "value",
    "form",
    "controller",
    "debug"
  )
  const input = control.slot("input")
  return (
    <>
      {usePart(
        control,
        "root",
        undefined,
        joinField(field, rest, "button"),
        "button"
      )}
      <input {...input} />
    </>
  )
})

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
