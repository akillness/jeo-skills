// Listbox: an always-visible list of options to choose one or several from,
// like a `<select size>` or `<select multiple>`, on the listbox engine Select
// and Combobox share. This module is the public API and assembles the
// primitive. State and the API live in listbox-root-api.ts, keys and
// presses in listbox-root-keyboard.ts, parts in listbox-root-parts.ts, and
// the range math in listbox-range.ts.
import type { ItemsOf } from "../../foundation/lists/listbox-value"
import {
  type ItemIconProps,
  type ItemIconState,
} from "../../foundation/lists/item-icon"
import {
  type ListData,
  type ListHighlightDetails,
} from "../../foundation/lists/listbox"
import { listboxSlots } from "./listbox-root-parts"
import {
  initialListboxStore,
  listboxApi,
  syncListboxStore,
} from "./listbox-root-api"
import type { ListboxGeneric } from "./listbox-root-generic"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PrimitiveOptions,
  WithGeneric,
} from "../../foundation/kernel/primitive-types"

/**
 * Why a listbox's value wants to change.
 * @stable
 */
type ListboxValueChangeReason =
  "item-press" | "list-navigation" | "reset" | "restore" | "imperative"

/**
 * The value of a listbox: one item's value or `null`, or a list with `multiple`.
 * @stable
 */
type ListboxValue<
  T = string,
  Multiple extends boolean | undefined = false,
> = Multiple extends true ? T[] : T | null

/**
 * Options for every write method on a listbox controller.
 * @stable
 */
type ListboxChangeOptions = ChangeOptions<ListboxValueChangeReason>

/**
 * Reads and sets a listbox from outside it, like a reset button or a test. Pass it as the `controller` option.
 * @stable
 */
function createListboxController<
  T = string,
  Multiple extends boolean | undefined = false,
>() {
  return createController<{
    /** The selected value. */
    getValue: () => ListboxValue<T, Multiple>
    /**
     * Selects a value, as a user would. A disabled or read-only listbox ignores it.
     * Returns false when the change was canceled or nothing changed.
     */
    setValue: (
      value: ListboxValue<T, Multiple>,
      options?: ListboxChangeOptions
    ) => boolean
    /**
     * Selects nothing: `null`, or an empty list with `multiple`.
     * Returns false when the change was canceled or nothing changed.
     */
    clear: (options?: ListboxChangeOptions) => boolean
    /**
     * Selects every enabled item, with `multiple`.
     * Returns false when the change was canceled or nothing changed.
     */
    selectAll: (options?: ListboxChangeOptions) => boolean
    /** The value of the highlighted option, or null when none is, like while focus is outside the list. */
    getHighlighted: () => T | null
    /**
     * Highlights the option with this value, scrolled into view, or none with null. While focus is
     * outside the list, the option takes the tab stop instead, so focus lands on it next.
     * Returns false when no enabled option has the value.
     */
    highlight: (value: T | null) => boolean
    /** Moves focus into the list, onto the option that holds its tab stop. */
    focus: () => void
  }>()
}

/**
 * A controller from `createListboxController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type ListboxController<
  T = string,
  Multiple extends boolean | undefined = false,
> = ReturnType<typeof createListboxController<T, Multiple>>

/**
 * The options `listbox` takes. A component takes them as props on its root.
 * `multiple` picks the shape of the value, and `Multiple` true requires it.
 * @stable
 */
// A union on `multiple`, so TypeScript infers `T` through it. The multiple side
// comes first, so a list in a variable infers `T` as its items. A value that is
// itself a list takes `items` or the type: `<Listbox<number[]>>`.
type ListboxOptions<
  T = string,
  Multiple extends boolean | undefined = false,
> = ListboxSharedOptions<T> &
  (
    | ListboxMultipleOptions<T, Multiple>
    | ListboxSingleOptions<T, Multiple>
    | ListboxEitherOptions<T, Multiple>
  )

/** The value options of a listbox that selects one item. `Multiple` true or `boolean` rules them out. */
type ListboxSingleOptions<T, Multiple> = {
  /**
   * Whether several items can be selected. The value is then a list, Shift selects ranges, and Ctrl or ⌘ with A selects every item.
   * @defaultValue false
   */
  multiple?: false
  /** The selected value. Pass it to control the listbox. `null` selects nothing. */
  value?: T | ItemsOf<T> | null
  /** The value selected at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: T | ItemsOf<T> | null
  // TypeScript infers `T` from both sides of the union, so a multiple one's
  // state setter would make `T` a list here. `NoInfer` leaves `T` to the
  // value, the items and the multiple side's callback.
  /** Runs when a user, a form reset or a controller wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: NoInfer<T> | null,
    details: ChangeDetails<ListboxValueChangeReason>
  ) => void
} & (boolean extends Multiple
  ? never
  : [Multiple] extends [true]
    ? never
    : unknown)

/** The value options of a listbox that selects several items. `Multiple` `boolean` rules them out. */
type ListboxMultipleOptions<T, Multiple> = {
  /** Whether several items can be selected. The value is then a list, Shift selects ranges, and Ctrl or ⌘ with A selects every item. */
  multiple: true
  /** The selected values. Pass it to control the listbox. */
  value?: T[]
  /** The values selected at first, when uncontrolled. A form reset returns to them. */
  defaultValue?: T[]
  /** Runs when a user, a form reset or a controller wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T[],
    details: ChangeDetails<ListboxValueChangeReason>
  ) => void
} & (boolean extends Multiple ? never : unknown)

// Only when `Multiple` is `boolean`, like `<Listbox<string, boolean>>`, so
// a `multiple` known only at run time takes a value of either shape.
/** The value options of a listbox whose `multiple` is known only at run time. */
type ListboxEitherOptions<T, Multiple> = {
  /**
   * Whether several items can be selected.
   * @defaultValue false
   */
  multiple?: boolean
  /** The selected value, or values with `multiple`. Pass it to control the listbox. */
  value?: T | T[] | null
  /** The value or values selected at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: T | T[] | null
  /** Runs when a user, a form reset or a controller wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: NoInfer<T> | NoInfer<T>[] | null,
    details: ChangeDetails<ListboxValueChangeReason>
  ) => void
} & (boolean extends Multiple ? unknown : never)

/** The options of a listbox that don't depend on `multiple`. */
type ListboxSharedOptions<T> = {
  /**
   * Whether the selection follows focus. `"automatic"`: arrow keys, Home, End and typing select the option they move to, and with `multiple` a press replaces the selection while Ctrl or ⌘ adds to it, like a native multiple select. `"manual"`: keys only move focus, and Space, Enter or a press selects, or toggles with `multiple`.
   * @defaultValue "automatic", or "manual" with `multiple`
   */
  activation?: "automatic" | "manual"
  /**
   * Whether pressing the selected item of a single listbox unselects it, so nothing is selected.
   * @defaultValue false
   */
  deselectable?: boolean
  /**
   * Which arrow keys move between items. Horizontal lists use Left and Right, swapped in right-to-left text.
   * @defaultValue "vertical"
   */
  orientation?: "horizontal" | "vertical"
  /**
   * Whether arrow keys wrap from the last item to the first. Shift with an arrow never wraps.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * Keeps focus on the list itself, which points at the highlighted option with `aria-activedescendant`, instead of moving focus onto the options.
   * @defaultValue false
   */
  virtualFocus?: boolean
  /**
   * Whether the list scrolls the option keys move to into view, and the selected option when it first shows. Turn it off when something else scrolls the list, like `bindScrollPicker`.
   * @defaultValue true
   */
  keepInView?: boolean
  /** The items as data. Renders them for you, and lets typing find items a virtualized list hasn't rendered. */
  items?: ListData<T>
  /** The string an item's value submits as and is identified by, for object values. Strings pass through, and objects use their `value` or `id`. */
  itemToValue?: (value: T) => string
  /** Whether an item's value is the selected value, for object values that aren't the same object. */
  isItemEqualToValue?: (itemValue: T, value: T) => boolean
  /** Runs when focus moves to another item, with its index among the items, so a virtualized list can scroll to it. */
  onHighlight?: (value: T | null, details: ListHighlightDetails) => void
  /** Disables the listbox like a native control: its items can't be focused or chosen, and the value isn't submitted. */
  disabled?: boolean
  /** Keeps the listbox focusable and its value submitted, but stops changes. */
  readOnly?: boolean
  /** Blocks form submission until a value is selected, with the browser's own message. */
  required?: boolean
  /** The name the value submits under. Without one, the listbox submits nothing. */
  name?: string
  /** The id of a form to belong to, when the listbox isn't inside that form. */
  form?: string
  /** Reads and sets the listbox from anywhere. Create one with `createListboxController()`. */
  controller?: ListboxController<any, any>
} & PrimitiveOptions

/**
 * Props of an item, in every framework.
 * @stable
 */
type ListboxItemProps<T = string> = {
  /** What the value becomes when the item is chosen. A string, or any value with `itemToValue`. */
  value: T
  /** The text typing finds, when the content isn't plain text. Not the accessible name: use `aria-label` for that. */
  label?: string
  /** Keeps the item from being chosen. Arrow keys, typing and ranges skip it. Sets `data-disabled` and `aria-disabled`. */
  disabled?: boolean
  /** The item's position among all items, for virtualized lists that render only some. Sets `aria-posinset` and `aria-setsize`. */
  index?: number
}

/**
 * Props of the check inside an item, in every framework.
 * @stable
 */
type ListboxItemIndicatorProps = {
  /**
   * Whether the indicator stays in the page while its item isn't selected, so it can be styled or animated in both states.
   * @defaultValue false
   */
  keepMounted?: boolean
}

/**
 * The state the `root` slot of `listbox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ListboxState = {
  /**
   * Whether several items can be selected.
   * @defaultValue false
   */
  multiple?: boolean
  /** Which arrow keys move between items. */
  orientation: "horizontal" | "vertical"
  /** Whether the listbox is disabled, by itself, a Field or a `<fieldset>`. */
  disabled: boolean
  /** Whether the listbox keeps its value but refuses changes, from its `readOnly` option. A form reset still restores it. */
  readOnly: boolean
  /** Whether a value is required. */
  required: boolean
  /** The data items, for rendering a virtualized list yourself. Empty without `items`. */
  items: ListData<unknown>
}
/**
 * The state the `item` slot of `listbox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ListboxItemState = {
  /** Whether the item has focus. */
  highlighted: boolean
  /** Whether its value is in the listbox's value, compared with `isItemEqualToValue` when you pass one. */
  selected: boolean
  /** Whether the item can't be chosen, by itself or a disabled listbox. */
  disabled: boolean
}
/**
 * The state the `item-indicator` slot of `listbox` hands `render` functions
 * and state-based class names.
 * @stable
 */
type ListboxItemIndicatorState = {
  /** Whether its item is selected. While false, the indicator isn't shown unless `keepMounted` is set. */
  selected: boolean
}
/**
 * The props the `item-icon` slot of `listbox` takes.
 * @stable
 */
type ListboxItemIconProps = ItemIconProps
/**
 * The state the `item-icon` slot of `listbox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ListboxItemIconState = ItemIconState

const listboxPrimitive = /* @__PURE__ */ definePrimitive({
  name: "listbox",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    multiple: "boolean",
    activation: "string",
    deselectable: "boolean",
    orientation: "string",
    loop: "boolean",
    virtualFocus: "boolean",
    keepInView: "boolean",
    items: "value",
    itemToValue: "value",
    isItemEqualToValue: "value",
    onHighlight: "callback",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    controller: "value",
  },
  state: initialListboxStore,
  live: ["highlighted"],
  sync: syncListboxStore,
  api: listboxApi,
  // An arrow function, so TypeScript infers the slot names before it checks the parts.
  slots: (slot) => listboxSlots(slot),
  agent: { actions: ["setValue", "clear", "selectAll"], closed: true },
})
/**
 * The type of `listbox`.
 * @stable
 */
interface ListboxPrimitive extends WithGeneric<
  typeof listboxPrimitive,
  ListboxGeneric
> {}

/**
 * The listbox primitive, with the slots `root`, `item`, `item-indicator`,
 * `item-icon`, `group`, `group-label`, `separator`, `form-input`,
 * `value-input`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const listbox = listboxPrimitive as ListboxPrimitive

export {
  createListboxController,
  listbox,
  type ListboxChangeOptions,
  type ListboxController,
  type ListboxItemIconProps,
  type ListboxItemIconState,
  type ListboxItemIndicatorProps,
  type ListboxItemIndicatorState,
  type ListboxItemProps,
  type ListboxItemState,
  type ListboxOptions,
  type ListboxPrimitive,
  type ListboxState,
  type ListboxValue,
  type ListboxValueChangeReason,
}
export type {
  ListData,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
} from "../../foundation/lists/listbox"
export type { ListboxApi } from "./listbox-root-api"
