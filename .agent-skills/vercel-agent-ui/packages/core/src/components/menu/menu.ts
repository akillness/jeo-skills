import { initialApple } from "../../foundation/platform/platform"
import {
  createPopupController,
  type Modal,
  type PopupFocusTarget,
} from "../../foundation/popups/popup"
import { pointerModalAttribute } from "../../foundation/popups/modal-attribute"
import { type PortalProps } from "../../foundation/platform/position"
import { type PresentationSetting } from "../../foundation/popups/presentation"
import {
  type ItemIconProps,
  type ItemIconState,
} from "../../foundation/lists/item-icon"
import {
  type ListItem,
  type ListSeparator,
} from "../../foundation/lists/listbox"
import type {
  ChangeDetails,
  DismissAttemptReason,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PrimitiveOptions,
  WithFeatures,
  WithGeneric,
} from "../../foundation/kernel/primitive-types"
import { type DismissOptions } from "../../foundation/popups/dismissal"

import {
  type CheckboxProps,
  type ContentProps,
  type ContextTriggerProps,
  type Focus,
  type IndicatorProps,
  type ItemProps,
  type MenuInternalOptions,
  type MenuState,
  type Presentation,
  type RadioGroupProps,
  type RadioProps,
  type SubTriggerProps,
  type TriggerProps,
  menuApi,
} from "./menu-api"
import {
  menuSlots,
  type menuCheckable,
  type menuContextTrigger,
  type menuItemIcons,
} from "./menu-parts"
import type { MenuGeneric } from "./menu-generic"

/**
 * Why a menu or submenu opened or closed.
 * @stable
 */
type MenuOpenChangeReason =
  | "trigger-press"
  | "trigger-hover"
  | "item-press"
  | "outside-press"
  | "escape-key"
  | "close-press"
  | "focus-out"
  | "window-blur"
  | "submenu-switch"
  | "parent-close"
  | "trigger-release"
  | "back"
  | "shortcut"
  | "swipe"
  | "imperative"

/**
 * The dismissals `dismissible` refuses that `onDismissAttempt` hears about.
 * @stable
 */
type MenuDismissReason = Extract<MenuOpenChangeReason, DismissAttemptReason>

/**
 * Why the menu's payload changed: a trigger or context area opened it, another one took it over while open, or a controller opened it or gave the open one another payload.
 * @stable
 */
type MenuPayloadChangeReason =
  "trigger-press" | "trigger-hover" | "shortcut" | "imperative"

/**
 * Why a checkbox item wants to change.
 * @stable
 */
type MenuCheckedChangeReason = "item-press" | "imperative"

/**
 * Why a radio group's value wants to change.
 * @stable
 */
type MenuValueChangeReason = "item-press" | "imperative"

/**
 * What a menu's `onAction` receives besides the item's value.
 * @stable
 */
type MenuActionDetails = {
  /** The click or key press that ran the item. Undefined when a shortcut ran it while the menu was closed. */
  event?: Event
}

/**
 * What a menu's `onCheckedChange` receives besides the new state: which item changed.
 * @stable
 */
type MenuCheckedChangeDetails = ChangeDetails<MenuCheckedChangeReason> & {
  /** The checkbox item's value. */
  value: string
}

/**
 * What a menu's `onValueChange` receives besides the new value: which group changed.
 * @stable
 */
type MenuValueChangeDetails = ChangeDetails<MenuValueChangeReason> & {
  /** The radio group's `name` in a data menu, or a generated id for a composed group. */
  group: string
}

/**
 * Menus as data: entries, and plain strings for items whose value and label are the string. The same shape renders in every framework.
 * @stable
 */
type MenuData = (MenuDataItem | string)[]
/**
 * One entry of a data menu: an item, a separator, a group, a checkbox item, a
 * radio group or a submenu.
 * @stable
 */
type MenuDataItem =
  | (ListItem & {
      type?: "item"
      closeOnSelect?: boolean
      shortcut?: string
      destructive?: boolean
    })
  | ListSeparator
  | { type: "group"; label?: string; items: MenuData }
  | {
      type: "checkbox"
      closeOnSelect?: boolean
      value: string
      label: string
      checked?: boolean
      defaultChecked?: boolean
      disabled?: boolean
    }
  | {
      type: "radio-group"
      name: string
      label?: string
      value?: string | null
      defaultValue?: string | null
      items: { value: string; label: string; disabled?: boolean }[]
    }
  | { type: "submenu"; label: string; items: MenuData; disabled?: boolean }

/**
 * Options for opening a menu from a controller.
 * @stable
 */
type MenuOpenOptions = {
  /**
   * Where focus goes once it opens: the first or last item, the menu itself, or nowhere.
   * @defaultValue "first"
   */
  focus?: Focus
}

/**
 * Opens, closes and inspects a menu from outside it: a command palette, a
 * hotkey, a test, or triggers outside the menu, like one menu for every row
 * of a table. Pass it as the `controller` option. `Payload` is the type of the
 * data triggers and `open()` pass to the content, and `Result` the type of
 * `close({ returnValue })`, which `open()` resolves with.
 * @stable
 */
function createMenuController<Payload = unknown, Result = string>() {
  return createPopupController<
    Payload,
    MenuOpenChangeReason,
    MenuOpenOptions,
    Result,
    MenuPayloadChangeReason
  >()
}

/**
 * A controller from `createMenuController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type MenuController<Payload = unknown, Result = string> = ReturnType<
  typeof createMenuController<Payload, Result>
>

/**
 * The options `menu` takes. A component takes them as props on its root.
 * @stable
 */
type MenuOptions = PortalProps & {
  /** Whether the menu is open. Pass it to control the menu. */
  open?: boolean
  /**
   * Whether the menu starts open, when uncontrolled.
   * @defaultValue false
   */
  defaultOpen?: boolean
  /** Runs when the menu wants to open or close. `details.reason` says why, and `details.cancel()` stops it. */
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<MenuOpenChangeReason>
  ) => void
  /** Runs once the menu has finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
  /**
   * Runs when the payload the content shows changes: a trigger or context area with another payload
   * opens the menu, or takes the open menu over, which fires no `onOpenChange`, and so does a
   * controller's `open({ payload })` on the open menu. `details.cancel()` keeps the previous payload.
   */
  onPayloadChange?: (
    payload: unknown,
    details: ChangeDetails<MenuPayloadChangeReason>
  ) => void
  /**
   * Runs for every plain item, including items in submenus, with the item's value. Return a Promise
   * to mark the item pending until it settles: it gets `data-pending`, `aria-busy` and
   * `aria-disabled`, the menu stays open, and choosing it again waits. It closes once the Promise
   * resolves, and a rejection keeps it open with the reason in the item's `error` state until the
   * next try.
   */
  onAction?: (value: string, details: MenuActionDetails) => unknown
  /**
   * What screen readers hear once an item has been pending for a second, so a slow action doesn't
   * pass in silence. Set it in the page's language. An empty string says nothing.
   * @defaultValue "Loading"
   */
  pendingAnnouncement?: string
  /** Runs when any checkbox item in the menu or its submenus toggles, with the item's value in `details.value`. Made for data menus. */
  onCheckedChange?: (
    checked: boolean,
    details: MenuCheckedChangeDetails
  ) => void
  /** Runs when any radio group in the menu or its submenus changes, with the group in `details.group`. Made for data menus. */
  onValueChange?: (value: string, details: MenuValueChangeDetails) => void
  /** The menu as data. Renders the content for you, unless you place a content part of your own, and runs the items' shortcuts. */
  items?: MenuData
  /**
   * Whether a data menu runs its items' shortcuts while closed.
   * @defaultValue true
   */
  itemShortcuts?: boolean
  /**
   * Whether arrow keys wrap from the last item to the first.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * Milliseconds the pointer rests on a submenu trigger before its submenu opens.
   * @defaultValue 100
   */
  delay?: number
  /**
   * How the menu presents. `"sheet"` slides it up from the bottom of the screen, where it can be swiped away and submenus open in its place, and `"auto"` does that on small touch screens. Decided each time it opens; the server renders `"popover"` for `"auto"`. A context menu and a menu in a menubar are always popovers.
   * @defaultValue "popover"
   */
  presentation?: PresentationSetting<"popover">
  /** Opens, closes and inspects the menu from anywhere, and connects triggers outside it. Create one with `createMenuController()`. */
  controller?: MenuController<any>
  /**
   * `"pointer"`: an outside press only closes the menu. `true`: also locks scroll, traps focus and makes the rest of the page inert. `false`: outside presses reach what they hit.
   * @defaultValue "pointer", or true while it presents as a sheet
   */
  modal?: Extract<Modal, boolean | "pointer">
} & DismissOptions<MenuOpenChangeReason> &
  PrimitiveOptions

/**
 * The props the `trigger` slot of `menu` takes.
 * @stable
 */
type MenuTriggerProps = TriggerProps & {
  /** Connects a trigger outside the menu, like one per table row, to the menu with this controller. */
  controller?: MenuController<any>
}
/**
 * The props the `context-trigger` slot of `menu` takes.
 * @stable
 */
type MenuContextTriggerProps = ContextTriggerProps & {
  /** Connects an area outside the menu to the menu with this controller. */
  controller?: MenuController<any>
}
/**
 * The props the `item` slot of `menu` takes.
 * @stable
 */
type MenuItemProps = ItemProps
/**
 * The props the `checkbox-item` slot of `menu` takes.
 * @stable
 */
type MenuCheckboxItemProps = CheckboxProps
/**
 * The props the `radio-group` slot of `menu` takes.
 * @stable
 */
type MenuRadioGroupProps<T extends string = string> = Omit<
  RadioGroupProps<T>,
  "name"
> & {
  /** Identifies the group in the menu's `onValueChange`. Defaults to a generated id. */
  name?: string
}
/**
 * The props the `radio-item` slot of `menu` takes.
 * @stable
 */
type MenuRadioItemProps = Omit<RadioProps, "group">
/**
 * The props the `item-indicator` slot of `menu` takes.
 * @stable
 */
type MenuItemIndicatorProps = Omit<IndicatorProps, "item" | "itemKey" | "group">
/**
 * The props the `item-icon` slot of `menu` takes.
 * @stable
 */
type MenuItemIconProps = ItemIconProps
/**
 * Where focus goes when the menu closes while focus was inside it.
 * `"trigger"` returns it to the trigger and `"none"` leaves it. A CSS
 * selector, an element or a function picks a specific element.
 * @stable
 */
type MenuFinalFocus = PopupFocusTarget
/**
 * The props the `content` slot of `menu` takes.
 * @stable
 */
type MenuContentProps = ContentProps
/**
 * The props a submenu's `trigger` takes, the trigger inside a parent menu.
 * @stable
 */
type MenuSubTriggerProps = SubTriggerProps

/**
 * The state the `trigger` slot of `menu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type MenuTriggerState = {
  /** Whether the menu is open from this trigger. */
  open: boolean
  /** Whether the trigger's `disabled` prop is set, or the menubar it's in is disabled. */
  disabled: boolean
}
/**
 * The state the `context-trigger` slot of `menu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type MenuContextTriggerState = MenuTriggerState
/**
 * The state the `content` slot of `menu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type MenuContentState<Payload = unknown> = {
  /** Whether the menu is open. False while it animates out. */
  open: boolean
  /** Whether this is a submenu. */
  nested: boolean
  /** How the menu is shown. */
  presentation: Presentation
  /**
   * The payload of the last open, from the trigger that opened it or a
   * controller, typed as the controller's `Payload`.
   */
  payload: Payload | undefined
}
/**
 * The state the `item` slot of `menu` hands `render` functions and state-based
 * class names.
 * @stable
 */
type MenuItemState = {
  /** Whether the item has keyboard focus or is under the pointer. */
  highlighted: boolean
  /** Whether the item can't be chosen. */
  disabled: boolean
  /** Whether its `onSelect` or `onAction` Promise is running. */
  pending: boolean
  /** Why its last action failed, until it runs again. */
  error: unknown
}
/**
 * The state the `checkbox-item` slot of `menu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type MenuCheckboxItemState = {
  /** Whether the item has keyboard focus or is under the pointer. */
  highlighted: boolean
  /** Whether the item can't be chosen. */
  disabled: boolean
  /** Whether the item is on: its `checked` prop when you pass one, otherwise `defaultChecked` until a press changes it. */
  checked: boolean
}
/**
 * The state the `radio-item` slot of `menu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type MenuRadioItemState = {
  /** Whether the item has keyboard focus or is under the pointer. */
  highlighted: boolean
  /** Whether the item can't be chosen. */
  disabled: boolean
  /** Whether the item is its group's value. */
  checked: boolean
}
/**
 * The state the `radio-group` slot of `menu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type MenuRadioGroupState = {
  /** The selected value, or null when nothing is selected. */
  value: string | null
}
/**
 * The state the `item-indicator` slot of `menu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type MenuItemIndicatorState = {
  /** Whether its checkbox item is on, or its radio item is its group's value. While false, the indicator isn't shown unless `keepMounted` is set. */
  checked: boolean
  /** Whether the item can't be chosen. */
  disabled: boolean
}
/**
 * The state the `item-icon` slot of `menu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type MenuItemIconState = ItemIconState

const menuPrimitive = /* @__PURE__ */ definePrimitive({
  name: "menu",
  options: {
    container: "value",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onOpenChangeComplete: "callback",
    onPayloadChange: "callback",
    onAction: "action",
    pendingAnnouncement: "string",
    onCheckedChange: "callback",
    onValueChange: "callback",
    items: "value",
    itemShortcuts: "boolean",
    loop: "boolean",
    delay: "number",
    presentation: "string",
    controller: "value",
    modal: pointerModalAttribute,
    dismissible: "boolean",
    onDismissAttempt: "callback",
    // Internal: passed by renderers.
    parent: "value",
    menubar: "value",
  },
  state: (options: MenuInternalOptions): MenuState => ({
    open: options.defaultOpen ?? false,
    mounted: options.open ?? options.defaultOpen ?? false,
    highlighted: null,
    values: {},
    presentation: "popover",
    openChild: null,
    apple: initialApple(),
    trigger: null,
    payload: undefined,
    barStop: null,
    barDisabled: !options.parent && !!options.menubar?.()?.internal.disabled(),
    groupLabels: [],
    triggers: [],
    triggerElements: {},
    shortcutItems: undefined,
    pending: [],
    error: null,
  }),
  live: ["highlighted", "shortcutItems"],
  sync: (options) => ({
    shortcutItems: options.itemShortcuts === false ? undefined : options.items,
    ...(options.open === undefined ? {} : { open: options.open }),
  }),
  api: (context) => {
    const api = menuApi(context)
    context.options().parent?.internal.children.add(api)
    return api
  },
  // Checked items keep their state in one record, `values`, so every slot
  // says which of its entries it reads: a toggle reaches the item and its
  // indicator, not every part (`packages/core/test/selects.test.ts`).
  slots: menuSlots,
  agent: { actions: ["setOpen"] },
})

/**
 * The type of `menu`.
 * @stable
 */
interface MenuPrimitive extends WithGeneric<
  WithFeatures<
    typeof menuPrimitive,
    typeof menuContextTrigger | typeof menuCheckable | typeof menuItemIcons
  >,
  MenuGeneric
> {}

/**
 * The menu primitive, with the slots `trigger`, `content`, `viewport`, `item`,
 * `group`, `group-label`, `separator`, `shortcut`, `context-trigger`,
 * `checkbox-item`, `radio-group`, `radio-item`, `item-indicator`, `item-icon`.
 * Its types list the slots of the features its parts register, too.
 * @stable
 */
const menu = menuPrimitive as MenuPrimitive
export {
  createMenuController,
  menu,
  type MenuCheckboxItemProps,
  type MenuCheckboxItemState,
  type MenuActionDetails,
  type MenuCheckedChangeDetails,
  type MenuCheckedChangeReason,
  type MenuContentProps,
  type MenuContentState,
  type MenuContextTriggerProps,
  type MenuContextTriggerState,
  type MenuController,
  type MenuData,
  type MenuDataItem,
  type MenuDismissReason,
  type MenuFinalFocus,
  type MenuItemIconProps,
  type MenuItemIconState,
  type MenuItemIndicatorProps,
  type MenuItemIndicatorState,
  type MenuItemProps,
  type MenuItemState,
  type MenuOpenChangeReason,
  type MenuOpenOptions,
  type MenuOptions,
  type MenuPayloadChangeReason,
  type MenuPrimitive,
  type MenuRadioGroupProps,
  type MenuRadioGroupState,
  type MenuRadioItemProps,
  type MenuRadioItemState,
  type MenuSubTriggerProps,
  type MenuTriggerProps,
  type MenuTriggerState,
  type MenuValueChangeDetails,
  type MenuValueChangeReason,
}
export type { MenuApi } from "./menu-api"
