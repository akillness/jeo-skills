import {
  combobox as comboboxPrimitive,
  type ComboboxChipProps,
  type ComboboxChipState,
  type ComboboxChipsOverflowState,
  type ComboboxClearState,
  type ComboboxContentProps,
  type ComboboxContentState,
  type ComboboxCreateProps,
  type ComboboxCreateState,
  type ComboboxEmptyState,
  type ComboboxInputState,
  type ComboboxItemIconProps,
  type ComboboxItemIconState,
  type ComboboxItemProps,
  type ComboboxItemState,
  type ComboboxItemTextState,
  type ComboboxOptions,
  type ComboboxSelectAllState,
  type ComboboxValueProps,
  type ComboboxValueState,
  type ListData,
} from "@ui-sdk/core/combobox"
import {
  comboboxChips,
  comboboxCreate,
  comboboxItemIcons,
  comboboxSelectAll,
  selectAllKey,
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
  renderPopup,
  SheetHeaderContext,
  inSheetHeader,
  sheetHeader,
  sheetViewport,
  useControllerEntry,
  useOwnContainer,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import {
  createParts,
  HandleScope,
  useAround,
  useHandle,
  useNearest,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"
import { FormInputs } from "./form-inputs"
import { ListItems, type ListParts } from "./list-items"

const parts = createParts(comboboxPrimitive, {
  label: "label",
  trigger: "button",
  item: "div",
  "item-indicator": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  status: "div",
  clear: "button",
  arrow: "div",
})

const ContainerContext = React.createContext<PopupContainer>(undefined)
const ChipContext = React.createContext<{ value: unknown } | null>(null)

function useCombobox() {
  return useHandle(comboboxPrimitive)
}

type Clashing = "value" | "defaultValue" | "onChange" | "onSelect"

/**
 * The props of `Combobox`.
 * @stable
 */
type ComboboxProps<
  T = string,
  Multiple extends boolean | undefined = false,
> = ComboboxOptions<T, Multiple> & {
  children?: React.ReactNode
}

/**
 * A text input that filters a list as you type.
 * `T` is inferred from `value`, `defaultValue`, `items` or `onValueChange`, and
 * `multiple` makes the value a list.
 * @stable
 */
function Combobox<T = string, Multiple extends boolean | undefined = false>({
  children,
  container,
  ...options
}: ComboboxProps<T, Multiple>) {
  const field = useFieldControl()
  const combobox = usePrimitive(comboboxPrimitive, {
    ...(options as ComboboxOptions<any, any>),
    name: options.name ?? field?.name,
    disabled: options.disabled || field?.disabled,
  })
  useControllerEntry(options.controller, combobox)
  learnLabels(combobox.api.internal, children, itemDecorations)
  const header = React.useState<HTMLElement | null>(null)
  // A data combobox renders its list, unless the app placed a ComboboxContent:
  // in the markup, or inside a component of its own.
  const found = hasChild(children, ComboboxContent)
  const [placed, place] = usePlacedContent(!!options.items && !found)
  const own = placed || found
  return (
    <HandleScope handle={combobox}>
      <ContainerContext.Provider value={container}>
        <SheetHeaderContext.Provider value={header}>
          <Placed value={place}>{children}</Placed>
          <Placed value={null}>
            {options.items && !own && <ComboboxContent />}
          </Placed>
          <FormInputs handle={combobox} />
        </SheetHeaderContext.Provider>
      </ContainerContext.Provider>
    </HandleScope>
  )
}

/**
 * A visible label for the input.
 * @stable
 */
const ComboboxLabel = parts.Label

/**
 * The text input that filters the list and holds the chosen item's label.
 * @stable
 */
function ComboboxInput({
  render,
  ...props
}: Omit<
  PartProps<"input", ComboboxInputState>,
  "value" | "defaultValue" | "children" | "readOnly"
>) {
  const [header] = React.useContext(SheetHeaderContext)
  const element = {
    ...props,
    render: controlRender(useFieldControl(props), "input", render),
  }
  // While the popup presents as a sheet, the input renders in its header.
  const input = usePart(comboboxPrimitive, "input", {}, element, "input")
  return input && inSheetHeader(input, header)
}

/**
 * A button that opens and closes the list, out of the tab order.
 * @stable
 */
const ComboboxTrigger = parts.Trigger

/**
 * The popup that holds the list, positioned against the input.
 * @stable
 */
function ComboboxContent({
  side,
  align,
  sideOffset,
  alignOffset,
  collisionPadding,
  arrowPadding,
  anchor,
  keepMounted,
  container,
  render,
  children,
  ...props
}: PartProps<"div", ComboboxContentState> & ComboboxContentProps) {
  usePlaceContent()
  const combobox = useCombobox()
  const target = usePopupContainer(useOwnContainer(container, ContainerContext))
  const content = {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    keepMounted,
  }
  const [, setHeader] = React.useContext(SheetHeaderContext)
  // Reading the part's state subscribes, so items that arrive after the
  // combobox rendered still render the list. `combobox.state` doesn't subscribe.
  const body = (state: ComboboxContentState) => (
    <>
      {sheetHeader(combobox, setHeader)}
      {typeof children === "function"
        ? children(state)
        : (children ??
          (state.items && combobox.state.items && <ComboboxList />))}
    </>
  )
  const element = usePart(combobox, "content", content, {
    ...props,
    children: body,
    render: sheetViewport(combobox, render),
  })
  return element && renderPopup(element, target)
}

/**
 * The listbox. Without children, it renders the combobox's `items`, filtered.
 * @stable
 */
function ComboboxList({
  children = listItems,
  ...props
}: PartProps<"div", ComboboxContentState>) {
  return usePart(comboboxPrimitive, "list", {}, { ...props, children })
}

// From the part's state, so new items re-render the list. Without items it's empty.
const listItems = (state: ComboboxContentState) => (
  <ComboboxItems items={state.items} />
)

/**
 * An option. Pressing it selects it, or toggles it with `multiple`.
 * @stable
 */
const ComboboxItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", ComboboxItemState>, Clashing> &
    ComboboxItemProps<T>
) => React.ReactNode

/**
 * The item's text, with the part the input's text matched in `<mark>`. Without string content, it shows the item's label.
 * @stable
 */
function ComboboxItemText({
  children,
  ...props
}: PartProps<"span", ComboboxItemTextState>) {
  const item = useAround(comboboxPrimitive, "item")
  if (!item) {
    throw new Error("<ComboboxItemText> must be used inside <ComboboxItem>.")
  }
  const label = (item.label as string | undefined) ?? (item.value as string)
  const part = { id: item.value as string, text: textToMark(children, label) }
  const content =
    typeof children === "function"
      ? children
      : (state: ComboboxItemTextState) => markSegments(state.segments)
  return usePart(
    comboboxPrimitive,
    "item-text",
    part,
    { ...props, children: content },
    "span"
  )
}

/**
 * An option that selects every item that matches, with `multiple`: in its group inside a `ComboboxGroup`, or in the whole list.
 * @stable
 */
function ComboboxSelectAll({
  render,
  ...props
}: PartProps<"div", ComboboxSelectAllState>) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxSelectAll)
  const part = {
    id: selectAllKey(
      useAround(comboboxPrimitive, "group")?.id as string | undefined
    ),
  }
  return usePart(combobox, "select-all", part, { ...props, render }, "div")
}

/**
 * The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
 * @stable
 */
const ComboboxItemIndicator = parts.ItemIndicator

// Parts inside an item that aren't its label.
const itemDecorations = new Set<unknown>([ComboboxItemIndicator])

/**
 * An icon inside an item. `ComboboxValueIcon` shows the selected item's next to the input. Screen
 * readers, typeahead and filtering skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
const ComboboxItemIcon = /* @__PURE__ */ notLabel(function ComboboxItemIcon({
  mirror,
  render,
  ...props
}: PartProps<"span", ComboboxItemIconState> & ComboboxItemIconProps) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxItemIcons)
  const part = {
    id: React.useId(),
    mirror,
    item: useAround(comboboxPrimitive, "item")?.value as string | undefined,
  }
  return usePart(combobox, "item-icon", part, { ...props, render }, "span")
})

/**
 * The selected item's icon, copied from its `ComboboxItemIcon`, like next to the input. Rendered
 * while one item is selected and it has an icon.
 * @stable
 */
function ComboboxValueIcon(props: Omit<PartProps<"span">, "children">) {
  return useNearest(comboboxPrimitive) ? (
    <ComboboxValueIconPart {...props} />
  ) : null
}

function ComboboxValueIconPart(props: Omit<PartProps<"span">, "children">) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxItemIcons)
  // Its content is a copy of the selected item's icon, which the core writes.
  return usePart(combobox, "value-icon", {}, props, "span")
}

/**
 * A group of items, named by its `ComboboxGroupLabel`, and hidden while none of its items shows.
 * @stable
 */
const ComboboxGroup = parts.Group

/**
 * The group's heading, which names the group.
 * @stable
 */
const ComboboxGroupLabel = parts.GroupLabel

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const ComboboxSeparator = parts.Separator

/**
 * An option that creates an item from the input's text. Shown while the text matches no item's label exactly.
 * @stable
 */
function ComboboxCreate({
  onCreate,
  minLength,
  children = create,
  ...props
}: Omit<PartProps<"div", ComboboxCreateState>, Clashing> &
  ComboboxCreateProps) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxCreate)
  return usePart(
    combobox,
    "create",
    { onCreate, minLength },
    { ...props, children }
  )
}

const create = (state: ComboboxCreateState) => `Create “${state.query}”`

/**
 * Shown while no item matches. Its message is announced when it appears.
 * @stable
 */
function ComboboxEmpty({
  children,
  ...props
}: PartProps<"div", ComboboxEmptyState>) {
  const content = (state: ComboboxEmptyState) =>
    typeof children === "function"
      ? children(state)
      : state.empty
        ? children
        : null
  return usePart(
    comboboxPrimitive,
    "empty",
    {},
    { ...props, children: content }
  )
}

/**
 * A polite live region for loading and result counts. Its content is yours, usually a function of its state.
 * @stable
 */
const ComboboxStatus = parts.Status

/**
 * A button that empties the input and selects nothing. Shown while there's something to clear.
 * @stable
 */
const ComboboxClear = parts.Clear

/**
 * The selected value, as a function of its state, like one chip per value. Without children, the labels joined with commas, or "France, Chile and 2 more" with `maxLabels`. Renders no element of its own.
 * @stable
 */
function ComboboxValue({
  maxLabels,
  getMoreLabel,
  children,
}: ComboboxValueProps & {
  children?: React.ReactNode | ((state: ComboboxValueState) => React.ReactNode)
}) {
  // Its state, without an element.
  const value = (_props: unknown, state: ComboboxValueState) => (
    <>
      {typeof children === "function"
        ? children(state)
        : (children ?? state.label)}
    </>
  )
  return usePart(
    comboboxPrimitive,
    "value",
    { maxLabels, getMoreLabel },
    { render: value }
  )
}

/**
 * How many chips don't fit on the chips' line, once some collapse. Rendering it inside `ComboboxChips` turns collapsing on. Without children, "+2 more".
 * @stable
 */
function ComboboxChipsOverflow({
  children = more,
  ...props
}: PartProps<"span", ComboboxChipsOverflowState>) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxChips)
  return usePart(combobox, "chips-overflow", {}, { ...props, children }, "span")
}

const more = (state: ComboboxChipsOverflowState) => `+${state.count} more`

/**
 * The selected values as chips, around the input.
 * @stable
 */
function ComboboxChips({ render, ...props }: PartProps<"div">) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxChips)
  return usePart(combobox, "chips", {}, { ...props, render }, "div")
}

/**
 * One selected value. Without children, it shows the value's label.
 * @stable
 */
function ComboboxChip<T = string>({
  value,
  children = label,
  ...props
}: Omit<PartProps<"div", ComboboxChipState>, Clashing> & ComboboxChipProps<T>) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxChips)
  const part = { id: combobox.api.internal.keyOf(value), value }
  const chip = React.useMemo(() => ({ value }), [value])
  return (
    <ChipContext.Provider value={chip}>
      {usePart(combobox, "chip", part, { ...props, children })}
    </ChipContext.Provider>
  )
}

const label = (state: ComboboxChipState) => state.label

/**
 * A button inside a chip that removes its value. Name it with `aria-label`.
 * @stable
 */
function ComboboxChipRemove({
  render,
  ...props
}: PartProps<"button", ComboboxClearState>) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxChips)
  const chip = React.useContext(ChipContext)
  if (!chip) {
    throw new Error("<ComboboxChipRemove> must be used inside <ComboboxChip>.")
  }
  const part = {
    id: combobox.api.internal.keyOf(chip.value),
    value: chip.value,
  }
  return usePart(combobox, "chip-remove", part, { ...props, render }, "button")
}

/**
 * An arrow on the popup's edge that points at the input.
 * @stable
 */
const ComboboxArrow = parts.Arrow

/**
 * Renders data items. Used by data comboboxes, and available for custom layouts.
 * @stable
 */
function ComboboxItems({ items }: { items: ListData<unknown> }) {
  const combobox = useCombobox()
  return (
    <ListItems
      items={items}
      parts={listParts}
      keyOf={combobox.api.internal.keyOf}
    />
  )
}

const listParts: ListParts = {
  Item: ComboboxItem,
  Group: ComboboxGroup,
  GroupLabel: ComboboxGroupLabel,
  Separator: ComboboxSeparator,
}

export { createComboboxController } from "@ui-sdk/core/combobox"
// Core's `ComboboxValue` type ends in `Data` here, since the component has its name.
export type {
  ComboboxApi,
  ComboboxArrowState,
  ComboboxChangeOptions,
  ComboboxChipProps,
  ComboboxChipState,
  ComboboxChipsOverflowState,
  ComboboxClearProps,
  ComboboxClearState,
  ComboboxContentProps,
  ComboboxContentState,
  ComboboxController,
  ComboboxCreateProps,
  ComboboxCreateState,
  ComboboxDismissReason,
  ComboboxEmptyState,
  ComboboxInputState,
  ComboboxItemIconProps,
  ComboboxItemIconState,
  ComboboxItemIndicatorProps,
  ComboboxItemIndicatorState,
  ComboboxItemProps,
  ComboboxItemState,
  ComboboxItemTextState,
  ComboboxOpenChangeReason,
  ComboboxOptions,
  ComboboxPrimitive,
  ComboboxQueryChangeReason,
  ComboboxSelectAllState,
  ComboboxStatusState,
  ComboboxTriggerState,
  ComboboxValue as ComboboxValueData,
  ComboboxValueChangeReason,
  ComboboxValueProps,
  ComboboxValueState,
  ListAnnouncement,
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  MatchSegment,
} from "@ui-sdk/core/combobox"

export {
  Combobox,
  ComboboxArrow,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxChipsOverflow,
  ComboboxClear,
  ComboboxContent,
  ComboboxCreate,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIcon,
  ComboboxItemIndicator,
  ComboboxItems,
  ComboboxItemText,
  ComboboxLabel,
  ComboboxList,
  type ComboboxProps,
  ComboboxSelectAll,
  ComboboxSeparator,
  ComboboxStatus,
  ComboboxTrigger,
  ComboboxValue,
  ComboboxValueIcon,
}
