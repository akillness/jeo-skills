import {
  numberInput as numberInputPrimitive,
  type NumberInputOptions,
  type NumberInputScrubAreaProps,
  type NumberInputState,
} from "@ui-sdk/core/number-input"
import { Portal } from "@solidjs/web"
import { createContext, merge, omit, Show, useContext } from "solid-js"
import { useControllerEntry, useControllerTarget } from "./controller-target"
import { joinField, useFieldControl, useFieldControlId } from "./field-context"
import { startingText } from "./text-control"
import {
  createParts,
  renderStatic,
  rootScope,
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

const NumberInputContext = createContext<NumberInputContextValue | null>(null)

function useNumberInput(part: string) {
  const context = useContext(NumberInputContext)
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
const NumberInput = /* @__PURE__ */ rootScope(function NumberInput(
  props: NumberInputOptions & DivProps
) {
  const field = useFieldControl()
  const controlId = useFieldControlId()
  const numberInput = usePrimitive(numberInputPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    onValueCommit: props.onValueCommit,
    min: props.min,
    max: props.max,
    step: props.step,
    largeStep: props.largeStep,
    smallStep: props.smallStep,
    format: props.format,
    locale: props.locale,
    wheel: props.wheel,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    required: props.required,
    name: props.name ?? field?.name(),
    form: props.form,
    controller: props.controller,
    debug: props.debug,
    controlId,
  }))
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "onValueCommit",
    "min",
    "max",
    "step",
    "largeStep",
    "smallStep",
    "format",
    "locale",
    "wheel",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "controller",
    "debug",
    "children"
  )
  // The handle with the field beside it. Its prototype keeps the handle's `state` getter live.
  const context: NumberInputContextValue = Object.assign(
    Object.create(numberInput),
    { field }
  )
  useControllerEntry(() => props.controller, context)
  const hidden = numberInput.slot("hidden-input")
  // The content, then the hidden input after it. `props.children` is read
  // once: every read of a JSX children getter makes the parts again, and a
  // discarded copy would still bind its control over the one in the page.
  const content = (current: NumberInputState) => {
    const children = props.children
    return (
      <>
        {typeof children === "function" ? children(current) : children}
        <input {...hidden} />
      </>
    )
  }
  return (
    <NumberInputContext value={context}>
      {usePart(
        numberInput,
        "root",
        undefined,
        merge(rest, { children: content }),
        "div"
      )}
    </NumberInputContext>
  )
})

/**
 * Holds the input and its buttons.
 * @stable
 */
const NumberInputGroup = parts.Group

/**
 * The text field, which shows the formatted number and takes typing.
 * @stable
 */
function NumberInputControl(
  props: Omit<
    PartProps<"input", NumberInputState>,
    "value" | "defaultValue" | "children" | "readonly"
  >
) {
  const numberInput = useNumberInput("NumberInputControl")
  return usePart(
    numberInput,
    "control",
    undefined,
    joinField(numberInput.field, startingText(props), "input"),
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
function NumberInputScrubArea(
  props: PartProps<"span", NumberInputState> & NumberInputScrubAreaProps
) {
  const numberInput = useControllerTarget(
    () => props.controller,
    useContext(NumberInputContext)
  )
  const rest = omit(props, "orientation", "pixelsPerStep", "controller")
  return (
    <Show
      when={numberInput()}
      keyed
      // Until the number input it names mounts, a scrub area outside it is a plain span.
      fallback={renderStatic(
        "span",
        () => ({ attrs: {}, state: unconnected }),
        rest
      )}
    >
      {(numberInput) => (
        <NumberInputContext value={numberInput}>
          {usePart(
            numberInput,
            "scrub-area",
            () => ({
              orientation: props.orientation,
              pixelsPerStep: props.pixelsPerStep,
            }),
            rest,
            "span"
          )}
        </NumberInputContext>
      )}
    </Show>
  )
}

/**
 * Stands in for the mouse cursor while a scrub locks the pointer. Rendered in
 * the body, so transformed ancestors can't move it.
 * @stable
 */
function NumberInputScrubAreaCursor(
  props: PartProps<"span", NumberInputState>
) {
  const numberInput = useContext(NumberInputContext)
  // A scrub area outside its number input renders before that mounts, with no cursor yet.
  if (!numberInput) {
    return null
  }
  // Present only while scrubbing, so the portal isn't in the page otherwise.
  return (
    <Show when={numberInput.present("scrub-area-cursor")}>
      <Portal>
        {usePart(numberInput, "scrub-area-cursor", undefined, props, "span")}
      </Portal>
    </Show>
  )
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
