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
import type { JSX } from "@solidjs/web"
import {
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  merge,
  omit,
  onCleanup,
  Show,
  useContext,
  type ComponentProps,
} from "solid-js"
import { joinField, useFieldControl } from "./field-context"
import { formInputs } from "./form-inputs"
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

const parts = createParts(comboboxPrimitive, {
  label: "label",
  trigger: "button",
  item: "div",
  "item-indicator": "span",
  group: "div",
  "group-label": "div",
  list: "div",
  separator: "div",
  empty: "div",
  status: "div",
  clear: "button",
  arrow: "div",
})

const ComboboxContext = createContext<PrimitiveHandle<
  typeof comboboxPrimitive
> | null>(null)
const ContainerContext = createContext<() => PopupContainer>(() => undefined)
const ChipContext = createContext<(() => unknown) | null>(null)
// Where a ComboboxContent among the combobox's children says it's there, so a
// data combobox renders its own list only when there's none.
const OwnContentContext = createContext<((present: boolean) => void) | null>(
  null
)

function useCombobox() {
  const context = useContext(ComboboxContext)
  if (!context) {
    throw new Error("Combobox parts must be used inside <Combobox>.")
  }
  return context
}

// Element props that mean something else on a combobox part.
type Clashing = "value" | "defaultValue" | "onChange" | "onSelect"

/**
 * The props of `Combobox`.
 * @stable
 */
type ComboboxProps<
  T = string,
  Multiple extends boolean | undefined = false,
> = ComboboxOptions<T, Multiple> & {
  children?: JSX.Element
}

/**
 * A text input that filters a list as you type.
 * `T` is inferred from `value`, `defaultValue`, `items` or `onValueChange`, and
 * `multiple` makes the value a list.
 * @stable
 */
const Combobox = /* @__PURE__ */ rootScope(function Combobox<
  T = string,
  Multiple extends boolean | undefined = false,
>(props: ComboboxProps<T, Multiple>) {
  const field = useFieldControl()
  const options = omit(props, "children", "container")
  const combobox = usePrimitive(comboboxPrimitive, () => ({
    ...(options as ComboboxOptions<any, any>),
    name: props.name ?? field?.name(),
    disabled: props.disabled || field?.disabled(),
  }))
  useControllerEntry(() => props.controller, combobox)
  // Solid can't read the items among the children before they render, the
  // way React and Vue find the value's label there. Once mounted, a combobox
  // whose value still lacks a label mounts its list hidden, so the items say theirs.
  createEffect(
    () => !props.itemToLabel,
    (prepare) => {
      const { internal } = combobox.api
      if (prepare && internal.selection.needsItems(internal.hasValueIcon())) {
        internal.prepare()
      }
    }
  )
  const [header, setHeader] = createSignal<HTMLElement | null>(null)
  return (
    <ComboboxContext value={combobox}>
      <ContainerContext value={() => props.container}>
        <SheetHeaderContext value={[header, (el) => setHeader(el)]}>
          {providePrimitive(combobox, () => {
            const [own, hasContent] = ownChildren((register) => (
              <OwnContentContext value={register}>
                {props.children}
              </OwnContentContext>
            ))
            return (
              <>
                {own()}
                <Show when={props.items && !hasContent()}>
                  <ComboboxContent />
                </Show>
                {formInputs(combobox, () => props.multiple)}
              </>
            )
          })}
        </SheetHeaderContext>
      </ContainerContext>
    </ComboboxContext>
  )
})

/**
 * A visible label for the input.
 * @stable
 */
const ComboboxLabel = parts.Label

/**
 * The text input that filters the list and holds the chosen item's label.
 * @stable
 */
function ComboboxInput(
  props: Omit<
    PartProps<"input", ComboboxInputState>,
    "value" | "defaultValue" | "children" | "readonly"
  >
) {
  const combobox = useCombobox()
  const input = joinField(useFieldControl(props), props, "input")
  const [header] = useContext(SheetHeaderContext)
  return inSheetHeader(
    () => usePart(combobox, "input", undefined, input, "input"),
    header
  )
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
function ComboboxContent(
  props: PartProps<"div", ComboboxContentState> & ComboboxContentProps
) {
  const combobox = useCombobox()
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
      // combobox, from the part's state, so items that arrive after the
      // combobox rendered still render it.
      get children() {
        const children = props.children
        return (state: ComboboxContentState) => (
          <>
            {sheetHeader(combobox, setHeader)}
            {typeof children === "function" && children.length > 0
              ? children(state)
              : (children ?? (
                  <Show when={state.items}>
                    <ComboboxList />
                  </Show>
                ))}
          </>
        )
      },
    }
  )
  // The popup goes around the content only while it's present.
  return (
    <Show when={combobox.present("content", content)}>
      {renderPopup(
        () =>
          sheetViewport(combobox, () =>
            usePart(combobox, "content", content, rest, "div")
          ),
        target
      )}
    </Show>
  )
}

/**
 * The listbox. Without children, it renders the combobox's `items`, filtered.
 * @stable
 */
function ComboboxList(props: ComponentProps<typeof parts.List>) {
  // From the part's state, so new items render the list again. Without items it's empty.
  return (
    <parts.List {...props}>
      {props.children ??
        ((state: ComboboxContentState) => (
          <ComboboxItems items={state.items} />
        ))}
    </parts.List>
  )
}

/**
 * An option. Pressing it selects it, or toggles it with `multiple`.
 * @stable
 */
const ComboboxItem = parts.Item as <T = string>(
  props: Omit<PartProps<"div", ComboboxItemState>, Clashing> &
    ComboboxItemProps<T>
) => JSX.Element

/**
 * The item's text, with the part the input's text matched in `<mark>`. Without string content, it shows the item's label.
 * @stable
 */
function ComboboxItemText(props: PartProps<"span", ComboboxItemTextState>) {
  const item = useAround(comboboxPrimitive, "item")
  if (!item) {
    throw new Error("<ComboboxItemText> must be used inside <ComboboxItem>.")
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
        : (state: ComboboxItemTextState) => markSegments(state.segments)
    },
  })
  return usePart(useCombobox(), "item-text", part, rest, "span")
}

/**
 * An option that selects every item that matches, with `multiple`: in its group inside a `ComboboxGroup`, or in the whole list.
 * @stable
 */
function ComboboxSelectAll(props: PartProps<"div", ComboboxSelectAllState>) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxSelectAll)
  // Looked up once, here: the thunk also runs from DOM event handlers, outside
  // any reactive root, where Solid refuses to look up a context.
  const group = useAround(comboboxPrimitive, "group")
  return usePart(
    combobox,
    "select-all",
    () => ({ id: selectAllKey(group?.().id as string | undefined) }),
    props,
    "div"
  )
}

/**
 * The check inside a selected item. Rendered while it's selected, or always with `keepMounted`.
 * @stable
 */
const ComboboxItemIndicator = parts.ItemIndicator

/**
 * An icon inside an item. `ComboboxValueIcon` shows the selected item's next to the input. Screen
 * readers, typeahead and filtering skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
function ComboboxItemIcon(
  props: PartProps<"span", ComboboxItemIconState> & ComboboxItemIconProps
) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxItemIcons)
  const item = useAround(comboboxPrimitive, "item")
  const id = createUniqueId()
  const part = () => ({
    id,
    mirror: props.mirror,
    item: item?.().value as string | undefined,
  })
  return usePart(combobox, "item-icon", part, omit(props, "mirror"), "span")
}

/**
 * The selected item's icon, copied from its `ComboboxItemIcon`, like next to the input. Rendered
 * while one item is selected and it has an icon.
 * @stable
 */
function ComboboxValueIcon(props: Omit<PartProps<"span">, "children">) {
  const combobox = useContext(ComboboxContext)
  if (!combobox) {
    return null
  }
  combobox.instance.use(comboboxItemIcons)
  // Its content is a copy of the selected item's icon, which the core writes.
  return usePart(combobox, "value-icon", undefined, props, "span")
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
function ComboboxCreate(
  props: Omit<PartProps<"div", ComboboxCreateState>, Clashing> &
    ComboboxCreateProps
) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxCreate)
  const part = () => ({ onCreate: props.onCreate, minLength: props.minLength })
  const rest = merge(omit(props, "onCreate", "minLength"), {
    get children() {
      return (
        props.children ??
        ((state: ComboboxCreateState) => `Create “${state.query}”`)
      )
    },
  })
  return usePart(combobox, "create", part, rest, "div")
}

/**
 * Shown while no item matches. Its message is announced when it appears.
 * @stable
 */
function ComboboxEmpty(props: ComponentProps<typeof parts.Empty>) {
  const rest = merge(props, {
    get children() {
      const children = props.children
      return typeof children === "function"
        ? children
        : (state: ComboboxEmptyState) => (state.empty ? children : null)
    },
  })
  return <parts.Empty {...rest} />
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
function ComboboxValue(
  props: ComboboxValueProps & {
    children?: JSX.Element | ((state: ComboboxValueState) => JSX.Element)
  }
) {
  const part = () => ({
    maxLabels: props.maxLabels,
    getMoreLabel: props.getMoreLabel,
  })
  // Its `render` leaves the props it's handed out, so it renders only its content.
  const render = (_: unknown, state: ComboboxValueState) => {
    const children = props.children
    return typeof children === "function"
      ? children(state)
      : (children ?? state.label)
  }
  return usePart(useCombobox(), "value", part, { render }, "span")
}

/**
 * How many chips don't fit on the chips' line, once some collapse. Rendering it inside `ComboboxChips` turns collapsing on. Without children, "+2 more".
 * @stable
 */
function ComboboxChipsOverflow(
  props: PartProps<"span", ComboboxChipsOverflowState>
) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxChips)
  const rest = merge(props, {
    get children() {
      return (
        props.children ??
        ((state: ComboboxChipsOverflowState) => `+${state.count} more`)
      )
    },
  })
  return usePart(combobox, "chips-overflow", undefined, rest, "span")
}

/**
 * The selected values as chips, around the input.
 * @stable
 */
function ComboboxChips(props: PartProps<"div">) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxChips)
  return usePart(combobox, "chips", undefined, props, "div")
}

/**
 * One selected value. Without children, it shows the value's label.
 * @stable
 */
function ComboboxChip<T = string>(
  props: Omit<PartProps<"div", ComboboxChipState>, Clashing> &
    ComboboxChipProps<T>
) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxChips)
  // Keyed by the value's key, since a value may be an object.
  const part = () => ({
    id: combobox.api.internal.keyOf(props.value),
    value: props.value,
  })
  const rest = merge(omit(props, "value"), {
    get children() {
      return props.children ?? ((state: ComboboxChipState) => state.label)
    },
  })
  return (
    <ChipContext value={() => props.value}>
      {usePart(combobox, "chip", part, rest, "div")}
    </ChipContext>
  )
}

/**
 * A button inside a chip that removes its value. Name it with `aria-label`.
 * @stable
 */
function ComboboxChipRemove(props: PartProps<"button", ComboboxClearState>) {
  const combobox = useCombobox()
  combobox.instance.use(comboboxChips)
  const chip = useContext(ChipContext)
  if (!chip) {
    throw new Error("<ComboboxChipRemove> must be used inside <ComboboxChip>.")
  }
  // Keyed by its chip's value, like the chip.
  const part = () => ({
    id: combobox.api.internal.keyOf(chip()),
    value: chip(),
  })
  return usePart(combobox, "chip-remove", part, props, "button")
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
function ComboboxItems(props: { items: ListData<unknown> }) {
  return <ListItems items={props.items} parts={listParts} />
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
