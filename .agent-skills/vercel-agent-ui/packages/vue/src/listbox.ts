import type { ChangeDetails } from "@ui-sdk/core"
import {
  listbox as listboxPrimitive,
  type ListData,
  type ListHighlightDetails,
  type ListboxOptions,
  type ListboxState,
  type ListboxController,
  type ListboxValueChangeReason,
} from "@ui-sdk/core/listbox"
import { defineComponent, h, type PropType } from "vue"
import { slotContent } from "./children"
import { useFieldControl } from "./field-context"
import { ListItems, type ListParts } from "./list-items"
import {
  createParts,
  type RenderableWith,
  type RootInstanceOf,
  type RootPropsOf,
} from "./create-parts"
import {
  optionalBoolean,
  orModel,
  useHandle,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"
import { FormInputs } from "./form-inputs"
import { readOnlyOf } from "./text-control"

type ValueDetails = ChangeDetails<ListboxValueChangeReason>

const useListbox = () => useHandle(listboxPrimitive)

const parts = createParts(listboxPrimitive, {
  item: "div",
  "item-indicator": "span",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
})

// Any value, including objects and null. Undefined means not passed.
const anyValue = { type: null as unknown as PropType<unknown> }

// Generic over the value, like React's `Listbox<T>`: `v-model`, `@value-change`
// and the items share `T`. One shape per `multiple`, so the value is a list
// only with it, and a `multiple` known only at run time takes either.
type ListboxProps<T, Multiple extends boolean | undefined> = ListboxOptions<
  T,
  Multiple
> & {
  multiple?: Multiple
}
type ListboxComponent = {
  new <T = string>(
    props: RootPropsOf<ListboxProps<T, false>, "div">
  ): RootInstanceOf<ListboxProps<T, false>, ListboxState, "div">
  new <T = string>(
    props: RootPropsOf<ListboxProps<T, true>, "div">
  ): RootInstanceOf<ListboxProps<T, true>, ListboxState, "div">
  new <T = string, Multiple extends boolean | undefined = boolean>(
    props: RootPropsOf<
      ListboxProps<T, Multiple> & { multiple: Multiple },
      "div"
    >
  ): RootInstanceOf<ListboxProps<T, Multiple>, ListboxState, "div">
} & RenderableWith<ListboxProps<any, boolean | undefined>, ListboxState, "div">

/**
 * An always-visible list to choose one option from, or several with `multiple`.
 * @stable
 */
const Listbox = defineComponent({
  name: "Listbox",
  inheritAttrs: false,
  props: {
    value: anyValue,
    modelValue: anyValue,
    defaultValue: anyValue,
    multiple: optionalBoolean,
    activation: String as PropType<"automatic" | "manual">,
    deselectable: optionalBoolean,
    orientation: String as PropType<"horizontal" | "vertical">,
    loop: optionalBoolean,
    virtualFocus: optionalBoolean,
    keepInView: optionalBoolean,
    items: Array as PropType<ListData<any>>,
    itemToValue: Function as PropType<(value: any) => string>,
    isItemEqualToValue: Function as PropType<
      (itemValue: any, value: any) => boolean
    >,
    disabled: optionalBoolean,
    readOnly: optionalBoolean,
    required: optionalBoolean,
    name: String,
    form: String,
    controller: Object as PropType<ListboxController<any, any>>,
    debug: optionalBoolean,
  },
  emits: {
    "update:value": (_value: unknown) => true,
    "update:modelValue": (_value: unknown) => true,
    valueChange: (_value: unknown, _details: ValueDetails) => true,
    highlight: (_value: unknown, _details: ListHighlightDetails) => true,
  },
  slots: Object as PartSlots<typeof listboxPrimitive, "root">,
  setup(props, { slots, emit, attrs }) {
    const field = useFieldControl(attrs)
    const listbox = usePrimitive(listboxPrimitive, () => ({
      ...props,
      value: orModel(props.value, props.modelValue),
      name: props.name ?? field?.name(),
      disabled: props.disabled || field?.disabled(),
      readOnly: readOnlyOf(props, attrs),
      onValueChange: (value: unknown, details: ValueDetails) => {
        // The change event runs first, so canceling it also keeps v-model as it was.
        emit("valueChange", value, details)
        if (details.canceled) {
          return
        }
        emit("update:value", value)
        emit("update:modelValue", value)
      },
      onHighlight: (value: unknown, details: ListHighlightDetails) =>
        emit("highlight", value, details),
    }))
    const root = usePart(listbox, "root", undefined, undefined, {
      tag: "div",
      // Without content, a data listbox renders its items.
      children: (state) =>
        slotContent(slots.default, { state }) ??
        (props.items && h(ListboxItems, { items: state.items })),
      extend: field?.props,
    })
    return () => [root(), h(FormInputs, { handle: listbox })]
  },
}) as unknown as ListboxComponent

/**
 * An option. Pressing it selects it, or toggles it with `multiple`.
 * @stable
 */
const ListboxItem = parts.Item

/**
 * The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
 * @stable
 */
const ListboxItemIndicator = parts.ItemIndicator

/**
 * An icon inside an item. Screen readers and typeahead skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const ListboxItemIcon = parts.ItemIcon

/**
 * A group of items, named by its `ListboxGroupLabel`.
 * @stable
 */
const ListboxGroup = parts.Group

/**
 * The group's heading, which names the group.
 * @stable
 */
const ListboxGroupLabel = parts.GroupLabel

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const ListboxSeparator = parts.Separator

/**
 * Renders data items. Used by data listboxes, and available for custom layouts.
 * @stable
 */
const ListboxItems = defineComponent({
  name: "ListboxItems",
  props: {
    items: { type: Array as PropType<ListData<unknown>>, required: true },
  },
  setup(props) {
    const listbox = useListbox()
    return () =>
      h(ListItems, {
        items: props.items,
        parts: listParts,
        keyOf: listbox.api.internal.keyOf,
      })
  },
})

const listParts: ListParts = {
  Item: ListboxItem,
  Group: ListboxGroup,
  GroupLabel: ListboxGroupLabel,
  Separator: ListboxSeparator,
}

export { createListboxController } from "@ui-sdk/core/listbox"
export type {
  ListData,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  ListboxApi,
  ListboxChangeOptions,
  ListboxController,
  ListboxItemIconProps,
  ListboxItemIconState,
  ListboxItemIndicatorProps,
  ListboxItemIndicatorState,
  ListboxItemProps,
  ListboxItemState,
  ListboxOptions,
  ListboxPrimitive,
  ListboxState,
  ListboxValue,
  ListboxValueChangeReason,
} from "@ui-sdk/core/listbox"

export {
  Listbox,
  ListboxGroup,
  ListboxGroupLabel,
  ListboxItem,
  ListboxItemIcon,
  ListboxItemIndicator,
  ListboxItems,
  ListboxSeparator,
}
