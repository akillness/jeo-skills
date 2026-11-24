import {
  input as inputPrimitive,
  inputGroup as inputGroupPrimitive,
} from "@ui-sdk/core/input"
import { defineComponent } from "vue"
import { useFieldControl } from "./field-context"
import {
  elementProps,
  readOnlyOf,
  textEmits,
  textOptions,
  textProps,
} from "./text-control"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"

const groupParts = createParts(inputGroupPrimitive, { clear: "button" })

/**
 * A native <input>, wired to the Field it's in.
 * @stable
 */
const Input = withElement(
  "input",
  defineComponent({
    name: "Input",
    inheritAttrs: false,
    props: textProps,
    emits: textEmits,
    slots: Object as PartSlots<typeof inputPrimitive, "root">,
    setup(props, { attrs, emit }) {
      const field = useFieldControl()
      const input = usePrimitive(inputPrimitive, textOptions(props, emit))
      const part = () => ({
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        required: props.required,
      })
      return usePart(
        input,
        "root",
        part,
        () => elementProps(props, field, attrs, "input"),
        {
          tag: "input",
          extend: field?.props,
        }
      )
    },
  })
)

/**
 * Holds an Input or Textarea with icons, text and buttons around it. Presses
 * on its text and icons focus the field.
 * @stable
 */
const InputGroup = withElement(
  "div",
  defineComponent({
    name: "InputGroup",
    inheritAttrs: false,
    props: { debug: optionalBoolean },
    slots: Object as PartSlots<typeof inputGroupPrimitive, "group">,
    setup(props) {
      const group = usePrimitive(inputGroupPrimitive, () => ({
        debug: props.debug,
      }))
      return usePart(group, "group")
    },
  })
)

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
