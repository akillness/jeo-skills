import {
  numberInput as numberInputPrimitive,
  type NumberInputOptions,
  type NumberInputScrubAreaProps,
  type NumberInputState,
} from "@ui-sdk/core/number-input"
import * as React from "react"
import { createPortal } from "react-dom"
import { useControllerEntry, useControllerTarget } from "./controller-target"
import {
  ownDescription,
  useFieldControl,
  useFieldControlId,
} from "./field-context"
import {
  createParts,
  extendHandle,
  renderElement,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(numberInputPrimitive, {
  group: "div",
  increment: "button",
  decrement: "button",
})

type NumberInputContextValue = PrimitiveHandle<typeof numberInputPrimitive> & {
  field: ReturnType<typeof useFieldControl>
}

const NumberInputContext = React.createContext<NumberInputContextValue | null>(
  null
)

function useNumberInput(part: string) {
  const context = React.useContext(NumberInputContext)
  if (!context) {
    throw new Error(`${part} must be used inside <NumberInput>.`)
  }
  return context
}

type DivProps = Omit<
  PartProps<"div", NumberInputState>,
  "defaultValue" | "onChange" | "onSelect"
>

/**
 * The root, and the hidden input that submits the number as is.
 * @stable
 */
function NumberInput({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min,
  max,
  step,
  largeStep,
  smallStep,
  format,
  locale,
  wheel,
  disabled,
  readOnly,
  required,
  name,
  form,
  controller,
  debug,
  children,
  ...props
}: NumberInputOptions & DivProps) {
  const field = useFieldControl()
  const controlId = useFieldControlId()
  const numberInput = usePrimitive(numberInputPrimitive, {
    value,
    defaultValue,
    onValueChange,
    onValueCommit,
    min,
    max,
    step,
    largeStep,
    smallStep,
    format,
    locale,
    wheel,
    disabled: disabled || field?.disabled,
    readOnly,
    required,
    name: name ?? field?.name,
    form,
    controller,
    debug,
    controlId,
  })
  const context = React.useMemo(
    () => extendHandle(numberInput, { field }),
    [numberInput, field]
  )
  useControllerEntry(controller, context)
  const content = (current: NumberInputState) => (
    <>
      {typeof children === "function" ? children(current) : children}
      <HiddenInput />
    </>
  )
  return (
    <NumberInputContext.Provider value={context}>
      {usePart(numberInput, "root", {}, { ...props, children: content })}
    </NumberInputContext.Provider>
  )
}

// The hidden input that submits the number as is.
function HiddenInput() {
  return usePart(numberInputPrimitive, "hidden-input", {}, {}, "input")
}

/**
 * Holds the input and its buttons.
 * @stable
 */
const NumberInputGroup = parts.Group

/**
 * The text field, which shows the formatted number and takes typing.
 * @stable
 */
function NumberInputControl({
  render,
  ...props
}: Omit<
  PartProps<"input", NumberInputState>,
  "value" | "defaultValue" | "children" | "readOnly"
>) {
  const numberInput = useNumberInput("NumberInputControl")
  // The core writes the text as it changes, so React only renders where it starts.
  const control = (input: Record<string, any>, state: NumberInputState) => {
    const { field } = numberInput
    const [own, element] = field
      ? ownDescription(input, render)
      : [input, render]
    const { value, ...rest }: Record<string, any> = field
      ? field.props(own)
      : own
    return renderElement(
      "input",
      { ...rest, defaultValue: value },
      element,
      state
    )
  }
  return usePart(
    numberInput,
    "control",
    {},
    { ...props, render: control },
    "input"
  )
}

/**
 * Steps up once, then repeats while held. Shift steps by `largeStep`.
 * @stable
 */
const NumberInputIncrement = parts.Increment

/**
 * Steps down once, then repeats while held. Shift steps by `largeStep`.
 * @stable
 */
const NumberInputDecrement = parts.Decrement

// What a scrub area outside its number input renders with until that mounts.
const unconnected: NumberInputState = {
  value: null,
  disabled: false,
  readOnly: false,
  required: false,
  scrubbing: false,
}

/**
 * Drag across it to change the value. It works anywhere inside the number
 * input, and outside it through `controller`, like an icon in a toolbar.
 * @stable
 */
function NumberInputScrubArea({
  orientation,
  pixelsPerStep,
  controller,
  render,
  ...props
}: PartProps<"span", NumberInputState> & NumberInputScrubAreaProps) {
  const numberInput = useControllerTarget(
    controller,
    React.useContext(NumberInputContext)
  )
  // Until the number input it names mounts, a scrub area outside it is a plain span.
  if (!numberInput) {
    return renderElement("span", props, render, unconnected)
  }
  return (
    <NumberInputContext.Provider value={numberInput}>
      <ScrubAreaPart
        numberInput={numberInput}
        scrub={{ orientation, pixelsPerStep }}
        props={props}
        render={render}
      />
    </NumberInputContext.Provider>
  )
}

function ScrubAreaPart({
  numberInput,
  scrub,
  props,
  render,
}: {
  numberInput: NumberInputContextValue
  scrub: Omit<NumberInputScrubAreaProps, "controller">
  props: Record<string, any>
  render?: PartProps<"span", NumberInputState>["render"]
}) {
  return usePart(numberInput, "scrub-area", scrub, { ...props, render }, "span")
}

/**
 * Stands in for the mouse cursor while a scrub locks the pointer. Rendered in
 * the body, so transformed ancestors can't move it.
 * @stable
 */
function NumberInputScrubAreaCursor(
  props: PartProps<"span", NumberInputState>
) {
  const numberInput = React.useContext(NumberInputContext)
  // A scrub area outside its number input renders before that mounts, with no cursor yet.
  return numberInput ? (
    <CursorPart numberInput={numberInput} {...props} />
  ) : null
}

function CursorPart({
  numberInput,
  ...props
}: PartProps<"span", NumberInputState> & {
  numberInput: NumberInputContextValue
}) {
  const cursor = usePart(numberInput, "scrub-area-cursor", {}, props, "span")
  return cursor && createPortal(cursor, document.body)
}

export { createNumberInputController } from "@ui-sdk/core/number-input"
export type {
  NumberInputApi,
  NumberInputButtonProps,
  NumberInputButtonState,
  NumberInputChangeOptions,
  NumberInputController,
  NumberInputOptions,
  NumberInputPrimitive,
  NumberInputScrubAreaProps,
  NumberInputState,
  NumberInputValueChangeReason,
} from "@ui-sdk/core/number-input"

export {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
  NumberInputScrubArea,
  NumberInputScrubAreaCursor,
}
