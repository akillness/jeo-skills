import type { ChangeDetails } from "@ui-sdk/core"
import type {
  InputController,
  InputValueChangeReason,
} from "@ui-sdk/core/input"
import { getCurrentInstance, nextTick, type PropType } from "vue"
import type { useFieldControl } from "./field-context"
import { optionalBoolean, orModel } from "./use-primitive"

const textProps = {
  value: { type: String, default: undefined },
  modelValue: { type: String, default: undefined },
  defaultValue: { type: String, default: undefined },
  disabled: optionalBoolean,
  readOnly: optionalBoolean,
  required: optionalBoolean,
  controller: Object as PropType<InputController>,
  debug: optionalBoolean,
}

const textEmits = {
  "update:value": (_value: string) => true,
  "update:modelValue": (_value: string) => true,
  valueChange: (
    _value: string,
    _details: ChangeDetails<InputValueChangeReason>
  ) => true,
}

type TextProps = {
  value?: string
  modelValue?: string
  defaultValue?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  controller?: InputController
  debug?: boolean
}

type Emit = ((event: "update:value", value: string) => void) &
  ((event: "update:modelValue", value: string) => void) &
  ((
    event: "valueChange",
    value: string,
    details: ChangeDetails<InputValueChangeReason>
  ) => void)

// What the parent receives for a typed value, after v-model's `trim` and
// `number`, which Vue's emit applies.
function received(value: string, modifiers?: Record<string, boolean>) {
  if (modifiers?.number) {
    const number = parseFloat(value)
    return Number.isNaN(number) ? value : number
  }
  return modifiers?.trim ? value.trim() : value
}

// Options for a text field's primitive. The change event runs first, so
// canceling it also keeps v-model as it was.
function textOptions(props: TextProps, emit: Emit) {
  const component = getCurrentInstance()
  // Vue writes the element's value only when it renders, so a controlled
  // value the parent kept goes back in a render of its own, as in React.
  const keep = (value: string) => {
    nextTick(() => {
      const kept = orModel(props.value, props.modelValue)
      const key =
        props.value === undefined ? "modelModifiers" : "valueModifiers"
      const modifiers = component?.vnode.props?.[key]
      if (kept !== undefined && kept !== received(value, modifiers)) {
        component?.proxy?.$forceUpdate()
      }
    })
  }
  return () => ({
    value: orModel(props.value, props.modelValue),
    defaultValue: props.defaultValue,
    controller: props.controller,
    debug: props.debug,
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
      // Mid-composition the IME owns the text, and its last change comes after.
      if (!(details.event as InputEvent | undefined)?.isComposing) {
        keep(value)
      }
    },
  })
}

// Whether a control is read-only: the `read-only` prop, or else a native
// `readonly` attribute, which Vue keeps in `attrs`.
const readOnlyOf = (
  props: { readOnly?: boolean },
  attrs: Record<string, unknown>
) => props.readOnly ?? (attrs.readonly != null && attrs.readonly !== false)

// The element's attributes. A controlled value is the DOM property, which Vue
// sets on every render. A default is the `value` attribute, which is what a
// form reset returns to, and which the server renders. A textarea's default
// is its text.
function elementProps(
  props: TextProps,
  field: ReturnType<typeof useFieldControl>,
  attrs: Record<string, unknown>,
  tag: "input" | "textarea"
) {
  const controlled = orModel(props.value, props.modelValue)
  const value =
    controlled !== undefined
      ? { value: controlled }
      : tag === "input"
        ? { "^value": props.defaultValue }
        : {}
  // `v-model.trim` passes `modelModifiers`, which Vue applies itself and no element takes.
  const { modelModifiers, valueModifiers, ...rest } = attrs
  return {
    name: field?.name(),
    ...rest,
    disabled: props.disabled || field?.disabled(),
    readonly: readOnlyOf(props, attrs) || undefined,
    required: props.required,
    ...value,
  }
}

export { elementProps, readOnlyOf, textEmits, textOptions, textProps }
