import {
  select as selectPrimitive,
  type ListData,
  type SelectContentProps,
  type SelectContentState,
  type SelectEmptyState,
  type SelectItemIconProps,
  type SelectItemIconState,
  type SelectItemProps,
  type SelectItemState,
  type SelectItemTextState,
  type SelectOptions,
  type SelectSelectAllState,
  type SelectTriggerProps,
  type SelectTriggerState,
  type SelectValueProps,
  type SelectValueState,
} from "@ui-sdk/core/select"
import {
  selectAllKey,
  selectItemIcons,
  selectSelectAll,
} from "@ui-sdk/core/renderer"
import * as React from "react"
import {
  hasChild,
  learnLabels,
  notLabel,
  Placed,
  usePlaceContent,
  usePlacedContent,
} from "./children"
import { controlRender, useFieldControl } from "./field-context"
import { markSegments, textToMark } from "./list-text"
import {
  Connected,
  renderPopup,
  sheetViewport,
  useControllerEntry,
  useOwnContainer,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import {
  createParts,
  HandleScope,
  renderElement,
  useHandle,
  useAround,
  useNearest,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"
import { FormInputs } from "./form-inputs"
import { ListItems, type ListParts } from "./list-items"

const parts = createParts(selectPrimitive, {
  label: "div",
  input: "input",
  status: "div",
  item: "div",
  "item-indicator": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  clear: "button",
  arrow: "div",
})

const ContainerContext = React.createContext<PopupContainer>(undefined)

function useSelect() {
  return useHandle(selectPrimitive)
}

// Element props that mean something else on a select part.
type Clashing = "value" | "defaultValue" | "onChange" | "onSelect"

/**
 * The props of `Select`.
 * @stable
 */
type SelectProps<
  T = string,
  Multiple extends boolean | undefined = false,
> = SelectOptions<T, Multiple> & {
  children?: React.ReactNode
}

/**
 * Picks one value, or several, from a list in a popup.
 * `T` is inferred from `value`, `defaultValue`, `items` or `onValueChange`, and
 * `multiple` makes the value a list.
 * @stable
 */
function Select<T = string, Multiple extends boolean | undefined = false>({
  children,
  container,
  ...options
}: SelectProps<T, Multiple>) {
  const field = useFieldControl()
  const select = usePrimitive(selectPrimitive, {
    ...(options as SelectOptions<any, any>),
    name: options.name ?? field?.name,
    disabled: options.disabled || field?.disabled,
  })
  useControllerEntry(options.controller, select)
  learnLabels(select.api.internal, children, itemDecorations)
  // A data select renders its list, unless the app placed a SelectContent:
  // in the markup, or inside a component of its own.
  const found = hasChild(children, SelectContent)
  const [placed, place] = usePlacedContent(!!options.items && !found)
  const own = placed || found
  return (
    <HandleScope handle={select}>
      <ContainerContext.Provider value={container}>
        <Placed value={place}>{children}</Placed>
        <Placed value={null}>
          {options.items && !own && <SelectContent />}
        </Placed>
        <FormInputs handle={select} />
      </ContainerContext.Provider>
    </HandleScope>
  )
}

/**
 * A visible label for the select. Pressing it focuses the trigger, like a native select's label.
 * @stable
 */
const SelectLabel = parts.Label

/**
 * The button that opens the list: a combobox named by the label. Typing on it selects the item that matches.
 * @stable
 */
function SelectTrigger({
  disabled,
  controller,
  render,
  ...props
}: Omit<PartProps<"button", SelectTriggerState>, Clashing> &
  SelectTriggerProps) {
  const field = useFieldControl(props)
  const unconnected = () =>
    renderElement(
      "button",
      { type: "button", disabled, ...props },
      controlRender(field, "button", render),
      {
        open: false,
        disabled: !!disabled,
        readOnly: false,
        required: false,
        placeholder: true,
      }
    )
  return (
    <Connected
      primitive={selectPrimitive}
      controller={controller}
      fallback={unconnected}
    >
      <TriggerPart
        field={field}
        disabled={disabled}
        render={render}
        {...props}
      />
    </Connected>
  )
}

function TriggerPart({
  field,
  disabled,
  render,
  children = <SelectValue />,
  ...props
}: Omit<PartProps<"button", SelectTriggerState>, Clashing> &
  SelectTriggerProps & { field: ReturnType<typeof useFieldControl> }) {
  // Without content, the trigger shows the value.
  const element = {
    ...props,
    children,
    render: controlRender(field, "button", render),
  }
  return usePart(
    selectPrimitive,
    "trigger",
    { disabled, named: !!field || props["aria-labelledby"] != null },
    element,
    "button"
  )
}

const unselected: SelectValueState = {
  value: null,
  label: "",
  labels: [],
  placeholder: true,
}

/**
 * The selected item's label, or the placeholder. Renders it for you when it has no children.
 * @stable
 */
function SelectValue({
  placeholder,
  maxLabels,
  getMoreLabel,
  render,
  children,
  ...props
}: Omit<PartProps<"span", SelectValueState>, Clashing> & SelectValueProps) {
  // A trigger outside its select renders before the select it names has mounted.
  if (!useNearest(selectPrimitive)) {
    return renderElement(
      "span",
      { ...props, children: children ?? placeholder ?? null },
      render,
      unselected
    )
  }
  return (
    <ValuePart
      part={{ placeholder, maxLabels, getMoreLabel }}
      render={render}
      props={props}
    >
      {children}
    </ValuePart>
  )
}

function ValuePart({
  part,
  render,
  props,
  children,
}: {
  part: SelectValueProps
  render?: PartProps<"span", SelectValueState>["render"]
  props: Record<string, any>
  children?: PartProps<"span", SelectValueState>["children"]
}) {
  const select = useSelect()
  const { placeholder } = part
  const content = (state: SelectValueState) =>
    typeof children === "function"
      ? children(state)
      : (children ??
        (state.placeholder
          ? (placeholder ?? select.state.placeholder ?? null)
          : state.label))
  return usePart(
    select,
    "value",
    part,
    { ...props, children: content, render },
    "span"
  )
}

/**
 * The popup that holds the items, positioned against the trigger.
 * @stable
 */
function SelectContent({
  side,
  align,
  sideOffset,
  alignOffset,
  collisionPadding,
  arrowPadding,
  anchor,
  alignItemWithTrigger,
  keepMounted,
  container,
  render,
  children,
  ...props
}: PartProps<"div", SelectContentState> & SelectContentProps) {
  usePlaceContent()
  const select = useSelect()
  const target = usePopupContainer(useOwnContainer(container, ContainerContext))
  const content = {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    alignItemWithTrigger,
    keepMounted,
  }
  // Reading the part's state subscribes, so items that arrive after the
  // select rendered still render. `select.state` doesn't subscribe.
  const body = (state: SelectContentState) =>
    typeof children === "function"
      ? children(state)
      : (children ??
        (state.items && select.state.items && (
          <SelectItems items={state.items} />
        )))
  const element = usePart(select, "content", content, {
    ...props,
    children: body,
    render: sheetViewport(select, render),
  })
  return element && renderPopup(element, target)
}

/**
 * The listbox, when the content holds more than items, like a `SelectInput`. Without children, it renders the select's `items` that match.
 * @stable
 */
function SelectList({
  children = listItems,
  ...props
}: PartProps<"div", SelectContentState>) {
  return usePart(selectPrimitive, "list", {}, { ...props, children })
}

// From the part's state, so new items re-render the list. Without items it's empty.
const listItems = (state: SelectContentState) => (
  <SelectItems items={state.items} />
)

/**
 * A search field inside `SelectContent` that filters the list while focus stays in it. Put the items in a `SelectList`. Name it with `aria-label`.
 * @stable
 */
const SelectInput = parts.Input

/**
 * Shown while no item matches the search. Its message is announced when it appears.
 * @stable
 */
function SelectEmpty({
  children,
  ...props
}: PartProps<"div", SelectEmptyState>) {
  const content = (state: SelectEmptyState) =>
    typeof children === "function"
      ? children(state)
      : state.empty
        ? children
        : null
  return usePart(selectPrimitive, "empty", {}, { ...props, children: content })
}

/**
 * A polite live region for loading and result counts. Its content is yours, usually a function of its state.
 * @stable
 */
const SelectStatus = parts.Status

/**
 * An option. Pressing it selects it, or toggles it with `multiple`.
 * @stable
 */
const SelectItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", SelectItemState>, Clashing> & SelectItemProps<T>
) => React.ReactNode

/**
 * The item's text, with the part the search matched in `<mark>`. Without string content, it shows the item's label.
 * @stable
 */
function SelectItemText({
  children,
  ...props
}: PartProps<"span", SelectItemTextState>) {
  const item = useAround(selectPrimitive, "item")
  if (!item) {
    throw new Error("<SelectItemText> must be used inside <SelectItem>.")
  }
  const label = (item.label as string | undefined) ?? (item.value as string)
  const part = { id: item.value as string, text: textToMark(children, label) }
  const content =
    typeof children === "function"
      ? children
      : (state: SelectItemTextState) => markSegments(state.segments)
  return usePart(
    selectPrimitive,
    "item-text",
    part,
    { ...props, children: content },
    "span"
  )
}

/**
 * An option that selects every item that matches, with `multiple`: in its group inside a `SelectGroup`, or in the whole list.
 * @stable
 */
function SelectSelectAll({
  render,
  ...props
}: PartProps<"div", SelectSelectAllState>) {
  const select = useSelect()
  select.instance.use(selectSelectAll)
  const part = {
    id: selectAllKey(
      useAround(selectPrimitive, "group")?.id as string | undefined
    ),
  }
  return usePart(select, "select-all", part, { ...props, render }, "div")
}

/**
 * The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
 * @stable
 */
const SelectItemIndicator = parts.ItemIndicator

/**
 * An icon inside an item. `SelectValueIcon` shows the selected item's in the trigger. Screen
 * readers, typeahead and filtering skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const SelectItemIcon = /* @__PURE__ */ notLabel(function SelectItemIcon({
  mirror,
  render,
  ...props
}: PartProps<"span", SelectItemIconState> & SelectItemIconProps) {
  const select = useSelect()
  select.instance.use(selectItemIcons)
  const part = {
    id: React.useId(),
    mirror,
    item: useAround(selectPrimitive, "item")?.value as string | undefined,
  }
  return usePart(select, "item-icon", part, { ...props, render }, "span")
})

// Parts inside an item that aren't its label.
const itemDecorations = new Set<unknown>([SelectItemIndicator])

/**
 * The selected item's icon, copied from its `SelectItemIcon`, like before the value in the
 * trigger. Rendered while one item is selected and it has an icon.
 * @stable
 */
function SelectValueIcon(props: Omit<PartProps<"span">, "children">) {
  // A trigger outside its select renders before the select it names has mounted.
  return useNearest(selectPrimitive) ? <SelectValueIconPart {...props} /> : null
}

function SelectValueIconPart(props: Omit<PartProps<"span">, "children">) {
  const select = useSelect()
  select.instance.use(selectItemIcons)
  // Its content is a copy of the selected item's icon, which the core writes.
  return usePart(select, "value-icon", {}, props, "span")
}

/**
 * A group of items, named by its `SelectGroupLabel`, and hidden while none of its items shows.
 * @stable
 */
const SelectGroup = parts.Group

/**
 * The group's heading, which names the group.
 * @stable
 */
const SelectGroupLabel = parts.GroupLabel

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const SelectSeparator = parts.Separator

/**
 * A button that selects nothing. Shown while something is selected, or always with `keepMounted`.
 * @stable
 */
const SelectClear = parts.Clear

/**
 * An arrow on the popup's edge that points at the trigger.
 * @stable
 */
const SelectArrow = parts.Arrow

/**
 * Renders data items. Used by data selects, and available for custom layouts.
 * @stable
 */
function SelectItems({ items }: { items: ListData<unknown> }) {
  const select = useSelect()
  return (
    <ListItems
      items={items}
      parts={listParts}
      keyOf={select.api.internal.keyOf}
    />
  )
}

const listParts: ListParts = {
  Item: SelectItem,
  Group: SelectGroup,
  GroupLabel: SelectGroupLabel,
  Separator: SelectSeparator,
}

export { createSelectController } from "@ui-sdk/core/select"
// Core's `SelectValue` type ends in `Data` here, since the component has its name.
export type {
  ListAnnouncement,
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  MatchSegment,
  SelectApi,
  SelectArrowState,
  SelectChangeOptions,
  SelectClearProps,
  SelectClearState,
  SelectContentProps,
  SelectContentState,
  SelectController,
  SelectDismissReason,
  SelectEmptyState,
  SelectInputState,
  SelectItemIconProps,
  SelectItemIconState,
  SelectItemIndicatorProps,
  SelectItemIndicatorState,
  SelectItemProps,
  SelectItemState,
  SelectItemTextState,
  SelectOpenChangeReason,
  SelectOptions,
  SelectPrimitive,
  SelectQueryChangeReason,
  SelectSelectAllState,
  SelectStatusState,
  SelectTriggerProps,
  SelectTriggerState,
  SelectValue as SelectValueData,
  SelectValueChangeReason,
  SelectValueProps,
  SelectValueState,
} from "@ui-sdk/core/select"

export {
  Select,
  SelectArrow,
  SelectClear,
  SelectContent,
  SelectEmpty,
  SelectGroup,
  SelectGroupLabel,
  SelectInput,
  SelectItem,
  SelectItemIcon,
  SelectItemIndicator,
  SelectItems,
  SelectItemText,
  SelectLabel,
  SelectList,
  type SelectProps,
  SelectSelectAll,
  SelectSeparator,
  SelectStatus,
  SelectTrigger,
  SelectValue,
  SelectValueIcon,
}
