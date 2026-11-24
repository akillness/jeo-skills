import {
  autocomplete as autocompletePrimitive,
  type AutocompleteContentProps,
  type AutocompleteContentState,
  type AutocompleteEmptyState,
  type AutocompleteInputState,
  type AutocompleteItemTextState,
  type AutocompleteOptions,
  type ListData,
} from "@ui-sdk/core/autocomplete"
import type { JSX } from "@solidjs/web"
import {
  createContext,
  createSignal,
  merge,
  omit,
  onCleanup,
  Show,
  useContext,
  type ComponentProps,
} from "solid-js"
import { joinField, useFieldControl } from "./field-context"
import { ListItems, type ListParts } from "./list-items"
import { markSegments, textToMark } from "./list-text"
import {
  renderPopup,
  sheetViewport,
  useControllerEntry,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import { inSheetHeader, sheetHeader, SheetHeaderContext } from "./sheet-header"
import {
  createParts,
  ownChildren,
  providePrimitive,
  rootScope,
  useAround,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(autocompletePrimitive, {
  label: "label",
  trigger: "button",
  clear: "button",
  list: "div",
  item: "div",
  "item-icon": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  empty: "div",
  status: "div",
  arrow: "div",
})

const AutocompleteContext = createContext<PrimitiveHandle<
  typeof autocompletePrimitive
> | null>(null)
const ContainerContext = createContext<() => PopupContainer>(() => undefined)
// Where an AutocompleteContent among the autocomplete's children says it's
// there, so a data autocomplete renders its own list only when there's none.
const OwnContentContext = createContext<((present: boolean) => void) | null>(
  null
)

function useAutocomplete() {
  const context = useContext(AutocompleteContext)
  if (!context) {
    throw new Error("Autocomplete parts must be used inside <Autocomplete>.")
  }
  return context
}

/**
 * The props of `Autocomplete`.
 * @stable
 */
type AutocompleteProps = AutocompleteOptions & {
  children?: JSX.Element
}

/**
 * A text field that suggests as you type. The text is the value. Renders no element of its own.
 * @stable
 */
const Autocomplete = /* @__PURE__ */ rootScope(function Autocomplete(
  props: AutocompleteProps
) {
  const field = useFieldControl()
  const options = omit(props, "children", "container")
  const autocomplete = usePrimitive(autocompletePrimitive, () => ({
    ...options,
    name: props.name ?? field?.name(),
    disabled: props.disabled || field?.disabled(),
  }))
  useControllerEntry(() => props.controller, autocomplete)
  const [header, setHeader] = createSignal<HTMLElement | null>(null)
  return (
    <AutocompleteContext value={autocomplete}>
      <ContainerContext value={() => props.container}>
        <SheetHeaderContext value={[header, (el) => setHeader(el)]}>
          {providePrimitive(autocomplete, () => {
            const [own, hasContent] = ownChildren((register) => (
              <OwnContentContext value={register}>
                {props.children}
              </OwnContentContext>
            ))
            return (
              <>
                {own()}
                <Show when={props.items && !hasContent()}>
                  <AutocompleteContent />
                </Show>
              </>
            )
          })}
        </SheetHeaderContext>
      </ContainerContext>
    </AutocompleteContext>
  )
})

/**
 * A visible label for the field.
 * @stable
 */
const AutocompleteLabel = parts.Label

/**
 * The text field. It's the form control, so the text submits under the autocomplete's `name`.
 * @stable
 */
function AutocompleteInput(
  props: Omit<
    PartProps<"input", AutocompleteInputState>,
    "value" | "defaultValue" | "children" | "readonly"
  >
) {
  const autocomplete = useAutocomplete()
  const input = joinField(useFieldControl(props), props, "input")
  const [header] = useContext(SheetHeaderContext)
  return inSheetHeader(
    () => usePart(autocomplete, "input", undefined, input, "input"),
    header
  )
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
function AutocompleteContent(
  props: PartProps<"div", AutocompleteContentState> & AutocompleteContentProps
) {
  const autocomplete = useAutocomplete()
  const fromRoot = useContext(ContainerContext)
  const target = usePopupContainer(() => props.container ?? fromRoot())
  const [, setHeader] = useContext(SheetHeaderContext)
  const register = useContext(OwnContentContext)
  register?.(true)
  onCleanup(() => register?.(false))
  const content = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
    keepMounted: props.keepMounted,
  })
  const rest = merge(
    omit(
      props,
      "side",
      "align",
      "sideOffset",
      "alignOffset",
      "collisionPadding",
      "arrowPadding",
      "anchor",
      "keepMounted",
      "container"
    ),
    {
      // The sheet's header, then the content: yours, or the list of a data
      // autocomplete, from the part's state, so items that arrive after the
      // autocomplete rendered still render it.
      get children() {
        const children = props.children
        return (state: AutocompleteContentState) => (
          <>
            {sheetHeader(autocomplete, setHeader)}
            {typeof children === "function" && children.length > 0
              ? children(state)
              : (children ?? (
                  <Show when={state.items}>
                    <AutocompleteList />
                  </Show>
                ))}
          </>
        )
      },
    }
  )
  // The popup goes around the content only while it's present.
  return (
    <Show when={autocomplete.present("content", content)}>
      {renderPopup(
        () =>
          sheetViewport(autocomplete, () =>
            usePart(autocomplete, "content", content, rest, "div")
          ),
        target
      )}
    </Show>
  )
}

/**
 * The listbox. Without children, it renders the autocomplete's `items`, filtered.
 * @stable
 */
function AutocompleteList(props: ComponentProps<typeof parts.List>) {
  // From the part's state, so new items render the list again. Without items it's empty.
  return (
    <parts.List {...props}>
      {props.children ??
        ((state: AutocompleteContentState) => (
          <AutocompleteItems items={state.items} />
        ))}
    </parts.List>
  )
}

/**
 * A suggestion. Choosing it fills the field in with its text.
 * @stable
 */
const AutocompleteItem = parts.Item

/**
 * The suggestion's text, with the part the field's text matched in `<mark>`. Without string content, it shows the suggestion's label.
 * @stable
 */
function AutocompleteItemText(
  props: PartProps<"span", AutocompleteItemTextState>
) {
  const item = useAround(autocompletePrimitive, "item")
  if (!item) {
    throw new Error(
      "<AutocompleteItemText> must be used inside <AutocompleteItem>."
    )
  }
  const key = () => item().value as string
  const part = () => ({
    id: key(),
    text: textToMark(props.children, (item().label as string) ?? key()),
  })
  const rest = merge(props, {
    get children() {
      const children = props.children
      return typeof children === "function"
        ? children
        : (state: AutocompleteItemTextState) => markSegments(state.segments)
    },
  })
  return usePart(useAutocomplete(), "item-text", part, rest, "span")
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
function AutocompleteEmpty(props: ComponentProps<typeof parts.Empty>) {
  const rest = merge(props, {
    get children() {
      const children = props.children
      return typeof children === "function"
        ? children
        : (state: AutocompleteEmptyState) => (state.empty ? children : null)
    },
  })
  return <parts.Empty {...rest} />
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
function AutocompleteItems(props: { items: ListData<string> }) {
  return <ListItems items={props.items} parts={listParts} />
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
