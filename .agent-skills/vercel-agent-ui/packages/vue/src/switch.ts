import type { ChangeDetails } from "@ui-sdk/core"
import {
  switchPrimitive,
  type SwitchCheckedChangeReason,
  type SwitchController,
} from "@ui-sdk/core/switch"
import { defineComponent, h, type PropType } from "vue"
import { useFieldControl } from "./field-context"
import { toggleProps } from "./toggle-props"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"
import { readOnlyOf } from "./text-control"

const parts = createParts(switchPrimitive, { thumb: "span" })

/**
 * A control that turns a setting on or off, with the hidden native input that takes part in the form.
 * @stable
 */
const Switch = withElement(
  "button",
  defineComponent({
    name: "Switch",
    inheritAttrs: false,
    props: {
      checked: optionalBoolean,
      modelValue: optionalBoolean,
      defaultChecked: optionalBoolean,
      controller: Object as PropType<SwitchController>,
      ...toggleProps,
    },
    emits: {
      "update:checked": (_checked: boolean) => true,
      "update:modelValue": (_checked: boolean) => true,
      checkedChange: (
        _checked: boolean,
        _details: ChangeDetails<SwitchCheckedChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof switchPrimitive, "root">,
    setup(props, { attrs, emit }) {
      const field = useFieldControl()
      const control = usePrimitive(switchPrimitive, () => ({
        checked: orModel(props.checked, props.modelValue),
        defaultChecked: props.defaultChecked,
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        required: props.required,
        name: props.name ?? field?.name(),
        value: props.value,
        form: props.form,
        controller: props.controller,
        debug: props.debug,
        onCheckedChange: (
          checked: boolean,
          details: ChangeDetails<SwitchCheckedChangeReason>
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("checkedChange", checked, details)
          if (details.canceled) {
            return
          }
          emit("update:checked", checked)
          emit("update:modelValue", checked)
        },
      }))
      const root = usePart(control, "root", undefined, undefined, {
        tag: "button",
        extend: field?.props,
      })
      return () => [root(), h("input", control.slot("input"))]
    },
  })
)

/**
 * The thumb that slides along the switch as it turns on or off.
 * @stable
 */
const SwitchThumb = parts.Thumb

export { createSwitchController } from "@ui-sdk/core/switch"
export type {
  SwitchApi,
  SwitchCheckedChangeReason,
  SwitchController,
  SwitchOptions,
  SwitchPrimitive,
  SwitchState,
  SwitchThumbState,
} from "@ui-sdk/core/switch"

export { Switch, SwitchThumb }
