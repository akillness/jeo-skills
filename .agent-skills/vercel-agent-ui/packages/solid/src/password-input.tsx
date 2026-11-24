import {
  passwordInput as passwordInputPrimitive,
  type PasswordInputOptions,
  type PasswordInputState,
} from "@ui-sdk/core/password-input"
import { createContext, merge, omit, useContext } from "solid-js"
import { joinField, useFieldControl, useFieldControlId } from "./field-context"
import { valueProps } from "./text-control"
import {
  createParts,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

// The field the control joins and the value it shows, which stay Solid's.
type PasswordInputContextValue = {
  field: ReturnType<typeof useFieldControl>
  value: () => string | undefined
  defaultValue: () => string | undefined
}

const PasswordInputContext = createContext<PasswordInputContextValue | null>(
  null
)

const parts = createParts(passwordInputPrimitive, { toggle: "button" })

function usePasswordInput(part: string) {
  const context = useContext(PasswordInputContext)
  if (!context) {
    throw new Error(`${part} must be used inside <PasswordInput>.`)
  }
  return context
}

/**
 * Holds the field and its toggle. Presses on its own text and icons focus the field.
 * @stable
 */
const PasswordInput = /* @__PURE__ */ rootScope(function PasswordInput(
  props: PasswordInputOptions &
    Omit<
      PartProps<"div", PasswordInputState>,
      "defaultValue" | "onChange" | "onSelect"
    >
) {
  const field = useFieldControl()
  const controlId = useFieldControlId()
  const passwordInput = usePrimitive(passwordInputPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    visible: props.visible,
    defaultVisible: props.defaultVisible,
    onVisibleChange: props.onVisibleChange,
    autoComplete: props.autoComplete,
    name: props.name ?? field?.name(),
    form: props.form,
    required: props.required,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    controller: props.controller,
    debug: props.debug,
    controlId,
  }))
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "visible",
    "defaultVisible",
    "onVisibleChange",
    "autoComplete",
    "name",
    "form",
    "required",
    "disabled",
    "readOnly",
    "controller",
    "debug"
  )
  const context: PasswordInputContextValue = {
    field,
    value: () => props.value,
    defaultValue: () => props.defaultValue,
  }
  return (
    <PasswordInputContext value={context}>
      {usePart(passwordInput, "root", undefined, rest, "div")}
    </PasswordInputContext>
  )
})

/**
 * The native <input>. Its type follows whether the password is shown, and
 * form attributes come from <PasswordInput>.
 * @stable
 */
function PasswordInputControl(
  props: Omit<
    PartProps<"input", PasswordInputState>,
    | "value"
    | "defaultValue"
    | "children"
    | "type"
    | "name"
    | "form"
    | "required"
    | "disabled"
    | "readonly"
    | "autocomplete"
    | "onSelect"
  >
) {
  const passwordInput = usePasswordInput("PasswordInputControl")
  // The value stays Solid's, so the field is a native controlled or uncontrolled input.
  const control = merge(
    props,
    valueProps(passwordInput.value, passwordInput.defaultValue)
  )
  return usePart(
    passwordInputPrimitive,
    "control",
    () => ({ id: props.id as string | undefined }),
    joinField(passwordInput.field, control, "input"),
    "input"
  )
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
