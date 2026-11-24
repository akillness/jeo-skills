import {
  toolbar as toolbarPrimitive,
  type ToolbarController,
  type ToolbarOrientation,
} from "@ui-sdk/core/toolbar"
import { computed, defineComponent, provide, useId, type PropType } from "vue"
import { ToolbarGroupKey, ToolbarKey } from "./toolbar-context"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  provideProps,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"

const parts = createParts(toolbarPrimitive, {
  button: "button",
  input: "input",
  link: "a",
  separator: "div",
})

/**
 * A row of controls with one tab stop and arrow keys between them. Toggles and
 * toggle groups inside join it. Render menu and select triggers through
 * `ToolbarButton`, and fields through `ToolbarInput`, with the `render` slot.
 * @stable
 */
const Toolbar = withElement(
  "div",
  defineComponent({
    name: "Toolbar",
    inheritAttrs: false,
    props: {
      orientation: String as PropType<ToolbarOrientation>,
      loop: optionalBoolean,
      disabled: optionalBoolean,
      controller: Object as PropType<ToolbarController>,
      debug: optionalBoolean,
    },
    slots: Object as PartSlots<typeof toolbarPrimitive, "root">,
    setup(props) {
      const toolbar = usePrimitive(toolbarPrimitive, () => ({
        orientation: props.orientation,
        loop: props.loop,
        disabled: props.disabled,
        controller: props.controller,
        debug: props.debug,
      }))
      // Toggles and toggle groups join it through this key, so they don't bundle the toolbar.
      provide(ToolbarKey, toolbar)
      return usePart(toolbar, "root", undefined, undefined, "div")
    },
  })
)

/**
 * A button in the toolbar. Arrow keys move between it and the toolbar's other items.
 * @stable
 */
const ToolbarButton = parts.Button

/**
 * A text field. Arrows move its caret, and leave it only from the end they point at.
 * @stable
 */
const ToolbarInput = parts.Input

/**
 * A link in the toolbar. Arrow keys move between it and the toolbar's other items.
 * @stable
 */
const ToolbarLink = parts.Link

/**
 * A group of related items in the toolbar. `disabled` disables every item in it.
 * @stable
 */
const ToolbarGroup = withElement(
  "div",
  defineComponent({
    name: "ToolbarGroup",
    inheritAttrs: false,
    props: { disabled: optionalBoolean },
    slots: Object as PartSlots<typeof toolbarPrimitive, "group">,
    setup(props) {
      const id = useId()
      const group = () => ({ id, disabled: props.disabled })
      // Its items take its `disabled`.
      provideProps(toolbarPrimitive, "group", group)
      const part = usePart(toolbarPrimitive, "group", group)
      // Toggles and toggle groups inside follow whether it's disabled, by itself or with the toolbar.
      const disabled = computed(() => part.state.disabled)
      provide(ToolbarGroupKey, () => disabled.value)
      return part
    },
  })
)

/**
 * A line between groups of items.
 * @stable
 */
const ToolbarSeparator = parts.Separator

export { createToolbarController } from "@ui-sdk/core/toolbar"
export type {
  ToolbarApi,
  ToolbarButtonProps,
  ToolbarButtonState,
  ToolbarController,
  ToolbarGroupProps,
  ToolbarGroupState,
  ToolbarInputProps,
  ToolbarInputState,
  ToolbarLinkState,
  ToolbarOptions,
  ToolbarOrientation,
  ToolbarPrimitive,
  ToolbarState,
  ToolbarSeparatorState,
} from "@ui-sdk/core/toolbar"

export {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarInput,
  ToolbarLink,
  ToolbarSeparator,
}
