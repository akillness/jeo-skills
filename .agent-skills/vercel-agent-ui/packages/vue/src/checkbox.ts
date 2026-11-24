import {
  checkbox as checkboxPrimitive,
  checkboxGroup as checkboxGroupPrimitive,
  type CheckboxCheckedChangeReason,
  type CheckboxController,
  type CheckboxGroupController,
  type CheckboxGroupValueChangeReason,
  type CheckedState,
} from "@ui-sdk/core/checkbox"
import type { ChangeDetails } from "@ui-sdk/core"
import {
  defineComponent,
  h,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import { useFieldControl } from "./field-context"
import { toggleProps } from "./toggle-props"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  usePart,
  usePrimitive,
  type PartSlots,
  type PrimitiveHandle,
} from "./use-primitive"
import { readOnlyOf } from "./text-control"

const parts = createParts(checkboxPrimitive, { indicator: "span" })

// The group's own key, so a checkbox can join a group without bundling it.
const CheckboxGroupKey: InjectionKey<
  PrimitiveHandle<typeof checkboxGroupPrimitive>
> = Symbol("checkbox-group")

/**
 * The control and the hidden native input that takes part in the form.
 * @stable
 */
const Checkbox = withElement(
  "button",
  defineComponent({
    name: "Checkbox",
    inheritAttrs: false,
    props: {
      checked: {
        type: [Boolean, String] as PropType<CheckedState>,
        default: undefined,
      },
      modelValue: {
        type: [Boolean, String] as PropType<CheckedState>,
        default: undefined,
      },
      defaultChecked: {
        type: [Boolean, String] as PropType<CheckedState>,
        default: undefined,
      },
      parent: optionalBoolean,
      controller: Object as PropType<CheckboxController>,
      ...toggleProps,
    },
    emits: {
      "update:checked": (_checked: CheckedState) => true,
      "update:modelValue": (_checked: CheckedState) => true,
      checkedChange: (
        _checked: CheckedState,
        _details: ChangeDetails<CheckboxCheckedChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof checkboxPrimitive, "root">,
    setup(props, { attrs, emit }) {
      const group = inject(CheckboxGroupKey, null)
      // Inside a group, the group is the field's control.
      const field = group ? null : useFieldControl()
      const checkbox = usePrimitive(checkboxPrimitive, () => ({
        parent: props.parent,
        group: group ? () => group.api : undefined,
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
          checked: CheckedState,
          details: ChangeDetails<CheckboxCheckedChangeReason>
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
      const root = usePart(checkbox, "root", undefined, undefined, {
        tag: "button",
        extend: field?.props,
      })
      return () => [root(), h("input", checkbox.slot("input"))]
    },
  })
)

/**
 * The check inside the checkbox. Rendered while it's checked or indeterminate, or always with `keepMounted`.
 * @stable
 */
const CheckboxIndicator = parts.Indicator

/**
 * Checkboxes that share a name and a list of checked values. The group, not
 * each checkbox, sits in a field.
 * @stable
 */
const CheckboxGroup = /* @__PURE__ */ withElement(
  "div",
  /* @__PURE__ */ defineComponent({
    name: "CheckboxGroup",
    inheritAttrs: false,
    props: {
      value: { type: Array as PropType<string[]>, default: undefined },
      modelValue: { type: Array as PropType<string[]>, default: undefined },
      defaultValue: { type: Array as PropType<string[]>, default: undefined },
      allValues: { type: Array as PropType<string[]>, default: undefined },
      readOnly: optionalBoolean,
      disabled: optionalBoolean,
      required: optionalBoolean,
      name: String,
      form: String,
      controller: Object as PropType<CheckboxGroupController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: string[]) => true,
      "update:modelValue": (_value: string[]) => true,
      valueChange: (
        _value: string[],
        _details: ChangeDetails<CheckboxGroupValueChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof checkboxGroupPrimitive, "group">,
    setup(props, { emit }) {
      const field = useFieldControl()
      const group = usePrimitive(checkboxGroupPrimitive, () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        allValues: props.allValues,
        readOnly: props.readOnly,
        disabled: props.disabled || field?.disabled(),
        required: props.required,
        name: props.name ?? field?.name(),
        form: props.form,
        controller: props.controller,
        debug: props.debug,
        onValueChange: (
          value: string[],
          details: ChangeDetails<CheckboxGroupValueChangeReason>
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
      provide(CheckboxGroupKey, group)
      const root = usePart(group, "group", undefined, undefined, {
        tag: "div",
        extend: field?.props,
      })
      return () => [root(), h("input", group.slot("group-input"))]
    },
  })
)

export {
  createCheckboxController,
  createCheckboxGroupController,
} from "@ui-sdk/core/checkbox"
export type {
  CheckboxApi,
  CheckboxChangeOptions,
  CheckboxCheckedChangeReason,
  CheckboxController,
  CheckboxGroupApi,
  CheckboxGroupChangeOptions,
  CheckboxGroupController,
  CheckboxGroupOptions,
  CheckboxGroupPrimitive,
  CheckboxGroupState,
  CheckboxGroupValueChangeReason,
  CheckboxIndicatorProps,
  CheckboxIndicatorState,
  CheckboxOptions,
  CheckboxPrimitive,
  CheckboxState,
  CheckedState,
} from "@ui-sdk/core/checkbox"

export { Checkbox, CheckboxGroup, CheckboxIndicator }
