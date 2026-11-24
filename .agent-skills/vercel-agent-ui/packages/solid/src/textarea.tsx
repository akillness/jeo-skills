import {
  textarea as textareaPrimitive,
  type TextareaOptions,
  type TextareaState,
} from "@ui-sdk/core/input"
import { omit } from "solid-js"
import { joinField, useFieldControl } from "./field-context"
import {
  controlProps,
  elementProps,
  keepControlled,
  type Native,
} from "./text-control"
import { rootScope, usePart, usePrimitive } from "./use-primitive"

/**
 * A native <textarea>, wired to the Field it's in, that can grow with its text.
 * @stable
 */
const Textarea = /* @__PURE__ */ rootScope(function Textarea(
  props: TextareaOptions & Omit<Native<"textarea", TextareaState>, "onSubmit">
) {
  const field = useFieldControl()
  const textarea = usePrimitive(textareaPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: keepControlled(() => props.value, props.onValueChange),
    controller: props.controller,
    debug: props.debug,
    autoResize: props.autoResize,
    onSubmit: props.onSubmit,
    submitShortcut: props.submitShortcut,
  }))
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "controller",
    "debug",
    "autoResize",
    "onSubmit",
    "submitShortcut"
  )
  const element = elementProps(
    rest,
    field,
    () => props.value,
    () => props.defaultValue
  )
  return usePart(
    textarea,
    "root",
    controlProps(props, field),
    joinField(field, element, "textarea"),
    "textarea"
  )
})

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

export { Textarea }
