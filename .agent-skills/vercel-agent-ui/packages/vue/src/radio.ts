import type { ChangeDetails } from "@ui-sdk/core"
import {
  radioGroup as radioGroupPrimitive,
  type RadioGroupController,
  type RadioGroupValueChangeReason,
} from "@ui-sdk/core/radio"
import {
  defineComponent,
  h,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import { withElement } from "./create-parts"
import { type FieldContext, FieldKey, useFieldControl } from "./field-context"
import {
  optionalBoolean,
  orModel,
  provideProps,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"
import { readOnlyOf } from "./text-control"

// The field the group joined, so a radio joins only a field of its own.
const GroupFieldKey: InjectionKey<FieldContext | null> =
  Symbol("radio-group-field")

/**
 * Radios that share one value, with one tab stop and arrow keys between them.
 * @stable
 */
const RadioGroup = withElement(
  "div",
  defineComponent({
    name: "RadioGroup",
    inheritAttrs: false,
    props: {
      value: { type: String as PropType<string | null>, default: undefined },
      modelValue: {
        type: String as PropType<string | null>,
        default: undefined,
      },
      defaultValue: {
        type: String as PropType<string | null>,
        default: undefined,
      },
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      required: optionalBoolean,
      name: String,
      form: String,
      loop: optionalBoolean,
      controller: Object as PropType<RadioGroupController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: string | null) => true,
      "update:modelValue": (_value: string | null) => true,
      valueChange: (
        _value: string | null,
        _details: ChangeDetails<RadioGroupValueChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof radioGroupPrimitive, "group">,
    setup(props, { attrs, emit }) {
      provide(GroupFieldKey, inject(FieldKey, null))
      const field = useFieldControl()
      const group = usePrimitive(radioGroupPrimitive, () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        required: props.required,
        name: props.name ?? field?.name(),
        form: props.form,
        loop: props.loop,
        controller: props.controller,
        debug: props.debug,
        onValueChange: (
          value: string | null,
          details: ChangeDetails<RadioGroupValueChangeReason>
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
      }))
      return usePart(group, "group", undefined, undefined, {
        tag: "div",
        extend: field?.props,
      })
    },
  })
)

/**
 * A radio and the hidden native radio that takes part in the form.
 * @stable
 */
const Radio = withElement(
  "button",
  defineComponent({
    name: "Radio",
    inheritAttrs: false,
    props: {
      value: { type: String, required: true },
      disabled: optionalBoolean,
    },
    slots: Object as PartSlots<typeof radioGroupPrimitive, "root">,
    setup(props) {
      const group = useScope(radioGroupPrimitive)?.handle
      if (!group) {
        throw new Error("Radio group parts must be used inside <RadioGroup>.")
      }
      // A radio in a field of its own is that field's control. In the group's field, the group is.
      const nearest = inject(FieldKey, null)
      const field =
        nearest && nearest !== inject(GroupFieldKey, null)
          ? useFieldControl()
          : null
      const item = () => ({
        value: props.value,
        disabled: props.disabled || field?.disabled(),
      })
      provideProps(radioGroupPrimitive, "root", item)
      const radio = usePart(group, "root", item, undefined, {
        tag: "button",
        extend: field?.props,
      })
      return () => [radio(), h("input", group.slot("input", item()))]
    },
  })
)

/**
 * The dot inside the radio. Rendered while it's checked, or always with `keepMounted`.
 * @stable
 */
const RadioIndicator = withElement(
  "span",
  defineComponent({
    name: "RadioIndicator",
    inheritAttrs: false,
    props: { keepMounted: optionalBoolean },
    slots: Object as PartSlots<typeof radioGroupPrimitive, "indicator">,
    setup(props) {
      const radio = useScope(radioGroupPrimitive)?.around.root
      if (!radio) {
        throw new Error("RadioIndicator must be used inside <Radio>.")
      }
      const indicator = () => ({
        value: String(radio().value),
        keepMounted: props.keepMounted,
      })
      return usePart(
        radioGroupPrimitive,
        "indicator",
        indicator,
        undefined,
        "span"
      )
    },
  })
)

export { createRadioGroupController } from "@ui-sdk/core/radio"
export type {
  RadioGroupApi,
  RadioGroupChangeOptions,
  RadioGroupController,
  RadioGroupOptions,
  RadioGroupPrimitive,
  RadioGroupState,
  RadioGroupValueChangeReason,
  RadioIndicatorProps,
  RadioIndicatorState,
  RadioProps,
  RadioState,
} from "@ui-sdk/core/radio"

export { Radio, RadioGroup, RadioIndicator }
