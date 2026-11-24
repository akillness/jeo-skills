import {
  input as inputPrimitive,
  inputGroup,
  type InputGroupOptions,
  type InputGroupState,
  type InputOptions,
  type InputState,
} from "@ui-sdk/core/input"
import { omit } from "solid-js"
import { joinField, useFieldControl } from "./field-context"
import {
  controlProps,
  elementProps,
  keepControlled,
  type Native,
} from "./text-control"
import {
  createParts,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const groupParts = createParts(inputGroup, { clear: "button" })

/**
 * A native <input>, wired to the Field it's in.
 * @stable
 */
const Input = /* @__PURE__ */ rootScope(function Input(
  props: InputOptions & Native<"input", InputState>
) {
  const field = useFieldControl()
  const input = usePrimitive(inputPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: keepControlled(() => props.value, props.onValueChange),
    controller: props.controller,
    debug: props.debug,
  }))
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "controller",
    "debug"
  )
  const element = elementProps(
    rest,
    field,
    () => props.value,
    () => props.defaultValue
  )
  return usePart(
    input,
    "root",
    controlProps(props, field),
    joinField(field, element, "input"),
    "input"
  )
})

/**
 * Holds an Input or Textarea with icons, text and buttons around it. Presses
 * on its text and icons focus the field.
 * @stable
 */
const InputGroup = /* @__PURE__ */ rootScope(function InputGroup(
  props: InputGroupOptions & PartProps<"div", InputGroupState>
) {
  const group = usePrimitive(inputGroup, () => ({ debug: props.debug }))
  return usePart(group, "group", undefined, omit(props, "debug"), "div")
})

/**
 * Empties the field in its group and focuses it. Shown while there's text to clear.
 * @stable
 */
const InputClear = groupParts.Clear

export { createInputController } from "@ui-sdk/core/input"
export type {
  InputController,
  InputGroupOptions,
  InputGroupPrimitive,
  InputGroupState,
  InputOptions,
  InputPrimitive,
  InputProps,
  InputState,
  InputValueChangeReason,
  TextareaOptions,
  TextareaPrimitive,
  TextareaProps,
  TextareaState,
  TextareaSubmitDetails,
} from "@ui-sdk/core/input"

export { Input, InputClear, InputGroup }
