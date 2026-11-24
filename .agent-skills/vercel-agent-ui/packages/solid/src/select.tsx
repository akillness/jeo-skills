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
import type { JSX } from "@solidjs/web"
import {
  createContext,
  createEffect,
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
  useControllerTarget,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import {
  createParts,
  ownChildren,
  providePrimitive,
  renderStatic,
  rootScope,
  useAround,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(selectPrimitive, {
  label: "div",
  list: "div",
  input: "input",
  item: "div",
  "item-indicator": "span",
  group: "div",
  "group-label": "div",
  separator: "div",
  empty: "div",
  status: "div",
  clear: "button",
  arrow: "div",
})

type SelectContextValue = PrimitiveHandle<typeof selectPrimitive>

const SelectContext = createContext<SelectContextValue | null>(null)
const ContainerContext = createContext<() => PopupContainer>(() => undefined)
// Where a SelectContent among the select's children says it's there, so a
// data select renders its own list only when there's none.
const OwnContentContext = createContext<((present: boolean) => void) | null>(
  null
)

// Each select's own placeholder, which the instance's state holds untracked.
// By select, since a trigger can show another select than the one around it.
const placeholders = new WeakMap<object, () => string | undefined>()

function useSelect() {
  const context = useContext(SelectContext)
  if (!context) {
    throw new Error("Select parts must be used inside <Select>.")
  }
  return context
}

// Element props that mean something else on a select part.
type Clashing = "value" | "onChange" | "onSelect"

/**
 * The props of `Select`.
 * @stable
 */
type SelectProps<
  T = string,
  Multiple extends boolean | undefined = false,
> = SelectOptions<T, Multiple> & {
  children?: JSX.Element
}

/**
 * Picks one value, or several, from a list in a popup.
 * `T` is inferred from `value`, `defaultValue`, `items` or `onValueChange`, and
 * `multiple` makes the value a list.
 * @stable
 */
const Select = /* @__PURE__ */ rootScope(function Select<
  T = string,
  Multiple extends boolean | undefined = false,
>(props: SelectProps<T, Multiple>) {
  const field = useFieldControl()
  const options = omit(props, "children", "container")
  const select = usePrimitive(selectPrimitive, () => ({
    ...(options as SelectOptions<any, any>),
    name: props.name ?? field?.name(),
    disabled: props.disabled || field?.disabled(),
  }))
  useControllerEntry(() => props.controller, select)
  placeholders.set(select, () => props.placeholder)
  // Solid can't read the items among the children before they render, the
  // way React and Vue find the value's label there. Once mounted, a select
  // that still lacks a label mounts its list hidden, so the items say theirs.
  createEffect(
    () => !props.itemToLabel,
    (prepare) => {
      const { internal } = select.api
      if (prepare && internal.selection.needsItems(internal.hasValueIcon())) {
        internal.prepare()
      }
    }
  )
  return (
    <SelectContext value={select}>
      <ContainerContext value={() => props.container}>
        {providePrimitive(select, () => {
          const [own, hasContent] = ownChildren((register) => (
            <OwnContentContext value={register}>
              {props.children}
            </OwnContentContext>
          ))
          return (
            <>
              {own()}
              <Show when={props.items && !hasContent()}>
                <SelectContent />
              </Show>
              {formInputs(select, () => props.multiple)}
            </>
          )
        })}
      </ContainerContext>
    </SelectContext>
  )
})

/**
 * A visible label for the select. Pressing it focuses the trigger, like a native select's label.
 * @stable
 */
const SelectLabel = parts.Label

type TriggerPartProps = Omit<
  PartProps<"button", SelectTriggerState>,
  Clashing
> &
  SelectTriggerProps

/**
 * The button that opens the list: a combobox named by the label. Typing on it selects the item that matches.
 * @stable
 */
function SelectTrigger(props: TriggerPartProps) {
  const select = useControllerTarget(
    () => props.controller,
    useContext(SelectContext)
  )
  const rest = omit(props, "disabled", "controller")
  const field = useFieldControl(rest)
  return (
    <Show
      when={select()}
      keyed
      // Until the select it names mounts, a trigger outside the select is a plain button.
      fallback={renderStatic(
        "button",
        () => ({
          attrs: { type: "button", disabled: props.disabled ? "" : undefined },
          state: {
            open: false,
            disabled: !!props.disabled,
            readOnly: false,
            required: false,
            placeholder: true,
          },
        }),
        joinField(field, rest, "button")
      )}
    >
      {(select) =>
        triggerPart(select, () => ({ disabled: props.disabled }), rest, field)
      }
    </Show>
  )
}

function triggerPart(
  select: SelectContextValue,
  trigger: () => SelectTriggerProps,
  props: Record<string, any>,
  field: ReturnType<typeof useFieldControl>
) {
  // Without content, the trigger shows the value.
  const user = merge(props, {
    get children() {
      return props.children ?? <SelectValue />
    },
  })
  const own = () => ({
    ...trigger(),
    named: !!field || props["aria-labelledby"] != null,
  })
  return (
    <SelectContext value={select}>
      {usePart(
        select,
        "trigger",
        own,
        joinField(field, user, "button"),
        "button"
      )}
    </SelectContext>
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
function SelectValue(
  props: Omit<PartProps<"span", SelectValueState>, Clashing> & SelectValueProps
) {
  const context = useContext(SelectContext)
  const rest = omit(props, "placeholder", "maxLabels", "getMoreLabel")
  // A trigger outside its select renders before the select it names has mounted.
  if (!context) {
    return renderStatic(
      "span",
      () => ({ attrs: {}, state: unselected }),
      merge(rest, {
        get children() {
          return props.children ?? props.placeholder ?? null
        },
      })
    )
  }
  const placeholder = () =>
    placeholders.get(context)?.() ?? context.state.placeholder
  const part = () => ({
    placeholder: props.placeholder,
    maxLabels: props.maxLabels,
    getMoreLabel: props.getMoreLabel,
  })
  const user = merge(rest, {
    get children() {
      return (
        props.children ??
        ((state: SelectValueState) =>
          state.placeholder
            ? (props.placeholder ?? placeholder() ?? null)
            : state.label)
      )
    },
  })
  return usePart(context, "value", part, user, "span")
}

/**
 * The popup that holds the items, positioned against the trigger.
 * @stable
 */
function SelectContent(
  props: PartProps<"div", SelectContentState> & SelectContentProps
) {
  const select = useSelect()
  const fromRoot = useContext(ContainerContext)
  const target = usePopupContainer(() => props.container ?? fromRoot())
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
    alignItemWithTrigger: props.alignItemWithTrigger,
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
      "alignItemWithTrigger",
      "keepMounted",
      "container"
    ),
    {
      // From the part's state, so items that arrive after the select rendered
      // still render. Read inside `Show`, so new items keep their rows.
      get children() {
        return (
          props.children ??
          ((state: SelectContentState) => (
            <Show when={state.items}>
              <SelectItems items={state.items!} />
            </Show>
          ))
        )
      },
    }
  )
  // The popup goes around the content only while it's present.
  return (
    <Show when={select.present("content", content)}>
      {renderPopup(
        () =>
          sheetViewport(select, () =>
            usePart(select, "content", content, rest, "div")
          ),
        target
      )}
    </Show>
  )
}

/**
 * The listbox, when the content holds more than items, like a `SelectInput`. Without children, it renders the select's `items` that match.
 * @stable
 */
function SelectList(props: ComponentProps<typeof parts.List>) {
  return (
    <parts.List {...props}>
      {props.children ??
        ((state: SelectContentState) => <SelectItems items={state.items} />)}
    </parts.List>
  )
}

/**
 * A search field inside `SelectContent` that filters the list while focus stays in it. Put the items in a `SelectList`. Name it with `aria-label`.
 * @stable
 */
const SelectInput = parts.Input

/**
 * Shown while no item matches the search. Its message is announced when it appears.
 * @stable
 */
function SelectEmpty(props: ComponentProps<typeof parts.Empty>) {
  const rest = merge(props, {
    get children() {
      const children = props.children
      return typeof children === "function"
        ? children
        : (state: SelectEmptyState) => (state.empty ? children : null)
    },
  })
  return <parts.Empty {...rest} />
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
) => JSX.Element

/**
 * The item's text, with the part the search matched in `<mark>`. Without string content, it shows the item's label.
 * @stable
 */
function SelectItemText(props: PartProps<"span", SelectItemTextState>) {
  const item = useAround(selectPrimitive, "item")
  if (!item) {
    throw new Error("<SelectItemText> must be used inside <SelectItem>.")
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
        : (state: SelectItemTextState) => markSegments(state.segments)
    },
  })
  return usePart(useSelect(), "item-text", part, rest, "span")
}

/**
 * An option that selects every item that matches, with `multiple`: in its group inside a `SelectGroup`, or in the whole list.
 * @stable
 */
function SelectSelectAll(props: PartProps<"div", SelectSelectAllState>) {
  const select = useSelect()
  select.instance.use(selectSelectAll)
  // Looked up once, here: the thunk also runs from DOM event handlers, outside
  // any reactive root, where Solid refuses to look up a context.
  const group = useAround(selectPrimitive, "group")
  return usePart(
    select,
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
const SelectItemIndicator = parts.ItemIndicator

/**
 * An icon inside an item. `SelectValueIcon` shows the selected item's in the trigger. Screen
 * readers, typeahead and filtering skip it, and `mirror` flips it in right-to-left text.
 * @stable
 */
function SelectItemIcon(
  props: PartProps<"span", SelectItemIconState> & SelectItemIconProps
) {
  const select = useSelect()
  select.instance.use(selectItemIcons)
  const item = useAround(selectPrimitive, "item")
  const id = createUniqueId()
  const part = () => ({
    id,
    mirror: props.mirror,
    item: item?.().value as string | undefined,
  })
  return usePart(select, "item-icon", part, omit(props, "mirror"), "span")
}

/**
 * The selected item's icon, copied from its `SelectItemIcon`, like before the value in the
 * trigger. Rendered while one item is selected and it has an icon.
 * @stable
 */
function SelectValueIcon(props: Omit<PartProps<"span">, "children">) {
  const select = useContext(SelectContext)
  if (!select) {
    return null
  }
  select.instance.use(selectItemIcons)
  // Its content is a copy of the selected item's icon, which the core writes.
  return usePart(select, "value-icon", undefined, props, "span")
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
function SelectItems(props: { items: ListData<unknown> }) {
  return <ListItems items={props.items} parts={listParts} />
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
