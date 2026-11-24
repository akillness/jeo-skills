import {
  input as inputPrimitive,
  inputGroup,
  type InputGroupOptions,
  type InputGroupState,
  type InputOptions,
  type InputState,
} from "@ui-sdk/core/input"
import { controlRender, useFieldControl } from "./field-context"
import { controlProps, elementProps, type Native } from "./text-control"
import {
  createParts,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

/**
 * A native <input>, wired to the Field it's in.
 * @stable
 */
function Input({
  value,
  defaultValue,
  onValueChange,
  controller,
  debug,
  render,
  ...props
}: InputOptions & Native<"input", InputState>) {
  const field = useFieldControl()
  const input = usePrimitive(inputPrimitive, {
    value,
    defaultValue,
    onValueChange,
    controller,
    debug,
  })
  const element = {
    ...elementProps(props, field, value, defaultValue),
    render: controlRender(field, "input", render),
  }
  return usePart(input, "root", controlProps(props, field), element, "input")
}

const parts = createParts(inputGroup, { clear: "button" })

/**
 * Holds an Input or Textarea with icons, text and buttons around it. Presses
 * on its text and icons focus the field.
 * @stable
 */
function InputGroup({
  debug,
  ...props
}: InputGroupOptions & PartProps<"div", InputGroupState>) {
  return usePart(usePrimitive(inputGroup, { debug }), "group", {}, props, "div")
}

/**
 * Empties the field in its group and focuses it. Shown while there's text to clear.
 * @stable
 */
const InputClear = parts.Clear

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
