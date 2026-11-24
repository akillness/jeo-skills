import {
  radioGroup,
  type RadioGroupOptions,
  type RadioGroupState,
  type RadioProps,
  type RadioState,
} from "@ui-sdk/core/radio"
import { createContext, omit, useContext } from "solid-js"
import {
  FieldContext,
  type FieldContextValue,
  joinField,
  useFieldControl,
} from "./field-context"
import { createParts, usePart, type PartProps } from "./use-primitive"

const parts = createParts(radioGroup, { indicator: "span" })

// The field the group joined, so a radio joins only a field of its own.
const GroupFieldContext = createContext<FieldContextValue | null>(null)

/**
 * Radios that share one value, with one tab stop and arrow keys between them.
 * `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
function RadioGroup<T extends string = string>(
  props: RadioGroupOptions<T> &
    Omit<PartProps<"div", RadioGroupState>, "onChange" | "onSelect">
) {
  const field = useFieldControl()
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "loop",
    "controller",
    "debug"
  )
  // The group's element joins the field it's in, which also names and disables it.
  return (
    <GroupFieldContext value={useContext(FieldContext)}>
      <parts.Root<T>
        {...props}
        disabled={props.disabled || field?.disabled()}
        name={props.name ?? field?.name()}
      >
        {usePart(
          radioGroup,
          "group",
          undefined,
          joinField(field, rest, "div"),
          "div"
        )}
      </parts.Root>
    </GroupFieldContext>
  )
}

/**
 * A radio and the hidden native radio that takes part in the form.
 * @stable
 */
function Radio(
  props: Omit<PartProps<"button", RadioState>, "value" | "onSelect"> &
    RadioProps
) {
  // A radio in a field of its own is that field's control. In the group's field, the group is.
  const nearest = useContext(FieldContext)
  const field =
    nearest && nearest !== useContext(GroupFieldContext)
      ? useFieldControl()
      : null
  const item = () => ({
    value: props.value,
    disabled: props.disabled || field?.disabled(),
  })
  const rest = omit(props, "value", "disabled")
  return (
    <>
      {usePart(
        radioGroup,
        "root",
        item,
        joinField(field, rest, "button"),
        "button"
      )}
      {usePart(radioGroup, "input", item, {}, "input")}
    </>
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
