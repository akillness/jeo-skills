import {
  radioGroup,
  type RadioGroupController,
  type RadioGroupOptions,
  type RadioGroupState,
  type RadioProps,
  type RadioState,
} from "@ui-sdk/core/radio"
import * as React from "react"
import {
  controlRender,
  FieldContext,
  type FieldContextValue,
  useJoinField,
} from "./field-context"
import {
  createParts,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

// The group's own element is its `group` slot, and each radio its `root`.
const parts = createParts(radioGroup, { indicator: "span" })

// The field the group joined, so a radio joins only a field of its own.
const GroupFieldContext = React.createContext<FieldContextValue | null>(null)

/**
 * Radios that share one value, with one tab stop and arrow keys between them.
 * `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
function RadioGroup<T extends string = string>({
  value,
  defaultValue,
  onValueChange,
  disabled,
  readOnly,
  required,
  name,
  form,
  loop,
  controller,
  debug,
  render,
  ...props
}: RadioGroupOptions<T> &
  Omit<
    PartProps<"div", RadioGroupState>,
    "defaultValue" | "onChange" | "onSelect"
  >) {
  const groupField = React.useContext(FieldContext)
  const field = useJoinField(groupField)
  const group = usePrimitive(radioGroup, {
    value,
    defaultValue,
    onValueChange: onValueChange as RadioGroupOptions["onValueChange"],
    disabled: disabled || field?.disabled,
    readOnly,
    required,
    name: name ?? field?.name,
    form,
    loop,
    controller: controller as RadioGroupController | undefined,
    debug,
  })
  return (
    <GroupFieldContext.Provider value={groupField}>
      {usePart(
        group,
        "group",
        {},
        { ...props, render: controlRender(field, "div", render) }
      )}
    </GroupFieldContext.Provider>
  )
}

// The hidden native radio that takes part in the form.
function RadioInput(props: RadioProps) {
  return usePart(radioGroup, "input", props, {}, "input")
}

/**
 * A radio and the hidden native radio that takes part in the form.
 * @stable
 */
function Radio({
  value,
  disabled,
  render,
  ...props
}: Omit<PartProps<"button", RadioState>, "value" | "onSelect"> & RadioProps) {
  // A radio in a field of its own is that field's control. In the group's field, the group is.
  const nearest = React.useContext(FieldContext)
  const groupField = React.useContext(GroupFieldContext)
  const field = useJoinField(nearest === groupField ? null : nearest)
  const isDisabled = disabled || field?.disabled
  const input = <RadioInput value={value} disabled={isDisabled} />
  return usePart(
    radioGroup,
    "root",
    { value, disabled: isDisabled },
    { ...props, render: controlRender(field, "button", render, input) },
    "button"
  )
}

/**
 * The dot inside the radio. Rendered while it's checked, or always with `keepMounted`.
 * @stable
 */
const RadioIndicator = parts.Indicator

export { createRadioGroupController } from "@ui-sdk/core/radio"
export type {
  RadioGroupApi,
  RadioGroupChangeOptions,
  RadioGroupController,
  RadioGroupOptions,
  RadioGroupPrimitive,
  RadioGroupState,
  RadioGroupValueChangeReason,
  RadioIndicatorProps,
  RadioIndicatorState,
  RadioProps,
  RadioState,
} from "@ui-sdk/core/radio"

export { Radio, RadioGroup, RadioIndicator }
