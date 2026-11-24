import type { ChangeDetails } from "@ui-sdk/core"
import {
  toggle as togglePrimitive,
  toggleGroup as toggleGroupPrimitive,
  type ToggleController,
  type ToggleGroupController,
  type ToggleGroupOrientation,
  type ToggleGroupValueChangeReason,
  type TogglePressedChangeReason,
} from "@ui-sdk/core/toggle"
import {
  defineComponent,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import { useToolbarScope } from "./toolbar-context"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  usePart,
  usePrimitive,
  type PartSlots,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(togglePrimitive, { icon: "span" })

// The group's own key, so a toggle can join a group without bundling it.
const ToggleGroupKey: InjectionKey<
  PrimitiveHandle<typeof toggleGroupPrimitive>
> = Symbol("toggle-group")

/**
 * A button that stays pressed. Inside a ToggleGroup, the group decides whether it's pressed.
 * @stable
 */
const Toggle = withElement(
  "button",
  defineComponent({
    name: "Toggle",
    inheritAttrs: false,
    props: {
      pressed: optionalBoolean,
      modelValue: optionalBoolean,
      defaultPressed: optionalBoolean,
      value: String,
      disabled: optionalBoolean,
      focusableWhenDisabled: optionalBoolean,
      controller: Object as PropType<ToggleController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:pressed": (_pressed: boolean) => true,
      "update:modelValue": (_pressed: boolean) => true,
      pressedChange: (
        _pressed: boolean,
        _details: ChangeDetails<TogglePressedChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof togglePrimitive, "root">,
    setup(props, { emit }) {
      const group = inject(ToggleGroupKey, null)
      const toolbar = useToolbarScope()
      const toggle = usePrimitive(togglePrimitive, () => ({
        pressed: orModel(props.pressed, props.modelValue),
        defaultPressed: props.defaultPressed,
        value: props.value,
        disabled: props.disabled,
        focusableWhenDisabled: props.focusableWhenDisabled,
        group: group ? () => group.api : undefined,
        toolbar: toolbar.value,
        controller: props.controller,
        debug: props.debug,
        onPressedChange: (
          pressed: boolean,
          details: ChangeDetails<TogglePressedChangeReason>
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("pressedChange", pressed, details)
          if (details.canceled) {
            return
          }
          emit("update:pressed", pressed)
          emit("update:modelValue", pressed)
        },
      }))
      return usePart(toggle, "root", undefined, undefined, "button")
    },
  })
)

/**
 * An icon inside a toggle. A toggle with only an icon needs an `aria-label`.
 * Screen readers skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const ToggleIcon = parts.Icon

/**
 * Toggles that share one value, with one tab stop and arrow keys between them.
 * @stable
 */
const ToggleGroup = /* @__PURE__ */ withElement(
  "div",
  /* @__PURE__ */ defineComponent({
    name: "ToggleGroup",
    inheritAttrs: false,
    props: {
      value: { type: Array as PropType<string[]>, default: undefined },
      modelValue: { type: Array as PropType<string[]>, default: undefined },
      defaultValue: { type: Array as PropType<string[]>, default: undefined },
      multiple: optionalBoolean,
      deselectable: optionalBoolean,
      disabled: optionalBoolean,
      orientation: String as PropType<ToggleGroupOrientation>,
      loop: optionalBoolean,
      controller: Object as PropType<ToggleGroupController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: string[]) => true,
      "update:modelValue": (_value: string[]) => true,
      valueChange: (
        _value: string[],
        _details: ChangeDetails<ToggleGroupValueChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof toggleGroupPrimitive, "group">,
    setup(props, { emit }) {
      const toolbar = useToolbarScope()
      const group = usePrimitive(toggleGroupPrimitive, () => ({
        toolbar: toolbar.value,
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        multiple: props.multiple,
        deselectable: props.deselectable,
        disabled: props.disabled,
        orientation: props.orientation,
        loop: props.loop,
        controller: props.controller,
        debug: props.debug,
        onValueChange: (
          value: string[],
          details: ChangeDetails<ToggleGroupValueChangeReason>
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
      provide(ToggleGroupKey, group)
      return usePart(group, "group", undefined, undefined, "div")
    },
  })
)

export {
  createToggleController,
  createToggleGroupController,
} from "@ui-sdk/core/toggle"
export type {
  ToggleApi,
  ToggleChangeOptions,
  ToggleController,
  ToggleGroupApi,
  ToggleGroupChangeOptions,
  ToggleGroupController,
  ToggleGroupOptions,
  ToggleGroupOrientation,
  ToggleGroupPrimitive,
  ToggleGroupState,
  ToggleGroupValueChangeReason,
  ToggleIconProps,
  ToggleIconState,
  ToggleOptions,
  TogglePressedChangeReason,
  TogglePrimitive,
  ToggleState,
} from "@ui-sdk/core/toggle"

export { Toggle, ToggleGroup, ToggleIcon }
