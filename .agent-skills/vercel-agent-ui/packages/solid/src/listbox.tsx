import {
  listbox as listboxPrimitive,
  type ListData,
  type ListboxItemProps,
  type ListboxItemState,
  type ListboxOptions,
  type ListboxState,
} from "@ui-sdk/core/listbox"
import type { JSX } from "@solidjs/web"
import { merge, omit } from "solid-js"
import { joinField, useFieldControl } from "./field-context"
import { formInputs } from "./form-inputs"
import { ListItems, type ListParts } from "./list-items"
import {
  createParts,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(listboxPrimitive, {
  item: "div",
  "item-indicator": "span",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
})

// Element props that mean something else on a listbox part.
type Clashing = "value" | "onChange" | "onSelect"

/**
 * The props of `Listbox`.
 * @stable
 */
type ListboxProps<
  T = string,
  Multiple extends boolean | undefined = false,
> = Omit<PartProps<"div", ListboxState>, Clashing | keyof ListboxOptions> &
  ListboxOptions<T, Multiple> & {}

const optionKeys = [
  "value",
  "defaultValue",
  "onValueChange",
  "multiple",
  "activation",
  "deselectable",
  "orientation",
  "loop",
  "virtualFocus",
  "keepInView",
  "items",
  "itemToValue",
  "isItemEqualToValue",
  "onHighlight",
  "disabled",
  "readOnly",
  "required",
  "name",
  "form",
  "controller",
  "debug",
] as const

/**
 * An always-visible list to choose one option from, or several.
 * `T` is inferred from `value`, `defaultValue`, `items` or `onValueChange`, and
 * `multiple` makes the value a list.
 * @stable
 */
const Listbox = /* @__PURE__ */ rootScope(function Listbox<
  T = string,
  Multiple extends boolean | undefined = false,
>(props: ListboxProps<T, Multiple>) {
  const field = useFieldControl(props)
  // Typed loosely: the union `Multiple` picks is too large for `omit`.
  const loose = props as ListboxProps<any, boolean>
  const options = omit(loose, "render", "class", "style", "children")
  const listbox = usePrimitive(listboxPrimitive, () => ({
    ...options,
    name: props.name ?? field?.name(),
    disabled: props.disabled || field?.disabled(),
  }))
  const rest = merge(omit(loose, ...optionKeys), {
    // Without content, a data listbox renders its items.
    get children() {
      return (
        props.children ??
        ((state: ListboxState) =>
          props.items && <ListboxItems items={state.items} />)
      )
    },
  })
  return (
    <>
      {usePart(
        listbox,
        "root",
        undefined,
        joinField(field, rest, "div"),
        "div"
      )}
      {formInputs(listbox, () => props.multiple)}
    </>
  )
})

/**
 * An option. Pressing it selects it, or toggles it with `multiple`.
 * @stable
 */
const ListboxItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", ListboxItemState>, Clashing> &
    ListboxItemProps<T>
) => JSX.Element

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
function ListboxItems(props: { items: ListData<unknown> }) {
  return <ListItems items={props.items} parts={listParts} />
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
