// Select: a button that opens a list of options and shows the chosen one,
// like a native <select>. This module is the public API and assembles the
// primitive. State and the API live in select-api.ts, keys and pointer
// presses in select-keyboard.ts, and parts and attributes in select-parts.ts,
// on the listbox engine and the selection model Combobox shares.
import type { ItemsOf } from "../../foundation/lists/listbox-value"
import { type AsyncOptionsStatus } from "../../foundation/lists/async-options"
import { type Modal, type PopupResult } from "../../foundation/popups/popup"
import { pointerModalAttribute } from "../../foundation/popups/modal-attribute"
import {
  type PortalProps,
  type PositionProps,
} from "../../foundation/platform/position"
import type { PresentationSetting } from "../../foundation/popups/presentation"
import {
  filterAttribute,
  type ListData,
  type ListEmptyState,
  type ListFilter,
  type ListHighlightDetails,
  type ListStatusState,
} from "../../foundation/lists/listbox"
import {
  type ItemIconProps,
  type ItemIconState,
} from "../../foundation/lists/item-icon"
import {
  type ListAnnouncement,
  type ListItemTextState,
} from "../../foundation/lists/listbox-search"
import { type ListSelectAllState } from "../../foundation/lists/listbox-select-all"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
  DismissAttemptReason,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PrimitiveOptions,
  WithFeatures,
  WithGeneric,
} from "../../foundation/kernel/primitive-types"
import {
  selectSlots,
  type selectItemIcons,
  type selectSelectAll,
} from "./select-parts"
import { initialSelectState, selectApi, syncSelectState } from "./select-api"
import type { SelectGeneric } from "./select-generic"
import { type DismissOptions } from "../../foundation/popups/dismissal"

/**
 * Why a select's value wants to change.
 * @stable
 */
type SelectValueChangeReason =
  | "item-press"
  | "list-navigation"
  | "clear-press"
  | "reset"
  | "restore"
  | "imperative"

/**
 * Why the text in a select's search field wants to change. Closing the list empties it, with the reason it closed.
 * @stable
 */
type SelectQueryChangeReason =
  | "input-change"
  | "item-press"
  | "trigger-press"
  | "outside-press"
  | "escape-key"
  | "close-press"
  | "focus-out"
  | "window-blur"
  | "back"
  | "swipe"
  | "imperative"

/**
 * Why a select opened or closed.
 * @stable
 */
type SelectOpenChangeReason =
  | "trigger-press"
  | "item-press"
  | "outside-press"
  | "escape-key"
  | "close-press"
  | "focus-out"
  | "window-blur"
  | "back"
  | "swipe"
  | "imperative"

/**
 * The dismissals `dismissible` refuses that `onDismissAttempt` hears about.
 * @stable
 */
type SelectDismissReason = Extract<SelectOpenChangeReason, DismissAttemptReason>

/**
 * The value of a select: one item's value or `null`, or a list with `multiple`.
 * @stable
 */
type SelectValue<
  T = string,
  Multiple extends boolean | undefined = false,
> = Multiple extends true ? T[] : T | null

/**
 * Options for every write method on a select controller.
 * @stable
 */
type SelectChangeOptions<Reason extends string> = ChangeOptions<Reason>

/**
 * Opens, closes, reads and sets a select from outside it: a reset button, a
 * test, or a trigger outside the select. Pass it as the `controller` option.
 * @stable
 */
function createSelectController<
  T = string,
  Multiple extends boolean | undefined = false,
>() {
  return createController<{
    /** Whether the list is open. */
    isOpen: () => boolean
    /** Opens or closes the list. Returns false when the change was canceled or it was already open or closed. */
    setOpen: (
      open: boolean,
      options?: SelectChangeOptions<SelectOpenChangeReason>
    ) => boolean
    /**
     * Opens the list, and resolves once it closes, with why and how. Resolves exactly once and never
     * rejects: on the next close from any source, when `signal` aborts, or with reason `"unmount"`
     * when the select leaves the page.
     */
    open: (
      options?: SelectChangeOptions<SelectOpenChangeReason> & {
        /** Closes the list, with reason `"imperative"`, when it aborts. An already aborted signal never opens it. */
        signal?: AbortSignal
      }
    ) => Promise<PopupResult<SelectOpenChangeReason, never>>
    /** Closes the list. Returns false when the close was canceled or it was already closed. */
    close: (options?: SelectChangeOptions<SelectOpenChangeReason>) => boolean
    /** Opens the list when it's closed, and closes it when it's open. Returns false when the change was canceled. */
    toggle: (options?: SelectChangeOptions<SelectOpenChangeReason>) => boolean
    /** The selected value. */
    getValue: () => SelectValue<T, Multiple>
    /**
     * Selects a value, as a user would. A disabled or read-only select ignores it. Returns false when
     * the change was canceled, ignored or the value was already selected.
     */
    setValue: (
      value: SelectValue<T, Multiple>,
      options?: SelectChangeOptions<SelectValueChangeReason>
    ) => boolean
    /** Selects nothing: `null`, or an empty list with `multiple`. Returns false when nothing changed. */
    clear: (options?: SelectChangeOptions<SelectValueChangeReason>) => boolean
    /** The text in the search field. */
    getQuery: () => string
    /** Changes the text in the search field, which filters the list. Returns false when nothing changed. */
    setQuery: (
      query: string,
      options?: SelectChangeOptions<SelectQueryChangeReason>
    ) => boolean
    /** Moves focus to the trigger. */
    focus: () => void
  }>()
}

/**
 * A controller from `createSelectController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type SelectController<
  T = string,
  Multiple extends boolean | undefined = false,
> = ReturnType<typeof createSelectController<T, Multiple>>

/**
 * The options `select` takes. A component takes them as props on its root.
 * `multiple` picks the shape of the value, and `Multiple` true requires it.
 * @stable
 */
// A union on `multiple`, so TypeScript infers `T` through it. The multiple side
// comes first, so a list in a variable infers `T` as its items. A value that is
// itself a list takes `items` or the type: `<Select<number[]>>`.
type SelectOptions<
  T = string,
  Multiple extends boolean | undefined = false,
> = SelectSharedOptions<T> &
  (
    | SelectMultipleOptions<T, Multiple>
    | SelectSingleOptions<T, Multiple>
    | SelectEitherOptions<T, Multiple>
  )

/** The value options of a select that selects one item. `Multiple` true or `boolean` rules them out. */
type SelectSingleOptions<T, Multiple> = {
  /**
   * Whether several items can be selected. The value is then a list, and the list stays open as items toggle.
   * @defaultValue false
   */
  multiple?: false
  /** The selected value. Pass it to control the select. `null` selects nothing. */
  value?: T | ItemsOf<T> | null
  /** The value selected at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: T | ItemsOf<T> | null
  // TypeScript infers `T` from both sides of the union, so a multiple one's
  // state setter would make `T` a list here. `NoInfer` leaves `T` to the
  // value, the items and the multiple side's callback.
  /** Runs when a user, a form reset or a controller wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: NoInfer<T> | null,
    details: ChangeDetails<SelectValueChangeReason>
  ) => void
} & (boolean extends Multiple
  ? never
  : [Multiple] extends [true]
    ? never
    : unknown)

/** The value options of a select that selects several items. `Multiple` `boolean` rules them out. */
type SelectMultipleOptions<T, Multiple> = {
  /** Whether several items can be selected. The value is then a list, and the list stays open as items toggle. */
  multiple: true
  /** The selected values. Pass it to control the select. */
  value?: T[]
  /** The values selected at first, when uncontrolled. A form reset returns to them. */
  defaultValue?: T[]
  /** Runs when a user, a form reset or a controller wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T[],
    details: ChangeDetails<SelectValueChangeReason>
  ) => void
} & (boolean extends Multiple ? never : unknown)

// Only when `Multiple` is `boolean`, like `<Select<string, boolean>>`, so
// a `multiple` known only at run time takes a value of either shape.
/** The value options of a select whose `multiple` is known only at run time. */
type SelectEitherOptions<T, Multiple> = {
  /**
   * Whether several items can be selected.
   * @defaultValue false
   */
  multiple?: boolean
  /** The selected value, or values with `multiple`. Pass it to control the select. */
  value?: T | T[] | null
  /** The value or values selected at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: T | T[] | null
  /** Runs when a user, a form reset or a controller wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: NoInfer<T> | NoInfer<T>[] | null,
    details: ChangeDetails<SelectValueChangeReason>
  ) => void
} & (boolean extends Multiple ? unknown : never)

/** The options of a select that don't depend on `multiple`. */
type SelectSharedOptions<T> = PortalProps & {
  /** Whether the list is open. Pass it to control it. */
  open?: boolean
  /**
   * Whether the list starts open, when uncontrolled.
   * @defaultValue false
   */
  defaultOpen?: boolean
  /** Runs when the list wants to open or close. `details.reason` says why, and `details.cancel()` stops it. */
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<SelectOpenChangeReason>
  ) => void
  /** Runs once the list has finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
  /** The items as data. Renders the list for you, and lets the trigger show labels and find items by typing before the list has ever opened. */
  items?: ListData<T>
  /** Items shown instead of `items` while the search field is empty, like recent choices. Groups work, like `{ type: "group", label: "Recent", items }`. Needs `items` and a `SelectInput`. */
  emptyItems?: ListData<T>
  /** The text in the search field, which filters the list. Pass it to control it. Closing the list empties it. */
  query?: string
  /** The search field's text at first, when uncontrolled. */
  defaultQuery?: string
  /** Runs when the search field's text wants to change: typing, or closing the list, which empties it. */
  onQueryChange?: (
    query: string,
    details: ChangeDetails<SelectQueryChangeReason>
  ) => void
  /**
   * How a `SelectInput` narrows the list: `"contains"`, `"startsWith"`, a function of the item and the text, whose numeric result also sorts data items, or `false` to keep every item, for results a server already filtered.
   * @defaultValue "contains"
   */
  filter?: ListFilter<T>
  /**
   * Whether results are loading or failed, for the status and empty parts. Sets `aria-busy` on the list while loading.
   * @defaultValue "idle"
   */
  status?: AsyncOptionsStatus
  /** Runs when the highlight or scrolling reaches the last item, so the next page can load, like `createAsyncOptions`'s `loadMore`. Not again for the same items, unless the last load failed. */
  onLoadMore?: () => void
  /**
   * What screen readers hear after typing pauses in the search field, when no `SelectStatus` is rendered. Return null for nothing.
   * @defaultValue "3 results", "No results" or "Loading"
   */
  announcement?: (change: ListAnnouncement) => string | null | undefined
  /** What the value shows while nothing is selected. */
  placeholder?: string
  /** The string an item's value submits as and is identified by, for object values. Strings pass through, and objects use their `value` or `id`. */
  itemToValue?: (value: T) => string
  /** The text a value shows in the trigger, for values whose item isn't rendered, like async results. */
  itemToLabel?: (value: T) => string
  /** Whether an item's value is the selected value, for object values that aren't the same object. */
  isItemEqualToValue?: (itemValue: T, value: T) => boolean
  /** Runs when the highlight moves, with the item's index among the visible items, so a virtualized list can scroll to it. */
  onHighlight?: (value: T | null, details: ListHighlightDetails) => void
  /**
   * Whether arrow keys wrap from the last item to the first.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * Keeps focus on the trigger while the list is open, as on a native select: arrow keys, Home, End and typing move the highlight, and the trigger points at the highlighted item with `aria-activedescendant`. A search field in the list still takes focus.
   * @defaultValue false
   */
  virtualFocus?: boolean
  /**
   * `"pointer"`: an outside press only closes the list. `true`: also locks scroll and makes the rest of the page inert. `false`: outside presses reach what they hit.
   * @defaultValue "pointer", or true while it presents as a sheet
   */
  modal?: Extract<Modal, boolean | "pointer">
  /**
   * How the list presents. `"sheet"` slides it up from the bottom of the screen, where it can be swiped away, and `"auto"` does that on small touch screens. Decided each time it opens; the server renders `"popover"` for `"auto"`.
   * @defaultValue "popover"
   */
  presentation?: PresentationSetting<"popover">
  /** Disables the select like a native one: it can't be focused or changed, and the value isn't submitted. */
  disabled?: boolean
  /** Keeps the select focusable and its value submitted, but stops changes. */
  readOnly?: boolean
  /** Blocks form submission until a value is selected, with the browser's own message. */
  required?: boolean
  /** The name the value submits under. Without one, the select submits nothing. */
  name?: string
  /** The id of a form to belong to, when the select isn't inside that form. */
  form?: string
  /** A hint for the browser's autofill, like `"country"`. */
  autoComplete?: string
  /** Opens, closes, reads and sets the select from anywhere. Create one with `createSelectController()`. */
  controller?: SelectController<any, any>
} & DismissOptions<SelectOpenChangeReason> &
  PrimitiveOptions

/**
 * Props of the trigger, in every framework.
 * @stable
 */
type SelectTriggerProps = {
  /**
   * Stops the trigger from opening the list. A native button can't be focused or pressed.
   * @defaultValue false
   */
  disabled?: boolean
  /** Connects a trigger outside the select to the select with this controller. */
  controller?: SelectController<any, any>
}

/**
 * Props of the value, in every framework.
 * @stable
 */
type SelectValueProps = {
  /** What shows while nothing is selected. Overrides the select's `placeholder`. */
  placeholder?: string
  /** With `multiple`, how many labels show before the rest are counted, as in "Apple, Banana and 2 more", joined the way the page's language joins lists, or in English with the default `getMoreLabel`. */
  maxLabels?: number
  /**
   * The words for the labels past `maxLabels`.
   * @defaultValue (count) => `${count} more`
   */
  getMoreLabel?: (count: number) => string
}

/**
 * Props of the content, in every framework.
 * @stable
 */
type SelectContentProps = PositionProps &
  PortalProps & {
    /**
     * Which side of the trigger the list opens on.
     * @defaultValue "bottom"
     */
    side?: PositionProps["side"]
    /**
     * How the list lines up with the trigger along that side.
     * @defaultValue "start"
     */
    align?: PositionProps["align"]
    /**
     * Gap between the trigger and the list, in pixels.
     * @defaultValue 4
     */
    sideOffset?: number
    /**
     * Shift along the trigger, in pixels.
     * @defaultValue 0
     */
    alignOffset?: number
    /**
     * Whether the list overlaps the trigger so the selected item sits on it, like a native select on macOS. Falls back to opening below when there isn't room, and for touch.
     * @defaultValue false
     */
    alignItemWithTrigger?: boolean
    /**
     * Whether the list stays in the page, hidden, while closed. Its content keeps its state between opens.
     * @defaultValue false
     */
    keepMounted?: boolean
  }

/**
 * Props of an item, in every framework.
 * @stable
 */
type SelectItemProps<T = string> = {
  /** The text the trigger shows and typing finds, when the content isn't plain text. Not the accessible name: use `aria-label` for that. */
  label?: string
  /** Keeps the item from being chosen. The keyboard and the pointer skip it. Sets `data-disabled` and `aria-disabled`. */
  disabled?: boolean
  /** The item's position among all items, for virtualized lists that render only some. Sets `aria-posinset` and `aria-setsize`. */
  index?: number
  /** What the value becomes when the item is chosen. A string, or any value with `itemToValue`. */
  value: T
}

/**
 * Props of the check inside an item, in every framework.
 * @stable
 */
type SelectItemIndicatorProps = {
  /**
   * Whether the indicator stays in the page while its item isn't selected, so it can be styled or animated in both states.
   * @defaultValue false
   */
  keepMounted?: boolean
}

/**
 * Props of the clear button, in every framework.
 * @stable
 */
type SelectClearProps = {
  /**
   * Whether the clear button stays in the page while nothing is selected.
   * @defaultValue false
   */
  keepMounted?: boolean
}

/**
 * The state the `trigger` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectTriggerState = {
  /** Whether the list is open. */
  open: boolean
  /** Whether the select is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the select keeps its value but refuses changes, from its `readOnly` option. Sets `aria-readonly`. */
  readOnly: boolean
  /** Whether a value must be selected before the form submits, from its `required` option. Sets `aria-required`. */
  required: boolean
  /** Whether nothing is selected, so the placeholder shows. */
  placeholder: boolean
}
/**
 * The state the `value` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectValueState = {
  /** The selected value: one, `null`, or a list with `multiple`. */
  value: unknown
  /** The selected item's label, the labels joined with commas for several, or with `maxLabels`, as a list in the page's language, like "Apple, Banana and 2 more". An empty string for none. */
  label: string
  /** Each selected item's label, in the order they were selected. */
  labels: string[]
  /** Whether nothing is selected, so the placeholder shows. */
  placeholder: boolean
}
/**
 * The state the `content` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectContentState = {
  /** Whether the list is open. False while it animates out. */
  open: boolean
  /** How it presents this time it's open. */
  presentation: "popover" | "sheet"
  /**
   * Whether several items can be selected.
   * @defaultValue false
   */
  multiple?: boolean
  /** The data items that match the search, for rendering a virtualized list yourself. */
  items: ListData<unknown>
  /** Whether results are loading or failed. */
  status: AsyncOptionsStatus
}
/**
 * The state the `item` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectItemState = {
  /** Whether the item has keyboard focus or is under the pointer. */
  highlighted: boolean
  /** Whether its value is in the select's value, compared with `isItemEqualToValue` when you pass one. */
  selected: boolean
  /** Whether the item's own `disabled` prop is set. It can't be highlighted or chosen. */
  disabled: boolean
}
/**
 * The state the `input` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectInputState = {
  /** Whether the list is open. */
  open: boolean
  /** Whether the select is disabled, by itself or by a `<fieldset>`. A read-only select's search field stays enabled. */
  disabled: boolean
}
/**
 * The state the `empty` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectEmptyState = ListEmptyState
/**
 * The state the `status` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectStatusState = ListStatusState
/**
 * The state the `item-text` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectItemTextState = ListItemTextState
/**
 * The props the `item-icon` slot of `select` takes.
 * @stable
 */
type SelectItemIconProps = ItemIconProps
/**
 * The state the `item-icon` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectItemIconState = ItemIconState
/**
 * The state the `select-all` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectSelectAllState = ListSelectAllState
/**
 * The state the `item-indicator` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectItemIndicatorState = {
  /** Whether its item is selected. While false, the indicator isn't shown unless `keepMounted` is set. */
  selected: boolean
}
/**
 * The state the `clear` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectClearState = {
  /** Whether the select is disabled or read-only, so there's nothing it can clear. */
  disabled: boolean
}
/**
 * The state the `arrow` slot of `select` hands `render` functions and
 * state-based class names.
 * @stable
 */
type SelectArrowState = {
  /** Whether the list is open. */
  open: boolean
}

const selectPrimitive = /* @__PURE__ */ definePrimitive({
  name: "select",
  options: {
    container: "value",
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onOpenChangeComplete: "callback",
    multiple: "boolean",
    items: "value",
    emptyItems: "value",
    query: "string",
    defaultQuery: "string",
    onQueryChange: "callback",
    filter: filterAttribute(["contains", "startsWith"], "contains"),
    status: "string",
    onLoadMore: "callback",
    announcement: "value",
    placeholder: "string",
    itemToValue: "value",
    itemToLabel: "value",
    isItemEqualToValue: "value",
    onHighlight: "callback",
    loop: "boolean",
    virtualFocus: "boolean",
    modal: pointerModalAttribute,
    presentation: "string",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    autoComplete: "string",
    controller: "value",
    dismissible: "boolean",
    onDismissAttempt: "callback",
  },
  state: initialSelectState,
  live: ["highlighted", "labels"],
  controlled: ["open", "value", "query"],
  sync: syncSelectState,
  api: selectApi,
  // An arrow function, so TypeScript infers the slot names before it checks the parts.
  slots: (slot) => selectSlots(slot),
  agent: {
    actions: ["setOpen", "setValue", "clear", "setQuery"],
    closed: true,
  },
})

/**
 * The type of `select`.
 * @stable
 */
interface SelectPrimitive extends WithGeneric<
  WithFeatures<
    typeof selectPrimitive,
    typeof selectSelectAll | typeof selectItemIcons
  >,
  SelectGeneric
> {}

/**
 * The select primitive, with the slots `root`, `label`, `trigger`, `value`,
 * `content`, `viewport`, `list`, `input`, `item`, `item-text`,
 * `item-indicator`, `group`, `group-label`, `separator`, `empty`, `status`,
 * `clear`, `arrow`, `form-input`, `value-input`, `item-icon`, `value-icon`,
 * `select-all`.
 * Its types list the slots of the features its parts register, too.
 * @stable
 */
const select = selectPrimitive as SelectPrimitive

export {
  createSelectController,
  select,
  type SelectArrowState,
  type SelectChangeOptions,
  type SelectClearProps,
  type SelectClearState,
  type SelectContentProps,
  type SelectContentState,
  type SelectController,
  type SelectDismissReason,
  type SelectEmptyState,
  type SelectInputState,
  type SelectItemIconProps,
  type SelectItemIconState,
  type SelectItemIndicatorProps,
  type SelectItemIndicatorState,
  type SelectItemProps,
  type SelectItemState,
  type SelectItemTextState,
  type SelectOpenChangeReason,
  type SelectOptions,
  type SelectPrimitive,
  type SelectQueryChangeReason,
  type SelectSelectAllState,
  type SelectStatusState,
  type SelectTriggerProps,
  type SelectTriggerState,
  type SelectValue,
  type SelectValueChangeReason,
  type SelectValueProps,
  type SelectValueState,
}
export type {
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
} from "../../foundation/lists/listbox"
export type { ListAnnouncement } from "../../foundation/lists/listbox-search"
export type { MatchSegment } from "../../foundation/text/match"
export type { SelectApi } from "./select-api"
