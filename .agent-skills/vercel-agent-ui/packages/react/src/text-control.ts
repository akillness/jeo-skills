import type { useFieldControl } from "./field-context"
import type { PartProps } from "./use-primitive"

// Props an input or textarea takes that the part replaces.
type Native<Tag extends "input" | "textarea", State> = Omit<
  PartProps<Tag, State>,
  "value" | "defaultValue" | "onSelect"
>

// React warns about a `value` without `onChange`. `onValueChange` is the change handler here.
const ignore = () => {}

// The native props a text field's state follows, and its change handler.
type TextProps = {
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  onChange?: unknown
}

// The states a text field's attributes follow, from its own props and its field's.
function controlProps(
  props: TextProps,
  field: ReturnType<typeof useFieldControl>
) {
  return {
    disabled: props.disabled || field?.disabled,
    readOnly: props.readOnly,
    required: props.required,
  }
}

// The element's props: the field's name, the user's props, and the value left
// to React, so it stays a native controlled or uncontrolled input.
function elementProps<Props extends TextProps>(
  props: Props,
  field: ReturnType<typeof useFieldControl>,
  value?: string,
  defaultValue?: string
) {
  return {
    name: field?.name,
    ...props,
    value,
    defaultValue,
    onChange: props.onChange ?? (value === undefined ? undefined : ignore),
  }
}

export { controlProps, elementProps, type Native }
