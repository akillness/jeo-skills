import type { ChangeDetails } from "@ui-sdk/core"
import {
  passwordInput as passwordInputPrimitive,
  type InputValueChangeReason,
  type PasswordInputController,
  type PasswordInputOptions,
  type PasswordInputVisibleChangeReason,
} from "@ui-sdk/core/password-input"
import {
  defineComponent,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import { useFieldControl, useFieldControlId } from "./field-context"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"
import { readOnlyOf } from "./text-control"

// What the control takes from its root: the field it joins, and the value it shows.
type ControlContext = {
  field: ReturnType<typeof useFieldControl>
  value: () => string | undefined
  defaultValue: () => string | undefined
}

const ControlKey: InjectionKey<ControlContext> = Symbol(
  "password-input-control"
)

const parts = createParts(passwordInputPrimitive, { toggle: "button" })

/**
 * Holds the field and its toggle. Presses on its own text and icons focus the field.
 * @stable
 */
const PasswordInput = withElement(
  "div",
  defineComponent({
    name: "PasswordInput",
    inheritAttrs: false,
    props: {
      value: { type: String, default: undefined },
      modelValue: { type: String, default: undefined },
      defaultValue: { type: String, default: undefined },
      visible: optionalBoolean,
      defaultVisible: optionalBoolean,
      autoComplete: String as PropType<PasswordInputOptions["autoComplete"]>,
      name: String,
      form: String,
      required: optionalBoolean,
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      controller: Object as PropType<PasswordInputController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: string) => true,
      "update:modelValue": (_value: string) => true,
      valueChange: (
        _value: string,
        _details: ChangeDetails<InputValueChangeReason>
      ) => true,
      "update:visible": (_visible: boolean) => true,
      visibleChange: (
        _visible: boolean,
        _details: ChangeDetails<PasswordInputVisibleChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof passwordInputPrimitive, "root">,
    setup(props, { attrs, emit }) {
      const field = useFieldControl()
      const controlId = useFieldControlId()
      const passwordInput = usePrimitive(passwordInputPrimitive, () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        visible: props.visible,
        defaultVisible: props.defaultVisible,
        autoComplete: props.autoComplete,
        name: props.name ?? field?.name(),
        form: props.form,
        required: props.required,
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        controller: props.controller,
        controlId,
        debug: props.debug,
        // The change events run first, so canceling one also keeps v-model as it was.
        onValueChange: (
          value: string,
          details: ChangeDetails<InputValueChangeReason>
        ) => {
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onVisibleChange: (
          visible: boolean,
          details: ChangeDetails<PasswordInputVisibleChangeReason>
        ) => {
          emit("visibleChange", visible, details)
          if (!details.canceled) {
            emit("update:visible", visible)
          }
        },
      }))
      provide(ControlKey, {
        field,
        value: () => orModel(props.value, props.modelValue),
        defaultValue: () => props.defaultValue,
      })
      return usePart(passwordInput, "root")
    },
  })
)

/**
 * The native <input>. Its type follows whether the password is shown, and
 * form attributes come from <PasswordInput>.
 * @stable
 */
const PasswordInputControl = withElement(
  "input",
  defineComponent({
    name: "PasswordInputControl",
    inheritAttrs: false,
    props: { id: String },
    slots: Object as PartSlots<typeof passwordInputPrimitive, "control">,
    setup(props, { attrs }) {
      const context = inject(ControlKey)
      if (!context) {
        throw new Error(
          "PasswordInputControl must be used inside <PasswordInput>."
        )
      }
      // A controlled value is the DOM property, which Vue sets on every render.
      // A default is the `value` attribute, which a form reset returns to.
      const element = () => {
        const value = context.value()
        return {
          ...attrs,
          ...(value !== undefined
            ? { value }
            : { "^value": context.defaultValue() }),
        }
      }
      return usePart(
        passwordInputPrimitive,
        "control",
        () => ({ id: props.id }),
        element,
        {
          tag: "input",
          extend: context.field?.props,
        }
      )
    },
  })
)

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
