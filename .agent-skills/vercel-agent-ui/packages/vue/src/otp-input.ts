import type { ChangeDetails, CommitDetails } from "@ui-sdk/core"
import {
  otpInput as otpInputPrimitive,
  type OTPInputController,
  type OTPInputOptions,
  type OTPInputPattern,
  type OTPInputValueChangeReason,
} from "@ui-sdk/core/otp-input"
import { defineComponent, h, type PropType } from "vue"
import { slotContent } from "./children"
import { useFieldControl } from "./field-context"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  useHandle,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"
import { readOnlyOf } from "./text-control"

const parts = createParts(otpInputPrimitive, { group: "div", separator: "div" })

// Attributes that belong to the input, which is what takes focus and is named.
const inputAttributes = [
  "id",
  "autofocus",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-invalid",
]

/**
 * The root: the slots, and the one real input over them. `id`, `autofocus`
 * and the `aria-*` naming attributes go to that input.
 * @stable
 */
const OTPInput = withElement(
  "div",
  defineComponent({
    name: "OTPInput",
    inheritAttrs: false,
    props: {
      value: { type: String, default: undefined },
      modelValue: { type: String, default: undefined },
      defaultValue: { type: String, default: undefined },
      maxLength: Number,
      pattern: [String, RegExp] as PropType<OTPInputPattern>,
      inputMode: String as PropType<OTPInputOptions["inputMode"]>,
      textAlign: String as PropType<OTPInputOptions["textAlign"]>,
      autoComplete: String,
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      required: optionalBoolean,
      name: String,
      form: String,
      controller: Object as PropType<OTPInputController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: string) => true,
      "update:modelValue": (_value: string) => true,
      valueChange: (
        _value: string,
        _details: ChangeDetails<OTPInputValueChangeReason>
      ) => true,
      valueCommit: (
        _value: string,
        _details: CommitDetails<OTPInputValueChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof otpInputPrimitive, "root">,
    setup(props, { slots, attrs, emit }) {
      const field = useFieldControl()
      const otp = usePrimitive(otpInputPrimitive, () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        maxLength: props.maxLength,
        pattern: props.pattern,
        inputMode: props.inputMode,
        textAlign: props.textAlign,
        autoComplete: props.autoComplete,
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        required: props.required,
        name: props.name ?? field?.name(),
        form: props.form,
        controller: props.controller,
        debug: props.debug,
        onValueChange: (
          value: string,
          details: ChangeDetails<OTPInputValueChangeReason>
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
          value: string,
          details: CommitDetails<OTPInputValueChangeReason>
        ) => emit("valueCommit", value, details),
      }))
      // The input's attributes go to it, and the rest to the root.
      let named: Record<string, unknown> = {}
      const own = () => {
        const rest: Record<string, unknown> = {}
        named = {}
        for (const [key, value] of Object.entries(attrs)) {
          ;(inputAttributes.includes(key) ? named : rest)[key] = value
        }
        return rest
      }
      return usePart(otp, "root", undefined, own, {
        tag: "div",
        children: (state) => {
          const input = otp.slot("control", {}, named)
          return [
            slots.default?.({ state }),
            h("input", field ? field.props(input) : input),
          ]
        },
      })
    },
  })
)

/**
 * Lays out a run of slots.
 * @stable
 */
const OTPInputGroup = parts.Group
/**
 * Drawn between groups, like a dash.
 * @stable
 */
const OTPInputSeparator = parts.Separator

/**
 * One character of the code. Without content, it shows the character.
 * @stable
 */
const OTPInputSlot = withElement(
  "div",
  defineComponent({
    name: "OTPInputSlot",
    inheritAttrs: false,
    props: { index: { type: Number, required: true } },
    slots: Object as PartSlots<typeof otpInputPrimitive, "slot">,
    setup(props, { slots }) {
      const part = () => ({ index: props.index, id: String(props.index) })
      return usePart(useHandle(otpInputPrimitive), "slot", part, undefined, {
        tag: "div",
        children: (state) =>
          slotContent(slots.default, { state }) ?? state.char,
      })
    },
  })
)

export { createOTPInputController } from "@ui-sdk/core/otp-input"
export type {
  OTPInputApi,
  OTPInputChangeOptions,
  OTPInputController,
  OTPInputOptions,
  OTPInputPattern,
  OTPInputSlotData,
  OTPInputSlotProps,
  OTPInputSlotState,
  OTPInputState,
  OTPInputValueChangeReason,
  OtpInputPrimitive,
} from "@ui-sdk/core/otp-input"

export { OTPInput, OTPInputGroup, OTPInputSeparator, OTPInputSlot }
