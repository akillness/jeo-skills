import {
  autocomplete as autocompletePrimitive,
  type AutocompleteContentProps,
  type AutocompleteContentState,
  type AutocompleteEmptyState,
  type AutocompleteInputState,
  type AutocompleteItemProps,
  type AutocompleteItemState,
  type AutocompleteItemTextState,
  type AutocompleteOptions,
  type ListData,
} from "@ui-sdk/core/autocomplete"
import * as React from "react"
import { hasChild, Placed, usePlaceContent, usePlacedContent } from "./children"
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
import { ListItems, type ListParts } from "./list-items"
import {
  createParts,
  HandleScope,
  useAround,
  useHandle,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(autocompletePrimitive, {
  label: "label",
  trigger: "button",
  clear: "button",
  item: "div",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  status: "div",
  arrow: "div",
})

const ContainerContext = React.createContext<PopupContainer>(undefined)

function useAutocomplete() {
  return useHandle(autocompletePrimitive)
}

type Clashing = "value" | "defaultValue" | "onChange" | "onSelect" | "onSubmit"

/**
 * The props of `Autocomplete`.
 * @stable
 */
type AutocompleteProps = AutocompleteOptions & {
  children?: React.ReactNode
}

/**
 * A text field that suggests as you type. The text is the value. Renders no element of its own.
 * @stable
 */
function Autocomplete({ children, container, ...options }: AutocompleteProps) {
  const field = useFieldControl()
  const autocomplete = usePrimitive(autocompletePrimitive, {
    ...options,
    name: options.name ?? field?.name,
    disabled: options.disabled || field?.disabled,
  })
  useControllerEntry(options.controller, autocomplete)
  const header = React.useState<HTMLElement | null>(null)
  // A data autocomplete renders its list, unless the app placed an
  // AutocompleteContent: in the markup, or inside a component of its own.
  const found = hasChild(children, AutocompleteContent)
  const [placed, place] = usePlacedContent(!!options.items && !found)
  const own = placed || found
  return (
    <HandleScope handle={autocomplete}>
      <ContainerContext.Provider value={container}>
        <SheetHeaderContext.Provider value={header}>
          <Placed value={place}>{children}</Placed>
          <Placed value={null}>
            {options.items && !own && <AutocompleteContent />}
          </Placed>
        </SheetHeaderContext.Provider>
      </ContainerContext.Provider>
    </HandleScope>
  )
}

/**
 * A visible label for the field.
 * @stable
 */
const AutocompleteLabel = parts.Label

/**
 * The text field. It's the form control, so the text submits under the autocomplete's `name`.
 * @stable
 */
function AutocompleteInput({
  render,
  ...props
}: Omit<
  PartProps<"input", AutocompleteInputState>,
  "value" | "defaultValue" | "children" | "readOnly"
>) {
  const [header] = React.useContext(SheetHeaderContext)
  const element = {
    ...props,
    render: controlRender(useFieldControl(props), "input", render),
  }
  // While the popup presents as a sheet, the input renders in its header.
  const input = usePart(autocompletePrimitive, "input", {}, element, "input")
  return input && inSheetHeader(input, header)
}

/**
 * A button that opens and closes the suggestions, out of the tab order.
 * @stable
 */
const AutocompleteTrigger = parts.Trigger

/**
 * A button that empties the field. Shown while there's text to clear. Name it with `aria-label`.
 * @stable
 */
const AutocompleteClear = parts.Clear

/**
 * The popup that holds the suggestions, positioned against the field.
 * @stable
 */
function AutocompleteContent({
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
}: PartProps<"div", AutocompleteContentState> & AutocompleteContentProps) {
  usePlaceContent()
  const autocomplete = useAutocomplete()
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
  // autocomplete rendered still render the list. `autocomplete.state` doesn't subscribe.
  const body = (state: AutocompleteContentState) => (
    <>
      {sheetHeader(autocomplete, setHeader)}
      {typeof children === "function"
        ? children(state)
        : (children ??
          (state.items && autocomplete.state.items && <AutocompleteList />))}
    </>
  )
  const element = usePart(autocomplete, "content", content, {
    ...props,
    children: body,
    render: sheetViewport(autocomplete, render),
  })
  return element && renderPopup(element, target)
}

/**
 * The listbox. Without children, it renders the autocomplete's `items`, filtered.
 * @stable
 */
function AutocompleteList({
  children = listItems,
  ...props
}: PartProps<"div", AutocompleteContentState>) {
  return usePart(autocompletePrimitive, "list", {}, { ...props, children })
}

// From the part's state, so new items re-render the list. Without items it's empty.
const listItems = (state: AutocompleteContentState) => (
  <AutocompleteItems items={state.items} />
)

/**
 * A suggestion. Choosing it fills the field in with its text.
 * @stable
 */
const AutocompleteItem = parts.Item as (
  props: Omit<PartProps<"div", AutocompleteItemState>, Clashing> &
    AutocompleteItemProps
) => React.ReactNode

/**
 * The suggestion's text, with the part the field's text matched in `<mark>`. Without string content, it shows the suggestion's label.
 * @stable
 */
function AutocompleteItemText({
  children,
  ...props
}: PartProps<"span", AutocompleteItemTextState>) {
  const item = useAround(autocompletePrimitive, "item")
  if (!item) {
    throw new Error(
      "<AutocompleteItemText> must be used inside <AutocompleteItem>."
    )
  }
  const part = {
    id: item.value as string,
    text: textToMark(children, (item.label ?? item.value) as string),
  }
  const content =
    typeof children === "function"
      ? children
      : (state: AutocompleteItemTextState) => markSegments(state.segments)
  return usePart(
    autocompletePrimitive,
    "item-text",
    part,
    { ...props, children: content },
    "span"
  )
}

/**
 * An icon inside a suggestion. Screen readers, typeahead and filtering skip it, and `mirror` flips
 * it in right-to-left text.
 * @stable
 */
const AutocompleteItemIcon = parts.ItemIcon

/**
 * A group of items, named by its `AutocompleteGroupLabel`, and hidden while none of its items shows.
 * @stable
 */
const AutocompleteGroup = parts.Group

/**
 * The group's heading, which names the group.
 * @stable
 */
const AutocompleteGroupLabel = parts.GroupLabel

/**
 * A line between items or groups, hidden from screen readers.
 * @stable
 */
const AutocompleteSeparator = parts.Separator

/**
 * Shown while no suggestion matches. Its message is announced when it appears.
 * @stable
 */
function AutocompleteEmpty({
  children,
  ...props
}: PartProps<"div", AutocompleteEmptyState>) {
  const content = (state: AutocompleteEmptyState) =>
    typeof children === "function"
      ? children(state)
      : state.empty
        ? children
        : null
  return usePart(
    autocompletePrimitive,
    "empty",
    {},
    { ...props, children: content }
  )
}

/**
 * A polite live region for loading and result counts. Its content is yours, usually a function of its state.
 * @stable
 */
const AutocompleteStatus = parts.Status

/**
 * An arrow on the popup's edge that points at the field.
 * @stable
 */
const AutocompleteArrow = parts.Arrow

/**
 * Renders data suggestions. Used by data autocompletes, and available for custom layouts.
 * @stable
 */
function AutocompleteItems({ items }: { items: ListData<string> }) {
  return <ListItems items={items} parts={listParts} keyOf={String} />
}

const listParts: ListParts = {
  Item: AutocompleteItem,
  Group: AutocompleteGroup,
  GroupLabel: AutocompleteGroupLabel,
  Separator: AutocompleteSeparator,
}

export { createAutocompleteController } from "@ui-sdk/core/autocomplete"
export type {
  AutocompleteApi,
  AutocompleteArrowState,
  AutocompleteChangeOptions,
  AutocompleteClearProps,
  AutocompleteClearState,
  AutocompleteContentProps,
  AutocompleteContentState,
  AutocompleteController,
  AutocompleteDismissReason,
  AutocompleteEmptyState,
  AutocompleteInputState,
  AutocompleteItemIconProps,
  AutocompleteItemIconState,
  AutocompleteItemProps,
  AutocompleteItemState,
  AutocompleteItemTextState,
  AutocompleteOpenChangeReason,
  AutocompleteOptions,
  AutocompletePrimitive,
  AutocompleteStatusState,
  AutocompleteSubmitDetails,
  AutocompleteTriggerState,
  AutocompleteValueChangeDetails,
  AutocompleteValueChangeReason,
  ListAnnouncement,
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
  MatchSegment,
  SearchFilter,
} from "@ui-sdk/core/autocomplete"

export {
  Autocomplete,
  AutocompleteArrow,
  AutocompleteClear,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteItemIcon,
  AutocompleteItems,
  AutocompleteItemText,
  AutocompleteLabel,
  AutocompleteList,
  type AutocompleteProps,
  AutocompleteSeparator,
  AutocompleteStatus,
  AutocompleteTrigger,
}
