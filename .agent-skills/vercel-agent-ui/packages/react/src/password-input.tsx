import {
  passwordInput,
  type PasswordInputOptions,
  type PasswordInputState,
} from "@ui-sdk/core/password-input"
import * as React from "react"
import {
  controlRender,
  useFieldControl,
  useFieldControlId,
} from "./field-context"
import { createParts, usePart, type PartProps } from "./use-primitive"

const parts = createParts(passwordInput, { root: "div", toggle: "button" })

// What the control renders from the root: its field, and the value React keeps.
type ControlContextValue = {
  field: ReturnType<typeof useFieldControl>
  value?: string
  defaultValue?: string
}

const ControlContext = React.createContext<ControlContextValue>({ field: null })

// React warns about a `value` without `onChange`. `onValueChange` is the change handler here.
const ignore = () => {}

/**
 * Holds the field and its toggle. Presses on its own text and icons focus the field.
 * @stable
 */
function PasswordInput({
  value,
  defaultValue,
  name,
  disabled,
  ...props
}: PasswordInputOptions &
  Omit<
    PartProps<"div", PasswordInputState>,
    "defaultValue" | "onChange" | "onSelect"
  >) {
  const field = useFieldControl()
  const controlId = useFieldControlId()
  const control = React.useMemo(
    () => ({ field, value, defaultValue }),
    [field, value, defaultValue]
  )
  return (
    <ControlContext.Provider value={control}>
      <parts.Root
        {...props}
        value={value}
        defaultValue={defaultValue}
        name={name ?? field?.name}
        disabled={disabled || field?.disabled}
        controlId={controlId}
      />
    </ControlContext.Provider>
  )
}

/**
 * The native <input>. Its type follows whether the password is shown, and
 * form attributes come from <PasswordInput>.
 * @stable
 */
function PasswordInputControl({
  id,
  render,
  ...props
}: Omit<
  PartProps<"input", PasswordInputState>,
  | "value"
  | "defaultValue"
  | "children"
  | "type"
  | "name"
  | "form"
  | "required"
  | "disabled"
  | "readOnly"
  | "autoComplete"
  | "onSelect"
>) {
  const { field, value, defaultValue } = React.useContext(ControlContext)
  // The value stays React's, so the field is a native controlled or uncontrolled input.
  const element = {
    ...props,
    value,
    defaultValue,
    onChange: props.onChange ?? (value === undefined ? undefined : ignore),
    render: controlRender(field, "input", render),
  }
  return usePart(passwordInput, "control", { id }, element, "input")
}

/**
 * Shows and hides the password. Name it by what it does, like "Show password":
 * it's a toggle button, and `aria-pressed` says whether the password is shown.
 * @stable
 */
const PasswordInputToggle = parts.Toggle

export { createPasswordInputController } from "@ui-sdk/core/password-input"
export type {
  InputValueChangeReason,
  PasswordInputController,
  PasswordInputOptions,
  PasswordInputPrimitive,
  PasswordInputState,
  PasswordInputVisibleChangeReason,
} from "@ui-sdk/core/password-input"

export { PasswordInput, PasswordInputControl, PasswordInputToggle }
