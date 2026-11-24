// Combobox: a text input that filters a list of options and holds the
// chosen one, with chips for several. This module is the public API and
// assembles the primitive. State and the API live in combobox-api.ts, keys
// in combobox-keyboard.ts, and parts and attributes in combobox-parts.ts, on
// the listbox engine and the selection model Select shares.
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
  comboboxSlots,
  type comboboxChips,
  type comboboxCreate,
  type comboboxItemIcons,
  type comboboxSelectAll,
} from "./combobox-parts"
import {
  comboboxApi,
  initialComboboxState,
  syncComboboxState,
} from "./combobox-api"
import type { ComboboxGeneric } from "./combobox-generic"
import { type DismissOptions } from "../../foundation/popups/dismissal"

/**
 * Why a combobox's value wants to change.
 * @stable
 */
type ComboboxValueChangeReason =
  | "item-press"
  | "input-change"
  | "clear-press"
  | "remove-press"
  | "escape-key"
  | "reset"
  | "restore"
  | "imperative"

/**
 * Why a combobox's text wants to change. Closing the list puts back text nobody chose, with the reason it closed.
 * @stable
 */
type ComboboxQueryChangeReason =
  | "trigger-press"
  | "input-change"
  | "item-press"
  | "clear-press"
  | "escape-key"
  | "close-press"
  | "outside-press"
  | "focus-out"
  | "window-blur"
  | "back"
  | "swipe"
  | "reset"
  | "imperative"

/**
 * Why a combobox opened or closed.
 * @stable
 */
type ComboboxOpenChangeReason =
  | "trigger-press"
  | "input-change"
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
type ComboboxDismissReason = Extract<
  ComboboxOpenChangeReason,
  DismissAttemptReason
>

/**
 * The value of a combobox: one item's value or `null`, or a list with `multiple`.
 * @stable
 */
type ComboboxValue<
  T = string,
  Multiple extends boolean | undefined = false,
> = Multiple extends true ? T[] : T | null

/**
 * Options for every write method on a combobox controller.
 * @stable
 */
type ComboboxChangeOptions<Reason extends string> = ChangeOptions<Reason>

/**
 * Opens, closes, reads and sets a combobox from outside it. Pass it as the
 * `controller` option.
 * @stable
 */
function createComboboxController<
  T = string,
  Multiple extends boolean | undefined = false,
>() {
  return createController<{
    /** Whether the list is open. */
    isOpen: () => boolean
    /**
     * Opens or closes the list.
     * Returns false when the change was canceled or it was already open or closed.
     */
    setOpen: (
      open: boolean,
      options?: ComboboxChangeOptions<ComboboxOpenChangeReason>
    ) => boolean
    /**
     * Opens the list, and resolves once it closes, with why and how. Resolves exactly once and never
     * rejects: on the next close from any source, when `signal` aborts, or with reason `"unmount"`
     * when the combobox leaves the page.
     */
    open: (
      options?: ComboboxChangeOptions<ComboboxOpenChangeReason> & {
        /** Closes the list, with reason `"imperative"`, when it aborts. An already aborted signal never opens it. */
        signal?: AbortSignal
      }
    ) => Promise<PopupResult<ComboboxOpenChangeReason, never>>
    /** Closes the list. Returns false when the close was canceled or it was already closed. */
    close: (
      options?: ComboboxChangeOptions<ComboboxOpenChangeReason>
    ) => boolean
    /**
     * Opens the list when it's closed, and closes it when it's open.
     * Returns false when the change was canceled.
     */
    toggle: (
      options?: ComboboxChangeOptions<ComboboxOpenChangeReason>
    ) => boolean
    /** The selected value. */
    getValue: () => ComboboxValue<T, Multiple>
    /**
     * Selects a value, as a user would. A disabled or read-only combobox ignores it.
     * Returns false when the change was canceled or nothing changed.
     */
    setValue: (
      value: ComboboxValue<T, Multiple>,
      options?: ComboboxChangeOptions<ComboboxValueChangeReason>
    ) => boolean
    /**
     * Selects nothing and empties the input.
     * Returns false when the change was canceled or nothing changed.
     */
    clear: (
      options?: ComboboxChangeOptions<ComboboxValueChangeReason>
    ) => boolean
    /** The input's text. */
    getQuery: () => string
    /**
     * Changes the input's text, which filters the list.
     * Returns false when the change was canceled or nothing changed.
     */
    setQuery: (
      query: string,
      options?: ComboboxChangeOptions<ComboboxQueryChangeReason>
    ) => boolean
    /** The value of the highlighted item, or null when none is. */
    getHighlighted: () => T | null
    /**
     * Highlights the item with this value in the open list, scrolled into view, or none with null.
     * Returns false when the list is closed, or no enabled item has the value.
     */
    highlight: (value: T | null) => boolean
    /** Moves focus to the input. */
    focus: () => void
  }>()
}

/**
 * A controller from `createComboboxController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type ComboboxController<
  T = string,
  Multiple extends boolean | undefined = false,
> = ReturnType<typeof createComboboxController<T, Multiple>>

/**
 * The options `combobox` takes. A component takes them as props on its root.
 * `multiple` picks the shape of the value, and `Multiple` true requires it.
 * @stable
 */
// A union on `multiple`, so TypeScript infers `T` through it. The multiple side
// comes first, so a list in a variable infers `T` as its items. A value that is
// itself a list takes `items` or the type: `<Combobox<number[]>>`.
type ComboboxOptions<
  T = string,
  Multiple extends boolean | undefined = false,
> = ComboboxSharedOptions<T> &
  (
    | ComboboxMultipleOptions<T, Multiple>
    | ComboboxSingleOptions<T, Multiple>
    | ComboboxEitherOptions<T, Multiple>
  )

/** The value options of a combobox that selects one item. `Multiple` true or `boolean` rules them out. */
type ComboboxSingleOptions<T, Multiple> = {
  /**
   * Whether several items can be selected. The value is then a list, the list stays open as items toggle, and the input empties after each choice.
   * @defaultValue false
   */
  multiple?: false
  /** The selected value. Pass it to control the combobox. `null` selects nothing. */
  value?: T | ItemsOf<T> | null
  /** The value selected at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: T | ItemsOf<T> | null
  // TypeScript infers `T` from both sides of the union, so a multiple one's
  // state setter would make `T` a list here. `NoInfer` leaves `T` to the
  // value, the items and the multiple side's callback.
  /** Runs when a user, a form reset or a controller wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: NoInfer<T> | null,
    details: ChangeDetails<ComboboxValueChangeReason>
  ) => void
} & (boolean extends Multiple
  ? never
  : [Multiple] extends [true]
    ? never
    : unknown)

/** The value options of a combobox that selects several items. `Multiple` `boolean` rules them out. */
type ComboboxMultipleOptions<T, Multiple> = {
  /** Whether several items can be selected. The value is then a list, the list stays open as items toggle, and the input empties after each choice. */
  multiple: true
  /** The selected values. Pass it to control the combobox. */
  value?: T[]
  /** The values selected at first, when uncontrolled. A form reset returns to them. */
  defaultValue?: T[]
  /** Runs when a user, a form reset or a controller wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T[],
    details: ChangeDetails<ComboboxValueChangeReason>
  ) => void
} & (boolean extends Multiple ? never : unknown)

// Only when `Multiple` is `boolean`, like `<Combobox<string, boolean>>`, so
// a `multiple` known only at run time takes a value of either shape.
/** The value options of a combobox whose `multiple` is known only at run time. */
type ComboboxEitherOptions<T, Multiple> = {
  /**
   * Whether several items can be selected.
   * @defaultValue false
   */
  multiple?: boolean
  /** The selected value, or values with `multiple`. Pass it to control the combobox. */
  value?: T | T[] | null
  /** The value or values selected at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: T | T[] | null
  /** Runs when a user, a form reset or a controller wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: NoInfer<T> | NoInfer<T>[] | null,
    details: ChangeDetails<ComboboxValueChangeReason>
  ) => void
} & (boolean extends Multiple ? unknown : never)

/** The options of a combobox that don't depend on `multiple`. */
type ComboboxSharedOptions<T> = PortalProps & {
  /** The input's text, which filters the list. Pass it to control it. Choosing an item sets it to the item's label, or empties it with `multiple`. */
  query?: string
  /** The input's text at first, when uncontrolled. Defaults to the selected item's label. */
  defaultQuery?: string
  /** Runs when the input's text wants to change: typing, choosing an item, or closing with text that wasn't chosen. */
  onQueryChange?: (
    query: string,
    details: ChangeDetails<ComboboxQueryChangeReason>
  ) => void
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
    details: ChangeDetails<ComboboxOpenChangeReason>
  ) => void
  /** Runs once the list has finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
  /** With `multiple`, how many items can be selected. Once reached, the other items are disabled. */
  maxSelected?: number
  /** The items as data. Renders the list for you, and filters it without rendering every item. */
  items?: ListData<T>
  /** Items shown instead of `items` while the input is empty, like recent choices or suggestions. Groups work, like `{ type: "group", label: "Recent", items }`. Needs `items`. */
  emptyItems?: ListData<T>
  /**
   * How typing narrows the list: `"contains"`, `"startsWith"`, a function of the item and the text, whose numeric result also sorts data items, or `false` to keep every item, for results a server already filtered.
   * @defaultValue "contains"
   */
  filter?: ListFilter<T>
  /** The string an item's value submits as and is identified by, for object values. Strings pass through, and objects use their `value` or `id`. */
  itemToValue?: (value: T) => string
  /** The text a value shows, for values whose item isn't rendered, like async results. */
  itemToLabel?: (value: T) => string
  /** Whether an item's value is the selected value, for object values that aren't the same object. */
  isItemEqualToValue?: (itemValue: T, value: T) => boolean
  /**
   * Whether the first matching item is highlighted while typing, so Enter chooses it. `"always"` also highlights the selected item, or the first, when the list opens, so arrows move from there. `"selected"` highlights only the selected item when the list opens, and nothing when none is.
   * @defaultValue false
   */
  autoHighlight?: boolean | "always" | "selected"
  /**
   * With `multiple`, whether the input keeps its text after an item is chosen.
   * @defaultValue false
   */
  keepQuery?: boolean
  /**
   * What screen readers hear once the Create part's `onCreate` has been pending for a second, so a
   * slow action doesn't pass in silence. Set it in the page's language. An empty string says nothing.
   * @defaultValue "Loading"
   */
  pendingAnnouncement?: string
  /**
   * Whether text that matches no item becomes the value, when Enter is pressed with nothing highlighted, or, without `multiple`, when the list closes. The value is the text itself.
   * @defaultValue false
   */
  allowCustomValue?: boolean
  /**
   * Whether results are loading or failed, for the status and empty parts. Sets `aria-busy` on the list while loading.
   * @defaultValue "idle"
   */
  status?: AsyncOptionsStatus
  /** Runs when the highlight moves, with the item's index among the visible items, so a virtualized list can scroll to it. */
  onHighlight?: (value: T | null, details: ListHighlightDetails) => void
  /** Runs when the highlight or scrolling reaches the last item, so the next page can load, like `createAsyncOptions`'s `loadMore`. Not again for the same items, unless the last load failed. */
  onLoadMore?: () => void
  /**
   * What screen readers hear after typing pauses, when no `ComboboxStatus` is rendered, and when a chip is removed. Return null for nothing.
   * @defaultValue "3 results", "No results", "Loading", or "France removed"
   */
  announcement?: (change: ListAnnouncement) => string | null | undefined
  /**
   * Whether arrow keys wrap from the last item to the first.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * `false`: the page stays usable while the list is open. `"pointer"`: an outside press only closes the list. `true`: also locks scroll and makes the rest of the page inert.
   * @defaultValue false, or true while it presents as a sheet
   */
  modal?: Extract<Modal, boolean | "pointer">
  /**
   * How the list presents. `"sheet"` slides it up from the bottom of the screen with the input in its header, where it can be swiped away, and `"auto"` does that on small touch screens. A tap that opens a sheet leaves the keyboard closed until the input in the header is tapped. Decided each time it opens; the server renders `"popover"` for `"auto"`.
   * @defaultValue "popover"
   */
  presentation?: PresentationSetting<"popover">
  /** Disables the combobox like a native input: it can't be focused or changed, and the value isn't submitted. */
  disabled?: boolean
  /** Keeps the combobox focusable and its value submitted, but stops changes. */
  readOnly?: boolean
  /** Blocks form submission until a value is selected, with the browser's own message. */
  required?: boolean
  /** The name the value submits under. Without one, the combobox submits nothing. */
  name?: string
  /** The id of a form to belong to, when the combobox isn't inside that form. */
  form?: string
  /** Opens, closes, reads and sets the combobox from anywhere. Create one with `createComboboxController()`. */
  controller?: ComboboxController<any, any>
} & DismissOptions<ComboboxOpenChangeReason> &
  PrimitiveOptions

/**
 * Props of the content, in every framework.
 * @stable
 */
type ComboboxContentProps = PositionProps &
  PortalProps & {
    /**
     * Which side of the input the list opens on.
     * @defaultValue "bottom"
     */
    side?: PositionProps["side"]
    /**
     * How the list lines up with the input along that side.
     * @defaultValue "start"
     */
    align?: PositionProps["align"]
    /**
     * Gap between the input and the list, in pixels.
     * @defaultValue 4
     */
    sideOffset?: number
    /**
     * Shift along the input, in pixels.
     * @defaultValue 0
     */
    alignOffset?: number
    /**
     * Whether the list stays in the page, hidden, while closed.
     * @defaultValue false
     */
    keepMounted?: boolean
  }

/**
 * Props of an item, in every framework.
 * @stable
 */
type ComboboxItemProps<T = string> = {
  /** The text the input shows once chosen, and filtering matches, when the content isn't plain text. Not the accessible name: use `aria-label` for that. */
  label?: string
  /** More words filtering matches. */
  keywords?: string[]
  /** Keeps the item from being chosen. The keyboard and the pointer skip it. Sets `data-disabled` and `aria-disabled`. */
  disabled?: boolean
  /** The item's position among all visible items, for virtualized lists that render only some. Sets `aria-posinset` and `aria-setsize`. */
  index?: number
  /** What the value becomes when the item is chosen. A string, or any value with `itemToValue`. */
  value: T
}

/**
 * Props of the create option, in every framework.
 * @stable
 */
type ComboboxCreateProps = {
  /** Runs with the input's text when the create option is chosen. It doesn't change the value by itself. Return a Promise to mark the option pending until it settles; the list closes (or the input empties, with `multiple`) once it resolves. */
  onCreate?: (query: string) => unknown
  /**
   * How many characters the text needs before the option shows.
   * @defaultValue 1
   */
  minLength?: number
}

/**
 * Props of a chip, and of the remove button inside it, in every framework.
 * @stable
 */
type ComboboxChipProps<T = string> = {
  /** The selected value this chip shows. */
  value: T
}

/**
 * Props of the clear button, in every framework.
 * @stable
 */
type ComboboxClearProps = {
  /**
   * Whether the clear button stays in the page while there's nothing to clear.
   * @defaultValue false
   */
  keepMounted?: boolean
}

/**
 * Props of the value, in every framework.
 * @stable
 */
type ComboboxValueProps = {
  /** With `multiple`, how many labels the `label` in its state shows before the rest are counted, as in "France, Chile and 2 more", joined the way the page's language joins lists, or in English with the default `getMoreLabel`. */
  maxLabels?: number
  /**
   * The words for the labels past `maxLabels`.
   * @defaultValue (count) => `${count} more`
   */
  getMoreLabel?: (count: number) => string
}

/**
 * Props of the check inside an item, in every framework.
 * @stable
 */
type ComboboxItemIndicatorProps = {
  /**
   * Whether the indicator stays in the page while its item isn't selected.
   * @defaultValue false
   */
  keepMounted?: boolean
}

/**
 * The state the `input` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxInputState = {
  /** Whether the list is open. */
  open: boolean
  /** Whether the combobox is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the combobox keeps its value but refuses changes, from its `readOnly` option. */
  readOnly: boolean
  /** Whether a value must be selected before the form submits, from its `required` option. */
  required: boolean
}
/**
 * The state the `trigger` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxTriggerState = ComboboxInputState
/**
 * The state the `content` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxContentState = {
  /** Whether the list is open. False while it animates out. */
  open: boolean
  /** How it presents this time it's open. */
  presentation: "popover" | "sheet"
  /**
   * Whether several items can be selected.
   * @defaultValue false
   */
  multiple?: boolean
  /** Whether results are loading or failed. */
  status: AsyncOptionsStatus
  /** The visible items, for rendering a virtualized list yourself. */
  items: ListData<unknown>
}
/**
 * The state the `item` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxItemState = {
  /** Whether the item is highlighted, by the keyboard or the pointer. */
  highlighted: boolean
  /** Whether its value is in the combobox's value, compared with `isItemEqualToValue` when you pass one. */
  selected: boolean
  /** Whether the item can't be chosen, by itself or because `maxSelected` is reached. */
  disabled: boolean
  /** Whether `maxSelected` is reached and the item isn't selected, which is why it's disabled. */
  maxReached: boolean
}
/**
 * The props the `item-icon` slot of `combobox` takes.
 * @stable
 */
type ComboboxItemIconProps = ItemIconProps
/**
 * The state the `item-icon` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxItemIconState = ItemIconState
/**
 * The state the `item-indicator` slot of `combobox` hands `render` functions
 * and state-based class names.
 * @stable
 */
type ComboboxItemIndicatorState = {
  /** Whether its item is selected. While false, the indicator isn't shown unless `keepMounted` is set. */
  selected: boolean
}
/**
 * The state the `create` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxCreateState = {
  /** The text the option would create. */
  query: string
  /** Whether the option is highlighted. */
  highlighted: boolean
  /** Whether `onCreate`'s Promise is running. */
  pending: boolean
  /** Why the last `onCreate` failed, until the next try. */
  error: unknown
}
/**
 * The state the `empty` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxEmptyState = ListEmptyState
/**
 * The state the `item-text` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxItemTextState = ListItemTextState
/**
 * The state the `select-all` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxSelectAllState = ListSelectAllState
/**
 * The state the `chips-overflow` slot of `combobox` hands `render` functions
 * and state-based class names.
 * @stable
 */
type ComboboxChipsOverflowState = {
  /** How many chips don't fit and are hidden. */
  count: number
  /** The labels of the hidden chips. */
  labels: string[]
}
/**
 * The state the `status` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxStatusState = ListStatusState
/**
 * The state the `chip` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxChipState = {
  /** The selected value the chip stands for, from its `value` prop. */
  value: unknown
  /** The text for the value: from `itemToLabel`, its item's label, or the value itself. */
  label: string
  /** Whether the combobox is disabled or read-only, so the chip can't be removed. */
  disabled: boolean
}
/**
 * The state the `clear` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxClearState = {
  /** Whether the combobox is disabled or read-only. */
  disabled: boolean
}
/**
 * The state the `value` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxValueState = {
  /** The selected value: one, `null`, or a list with `multiple`. */
  value: unknown
  /** Each selected item's label, in the order they were selected. */
  labels: string[]
  /** The labels joined with commas, or with `maxLabels`, as a list in the page's language, like "France, Chile and 2 more". An empty string for none. */
  label: string
}
/**
 * The state the `arrow` slot of `combobox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ComboboxArrowState = {
  /** Whether the list is open. */
  open: boolean
}

const comboboxPrimitive = /* @__PURE__ */ definePrimitive({
  name: "combobox",
  options: {
    container: "value",
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    query: "string",
    defaultQuery: "string",
    onQueryChange: "callback",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onOpenChangeComplete: "callback",
    multiple: "boolean",
    maxSelected: "number",
    pendingAnnouncement: "string",
    items: "value",
    emptyItems: "value",
    filter: filterAttribute(["contains", "startsWith"], "contains"),
    itemToValue: "value",
    itemToLabel: "value",
    isItemEqualToValue: "value",
    autoHighlight: (attribute: string | null) =>
      attribute === null
        ? undefined
        : attribute === "always" || attribute === "selected"
          ? attribute
          : attribute !== "false",
    keepQuery: "boolean",
    allowCustomValue: "boolean",
    status: "string",
    onHighlight: "callback",
    onLoadMore: "callback",
    announcement: "value",
    loop: "boolean",
    modal: pointerModalAttribute,
    presentation: "string",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    controller: "value",
    dismissible: "boolean",
    onDismissAttempt: "callback",
  },
  state: initialComboboxState,
  live: ["highlighted", "labels"],
  controlled: ["open", "value", "query"],
  sync: syncComboboxState,
  api: comboboxApi,
  // An arrow function, so TypeScript infers the slot names before it checks the parts.
  slots: (slot) => comboboxSlots(slot),
  agent: {
    actions: ["setOpen", "setValue", "clear", "setQuery"],
    closed: true,
  },
})

/**
 * The type of `combobox`.
 * @stable
 */
interface ComboboxPrimitive extends WithGeneric<
  WithFeatures<
    typeof comboboxPrimitive,
    | typeof comboboxSelectAll
    | typeof comboboxItemIcons
    | typeof comboboxCreate
    | typeof comboboxChips
  >,
  ComboboxGeneric
> {}

/**
 * The combobox primitive, with the slots `root`, `label`, `input`, `trigger`,
 * `content`, `viewport`, `header`, `list`, `item`, `item-text`,
 * `item-indicator`, `group`, `group-label`, `separator`, `empty`, `status`,
 * `clear`, `value`, `arrow`, `form-input`, `value-input`, `chips`, `chip`,
 * `chip-remove`, `chips-overflow`, `create`, `item-icon`, `value-icon`,
 * `select-all`.
 * Its types list the slots of the features its parts register, too.
 * @stable
 */
const combobox = comboboxPrimitive as ComboboxPrimitive

export {
  combobox,
  type ComboboxArrowState,
  type ComboboxChangeOptions,
  type ComboboxChipProps,
  type ComboboxChipsOverflowState,
  type ComboboxChipState,
  type ComboboxClearProps,
  type ComboboxClearState,
  type ComboboxContentProps,
  type ComboboxContentState,
  type ComboboxController,
  type ComboboxCreateProps,
  type ComboboxCreateState,
  type ComboboxDismissReason,
  type ComboboxEmptyState,
  type ComboboxInputState,
  type ComboboxItemIconProps,
  type ComboboxItemIconState,
  type ComboboxItemIndicatorProps,
  type ComboboxItemIndicatorState,
  type ComboboxItemProps,
  type ComboboxItemState,
  type ComboboxItemTextState,
  type ComboboxOpenChangeReason,
  type ComboboxOptions,
  type ComboboxPrimitive,
  type ComboboxQueryChangeReason,
  type ComboboxSelectAllState,
  type ComboboxStatusState,
  type ComboboxTriggerState,
  type ComboboxValue,
  type ComboboxValueChangeReason,
  type ComboboxValueProps,
  type ComboboxValueState,
  createComboboxController,
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
export type { ComboboxApi } from "./combobox-api"
