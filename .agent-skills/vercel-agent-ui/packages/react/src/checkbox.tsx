import {
  checkbox,
  checkboxGroup,
  type CheckboxGroupController,
  type CheckboxGroupOptions,
  type CheckboxGroupState,
  type CheckboxOptions,
  type CheckboxState,
} from "@ui-sdk/core/checkbox"
import * as React from "react"
import {
  controlRender,
  useFieldControl,
  type ButtonControlProps,
} from "./field-context"
import {
  createParts,
  reading,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(checkbox, { root: "button", indicator: "span" })

// The group's own context, so a checkbox can join a group without bundling it.
const CheckboxGroupContext = React.createContext<PrimitiveHandle<
  typeof checkboxGroup
> | null>(null)

// The hidden native inputs that take part in the form.
function CheckboxInput() {
  return usePart(checkbox, "input", {}, {}, "input")
}

function GroupInput() {
  return usePart(checkboxGroup, "group-input", {}, {}, "input")
}

/**
 * The control and the hidden native input that takes part in the form.
 * @stable
 */
function Checkbox({
  disabled,
  name,
  render,
  ...props
}: Omit<CheckboxOptions, "group"> & ButtonControlProps<CheckboxState>) {
  const group = React.useContext(CheckboxGroupContext)
  // Inside a group, the group is the field's control.
  const field = useFieldControl()
  const fieldControl = group ? null : field
  return (
    <parts.Root
      {...props}
      disabled={disabled || fieldControl?.disabled}
      name={name ?? fieldControl?.name}
      group={group ? reading(group, () => group.api) : undefined}
      render={controlRender(fieldControl, "button", render, <CheckboxInput />)}
    />
  )
}

/**
 * The check inside the checkbox. Rendered while it's checked or indeterminate, or always with `keepMounted`.
 * @stable
 */
const CheckboxIndicator = parts.Indicator

/**
 * Checkboxes that share a name and a list of checked values. The group, not
 * each checkbox, sits in a field.
 * `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
function CheckboxGroup<T extends string = string>({
  value,
  defaultValue,
  onValueChange,
  allValues,
  readOnly,
  disabled,
  required,
  name,
  form,
  controller,
  debug,
  render,
  ...props
}: CheckboxGroupOptions<T> &
  Omit<
    PartProps<"div", CheckboxGroupState>,
    "defaultValue" | "onChange" | "onSelect"
  >) {
  const field = useFieldControl()
  const group = usePrimitive(checkboxGroup, {
    value,
    defaultValue,
    onValueChange: onValueChange as CheckboxGroupOptions["onValueChange"],
    allValues,
    disabled: disabled || field?.disabled,
    readOnly,
    required,
    name: name ?? field?.name,
    form,
    controller: controller as CheckboxGroupController | undefined,
    debug,
  })
  return (
    <CheckboxGroupContext value={group}>
      {usePart(
        group,
        "group",
        {},
        {
          ...props,
          render: controlRender(field, "div", render, <GroupInput />),
        },
        "div"
      )}
    </CheckboxGroupContext>
  )
}

export {
  createCheckboxController,
  createCheckboxGroupController,
} from "@ui-sdk/core/checkbox"
export type {
  CheckboxApi,
  CheckboxChangeOptions,
  CheckboxCheckedChangeReason,
  CheckboxController,
  CheckboxGroupApi,
  CheckboxGroupChangeOptions,
  CheckboxGroupController,
  CheckboxGroupOptions,
  CheckboxGroupPrimitive,
  CheckboxGroupState,
  CheckboxGroupValueChangeReason,
  CheckboxIndicatorProps,
  CheckboxIndicatorState,
  CheckboxOptions,
  CheckboxPrimitive,
  CheckboxState,
  CheckedState,
} from "@ui-sdk/core/checkbox"

export { Checkbox, CheckboxGroup, CheckboxIndicator }
