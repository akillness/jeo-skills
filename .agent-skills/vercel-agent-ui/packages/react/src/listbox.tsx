import {
  listbox as listboxPrimitive,
  type ListData,
  type ListboxItemProps,
  type ListboxItemState,
  type ListboxOptions,
  type ListboxState,
} from "@ui-sdk/core/listbox"
import * as React from "react"
import { controlRender, useFieldControl } from "./field-context"
import {
  createParts,
  useHandle,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"
import { FormInputs } from "./form-inputs"
import { ListItems, type ListParts } from "./list-items"

const parts = createParts(listboxPrimitive, {
  item: "div",
  "item-indicator": "span",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
})

function useListbox() {
  return useHandle(listboxPrimitive)
}

// Element props that mean something else on a listbox part.
type Clashing = "value" | "defaultValue" | "onChange" | "onSelect"

/**
 * The props of `Listbox`.
 * @stable
 */
type ListboxProps<
  T = string,
  Multiple extends boolean | undefined = false,
> = Omit<PartProps<"div", ListboxState>, Clashing | keyof ListboxOptions> &
  ListboxOptions<T, Multiple> & {}

/**
 * An always-visible list to choose one option from, or several.
 * `T` is inferred from `value`, `defaultValue`, `items` or `onValueChange`, and
 * `multiple` makes the value a list.
 * @stable
 */
function Listbox<T = string, Multiple extends boolean | undefined = false>({
  value,
  defaultValue,
  onValueChange,
  multiple,
  activation,
  deselectable,
  orientation,
  loop,
  virtualFocus,
  keepInView,
  items,
  itemToValue,
  isItemEqualToValue,
  onHighlight,
  disabled,
  readOnly,
  required,
  name,
  form,
  controller,
  debug,
  render,
  children,
  ...props
}: ListboxProps<T, Multiple>) {
  const field = useFieldControl(props)
  const listbox = usePrimitive(listboxPrimitive, {
    value,
    defaultValue,
    onValueChange,
    multiple,
    activation,
    deselectable,
    orientation,
    loop,
    virtualFocus,
    keepInView,
    items,
    itemToValue,
    isItemEqualToValue,
    onHighlight,
    readOnly,
    required,
    form,
    controller,
    debug,
    name: name ?? field?.name,
    disabled: disabled || field?.disabled,
  } as ListboxOptions<any, any>)
  // Without children, a data listbox renders its items.
  const content = (state: ListboxState) =>
    typeof children === "function"
      ? children(state)
      : (children ?? (items && <ListboxItems items={state.items} />))
  // The props left once the options are taken out, which TypeScript can't see for every `Multiple`.
  const element = props as PartProps<"div", ListboxState>
  const root = {
    ...element,
    children: content,
    render: controlRender(field, "div", render),
  }
  return (
    <>
      {usePart(listbox, "root", {}, root)}
      <FormInputs handle={listbox} />
    </>
  )
}

/**
 * An option. Pressing it selects it, or toggles it with `multiple`.
 * @stable
 */
const ListboxItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", ListboxItemState>, Clashing> &
    ListboxItemProps<T>
) => React.ReactNode

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
function ListboxItems({ items }: { items: ListData<unknown> }) {
  const listbox = useListbox()
  return (
    <ListItems
      items={items}
      parts={listParts}
      keyOf={listbox.api.internal.keyOf}
    />
  )
}

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
  type ListboxProps,
  ListboxSeparator,
}
