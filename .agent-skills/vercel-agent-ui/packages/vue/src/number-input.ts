import {
  numberInput as numberInputPrimitive,
  type NumberInputController,
  type NumberInputState,
  type NumberInputValueChangeReason,
} from "@ui-sdk/core/number-input"
import type { ChangeDetails, CommitDetails } from "@ui-sdk/core"
import {
  defineComponent,
  h,
  inject,
  provide,
  Teleport,
  type InjectionKey,
  type PropType,
} from "vue"
import {
  renderUnbound,
  useControllerEntry,
  useControllerTarget,
} from "./controller-target"
import { useFieldControl, useFieldControlId } from "./field-context"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  type PrimitiveHandle,
  provideHandle,
  useHandle,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"
import { readOnlyOf } from "./text-control"

type NumberInputContext = PrimitiveHandle<typeof numberInputPrimitive>

// The field the number input is in, which its control joins.
const FieldOfKey: InjectionKey<ReturnType<typeof useFieldControl>> =
  Symbol("number-input-field")

const parts = createParts(numberInputPrimitive, {
  group: "div",
  increment: "button",
  decrement: "button",
})

type Value = number | null

/**
 * The root, and the hidden input that submits the number as is.
 * @stable
 */
const NumberInput = withElement(
  "div",
  defineComponent({
    name: "NumberInput",
    inheritAttrs: false,
    props: {
      value: { type: Number as PropType<Value>, default: undefined },
      modelValue: { type: Number as PropType<Value>, default: undefined },
      defaultValue: { type: Number as PropType<Value>, default: undefined },
      min: Number,
      max: Number,
      step: Number,
      largeStep: Number,
      smallStep: Number,
      format: Object as PropType<Intl.NumberFormatOptions>,
      locale: String,
      wheel: optionalBoolean,
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      required: optionalBoolean,
      name: String,
      form: String,
      controller: Object as PropType<NumberInputController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: Value) => true,
      "update:modelValue": (_value: Value) => true,
      valueChange: (
        _value: Value,
        _details: ChangeDetails<NumberInputValueChangeReason>
      ) => true,
      valueCommit: (
        _value: Value,
        _details: CommitDetails<NumberInputValueChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof numberInputPrimitive, "root">,
    setup(props, { attrs, emit }) {
      const field = useFieldControl()
      const controlId = useFieldControlId()
      const numberInput = usePrimitive(numberInputPrimitive, () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        min: props.min,
        max: props.max,
        step: props.step,
        largeStep: props.largeStep,
        smallStep: props.smallStep,
        format: props.format,
        locale: props.locale,
        wheel: props.wheel,
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        required: props.required,
        name: props.name ?? field?.name(),
        form: props.form,
        controller: props.controller,
        controlId,
        debug: props.debug,
        onValueChange: (
          value: Value,
          details: ChangeDetails<NumberInputValueChangeReason>
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onValueCommit: (
          value: Value,
          details: CommitDetails<NumberInputValueChangeReason>
        ) => emit("valueCommit", value, details),
      }))
      provide(FieldOfKey, field)
      useControllerEntry(() => props.controller, numberInput)
      return usePart(numberInput, "root", undefined, undefined, {
        tag: "div",
        hidden: () => h("input", numberInput.slot("hidden-input")),
      })
    },
  })
)

/**
 * Holds the input and its buttons.
 * @stable
 */
const NumberInputGroup = parts.Group
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

/**
 * The text field, which shows the formatted number and takes typing.
 * @stable
 */
const NumberInputControl = withElement(
  "input",
  defineComponent({
    name: "NumberInputControl",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof numberInputPrimitive, "control">,
    setup() {
      const field = inject(FieldOfKey, null)
      return usePart(
        useHandle(numberInputPrimitive),
        "control",
        undefined,
        undefined,
        {
          tag: "input",
          extend: field?.props,
        }
      )
    },
  })
)

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
const NumberInputScrubArea = withElement(
  "span",
  defineComponent({
    name: "NumberInputScrubArea",
    inheritAttrs: false,
    props: {
      orientation: String as PropType<"horizontal" | "vertical">,
      pixelsPerStep: Number,
      controller: Object as PropType<NumberInputController>,
    },
    slots: Object as PartSlots<typeof numberInputPrimitive, "scrub-area">,
    setup(props, { slots, attrs }) {
      const connected = useControllerTarget(
        numberInputPrimitive,
        () => props.controller
      )
      return () => {
        const numberInput = connected()
        // Until the number input it names mounts, a scrub area outside it is a plain span.
        if (!numberInput) {
          return renderUnbound("span", attrs, { slots, state: unconnected })
        }
        return h(
          ScrubAreaPart,
          {
            numberInput,
            orientation: props.orientation,
            pixelsPerStep: props.pixelsPerStep,
            // A new number input needs a new part, bound to its instance.
            key: numberInput.instance.id,
            ...attrs,
          },
          slots
        )
      }
    },
  })
)

// The scrub area once it has its number input, which it passes on to the cursor inside.
const ScrubAreaPart = defineComponent({
  name: "NumberInputScrubAreaPart",
  inheritAttrs: false,
  props: {
    numberInput: {
      type: Object as PropType<NumberInputContext>,
      required: true,
    },
    orientation: String as PropType<"horizontal" | "vertical">,
    pixelsPerStep: Number,
  },
  setup(props) {
    provideHandle(props.numberInput)
    const scrub = () => ({
      orientation: props.orientation,
      pixelsPerStep: props.pixelsPerStep,
    })
    return usePart(props.numberInput, "scrub-area", scrub, undefined, "span")
  },
})

/**
 * Stands in for the mouse cursor while a scrub locks the pointer. Rendered in
 * the body, so transformed ancestors can't move it.
 * @stable
 */
const NumberInputScrubAreaCursor = withElement(
  "span",
  defineComponent({
    name: "NumberInputScrubAreaCursor",
    inheritAttrs: false,
    slots: Object as PartSlots<
      typeof numberInputPrimitive,
      "scrub-area-cursor"
    >,
    setup() {
      // A scrub area outside its number input renders before that mounts, with no cursor yet.
      const numberInput = useScope(numberInputPrimitive)?.handle
      if (!numberInput) {
        return () => null
      }
      const cursor = usePart(
        numberInput,
        "scrub-area-cursor",
        undefined,
        undefined,
        "span"
      )
      return () => {
        const element = cursor()
        return element && h(Teleport, { to: "body" }, [element])
      }
    },
  })
)

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
