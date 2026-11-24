// TriggerMenu: suggestions anchored in text, opened by a trigger like "@", "/"
// or "#". It owns a range inside someone else's text, so it reads and writes
// through an editor adapter: a native field, a TokenInput or any editor a
// recipe wraps. This module is the public API and assembles the primitive.
// State and the API live in trigger-menu-api.ts, keys in
// trigger-menu-keyboard.ts, and parts in trigger-menu-parts.ts, on the
// listbox engine and the popup layer Combobox uses.
import {
  type AsyncOptionsContext,
  type AsyncOptionsStatus,
} from "../../foundation/lists/async-options"
import { type PopupResult } from "../../foundation/popups/popup"
import {
  type PortalProps,
  type PositionProps,
} from "../../foundation/platform/position"
import {
  type ItemIconProps,
  type ItemIconState,
} from "../../foundation/lists/item-icon"
import {
  type ListData,
  type ListFilter,
  type ListGroup,
  type ListItem,
} from "../../foundation/lists/listbox"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
  ChangeSource,
  DismissAttemptReason,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PrimitiveOptions,
  WithGeneric,
} from "../../foundation/kernel/primitive-types"
import type {
  TextEditorAdapter,
  TokenInsert,
} from "../../foundation/text/text-editor"
import { triggerMenuSlots } from "./trigger-menu-parts"
import {
  initialTriggerMenuState,
  syncTriggerMenuState,
  triggerMenuApi,
} from "./trigger-menu-api"
import type { TriggerMenuGeneric } from "./trigger-menu-generic"
import type { TriggerMatch, TriggerRule } from "./trigger-match"
import { type DismissOptions } from "../../foundation/popups/dismissal"

/**
 * What an item does once it, and any arguments it asks for, are chosen.
 * @stable
 */
type TriggerAfter = "compose" | "continue" | "submit"

/**
 * A suggestion, as data.
 * @stable
 */
type TriggerMenuDataItem<T = string> = ListItem<T> & {
  /**
   * After choosing it: `"compose"` closes the menu, `"continue"` keeps it open and lists the same
   * trigger's items for the text typed after it, and `"submit"` asks the editor to send. Tab never submits.
   * @defaultValue "compose"
   */
  after?: TriggerAfter
  /** Typed arguments asked for in order once it's chosen, like `/model <name>`. */
  arguments?: TriggerArgument[]
}

/**
 * A labelled group of suggestions, as data.
 * @stable
 */
type TriggerMenuDataGroup<T = string> = ListGroup<T, TriggerMenuDataItem<T>>

/**
 * Suggestions as data: items, plain strings, groups and separators.
 * @stable
 */
type TriggerMenuData<T = string> = ListData<T, TriggerMenuDataItem<T>>

/**
 * Loads suggestions for a query. Aborted when a newer query replaces it.
 * @stable
 */
type TriggerItemsLoader<T = string> = (
  query: string,
  context: AsyncOptionsContext
) => Promise<TriggerMenuData<T>> | TriggerMenuData<T>

/**
 * An argument an item asks for once chosen, like Discord's options.
 * @stable
 */
type TriggerArgument = {
  /** The name it's reported under in `details.arguments`. */
  name: string
  /** Ghost text shown at the caret until it's typed. Defaults to `<name>`. */
  hint?: string
  /**
   * Whether Enter can finish the command without it.
   * @defaultValue false
   */
  required?: boolean
  /** Suggestions for it, as data or a loader. Without them, it's free text and no list shows. */
  items?: TriggerMenuData<string> | TriggerItemsLoader<string>
  /**
   * Whether text that matches no suggestion is accepted, like a combobox's custom value.
   * @defaultValue true
   */
  allowCustomValue?: boolean
}

/**
 * A trigger: where it matches, what it lists and what choosing inserts.
 * @stable
 */
type TriggerDefinition<T = string> = TriggerRule & {
  /**
   * The kind of token choosing an item inserts, where the editor takes tokens.
   * @defaultValue "mention"
   */
  type?: string
  /** Suggestions as data, or a loader given the query and an AbortSignal. Without them, the composed items show. */
  items?: TriggerMenuData<T> | TriggerItemsLoader<T>
  /**
   * How typing narrows data items. Loaded items aren't filtered.
   * @defaultValue "contains"
   */
  filter?: ListFilter<T>
  /** What replaces the trigger and query. Defaults to a token where the editor takes tokens, else the trigger, the label and a space. */
  insert?: (
    item: TriggerMenuDataItem<T>,
    details: { match: TriggerMatch; arguments: Record<string, string> }
  ) => string | TokenInsert
}

/**
 * Why a trigger menu opened or closed.
 * @stable
 */
type TriggerMenuOpenChangeReason =
  | "input-change"
  | "caret-move"
  | "item-press"
  | "escape-key"
  | "close-press"
  | "outside-press"
  | "focus-out"
  | "window-blur"
  | "imperative"
  | "shortcut"

/**
 * The dismissals `dismissible` refuses that `onDismissAttempt` hears about.
 * @stable
 */
type TriggerMenuDismissReason = Extract<
  TriggerMenuOpenChangeReason,
  DismissAttemptReason
>

/**
 * Why a trigger menu's query changed.
 * @stable
 */
type TriggerMenuQueryChangeReason = "input-change" | "item-press" | "imperative"

/**
 * What `onSelect` receives besides the value.
 * @stable
 */
type TriggerMenuSelectDetails<T = string> = {
  /** The trigger that opened the menu, like `"@"`. */
  trigger: string
  /** The trigger, the query and their range in the text, which the insertion replaces. */
  match: TriggerMatch
  /** The chosen item. */
  item: TriggerMenuDataItem<T>
  /** The arguments typed or chosen for it, by name. */
  arguments: Record<string, string>
  /** Replaces the match with your own text or token now, instead of the default insertion. */
  insert: (content: string | TokenInsert) => void
  /** Inserts the token as pending until `promise` settles, like returning it. For web components, whose events return nothing. */
  waitUntil: (promise: PromiseLike<void | Partial<TokenInsert>>) => void
  /** The key or click that chose it. */
  event?: KeyboardEvent | MouseEvent
  /** How the user chose it. */
  source: ChangeSource
  /** Skips the default insertion. */
  preventDefault: () => void
  /** Whether `preventDefault()` was called, or `insert()` replaced the match. */
  readonly defaultPrevented: boolean
}

/**
 * Options for every write method on a trigger menu controller.
 * @stable
 */
type TriggerMenuChangeOptions<Reason extends string> = ChangeOptions<Reason>

/**
 * Opens, closes, reads and inserts from outside a trigger menu. Pass it as the `controller` option.
 * @stable
 */
function createTriggerMenuController() {
  return createController<{
    /** Whether the menu is open. */
    isOpen: () => boolean
    /**
     * Opens or closes the menu. Opening needs a match; see `open()` for one that types the trigger.
     * Returns false when the change was canceled or it was already open or closed.
     */
    setOpen: (
      open: boolean,
      options?: TriggerMenuChangeOptions<TriggerMenuOpenChangeReason>
    ) => boolean
    /**
     * Opens the menu for `trigger`, typing it at the caret first unless a match for it is already
     * there, and resolves once it closes. Resolves exactly once and never rejects.
     */
    open: (
      options?: TriggerMenuChangeOptions<TriggerMenuOpenChangeReason> & {
        /** The trigger to open, like `"/"`. Defaults to the first trigger. */
        trigger?: string
        /** Closes the menu, with reason `"imperative"`, when it aborts. */
        signal?: AbortSignal
      }
    ) => Promise<PopupResult<TriggerMenuOpenChangeReason, never>>
    /**
     * Closes the menu. The match isn't dismissed, so typing in it opens it again.
     * Returns false when the close was canceled or it was already closed.
     */
    close: (
      options?: TriggerMenuChangeOptions<TriggerMenuOpenChangeReason>
    ) => boolean
    /** The text after the trigger, or after the current argument's start. Empty while closed. */
    getQuery: () => string
    /** The current match, or null. */
    getMatch: () => TriggerMatch | null
    /** Replaces the current match with text or a token, or inserts at the caret without one. */
    insert: (content: string | TokenInsert) => void
    /** Moves focus to the editor. */
    focus: () => void
  }>()
}

/**
 * A controller from `createTriggerMenuController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type TriggerMenuController = ReturnType<typeof createTriggerMenuController>

/**
 * The options `triggerMenu` takes. A component takes them as props on its
 * root.
 * @stable
 */
type TriggerMenuOptions<T = string> = PortalProps & {
  /** The texts that open the menu, and what each one lists. */
  triggers: TriggerDefinition<T>[]
  /** The editor the menu reads and writes, for editors without a part of their own, like Tiptap. TriggerMenuInput and a surrounding TokenInput set it for you. */
  editor?: TextEditorAdapter
  /** Whether the menu is open. Pass it to control it; it shows only while there's a match. */
  open?: boolean
  /** Runs when the menu wants to open or close. `details.reason` says why, `details.trigger` which trigger, and `details.cancel()` stops it. */
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<TriggerMenuOpenChangeReason> & {
      trigger: string | null
    }
  ) => void
  /** Runs once the menu has finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
  /** Runs when the text after the trigger changes. Read-only: it's the editor's text. `details.argument` names the argument being typed. */
  onQueryChange?: (
    query: string,
    details: ChangeDetails<TriggerMenuQueryChangeReason> & {
      trigger: string
      argument?: string
    }
  ) => void
  /**
   * Runs when an item, with every required argument, is chosen. The default insertion follows
   * unless `details.preventDefault()`. Return a Promise and a token is inserted at once as pending,
   * updated with what it resolves to and removed if it rejects; the menu closes either way.
   */
  onSelect?: (
    value: T,
    details: TriggerMenuSelectDetails<T>
  ) => void | Promise<void | Partial<TokenInsert>>
  /**
   * What screen readers hear once an `onSelect` Promise has been pending for a second, so a slow action
   * doesn't pass in silence. Set it in the page's language. An empty string says nothing.
   * @defaultValue "Loading"
   */
  pendingAnnouncement?: string
  /**
   * Whether items that come from outside are loading or failed, for the status and empty parts. Loaders report their own.
   * @defaultValue "idle"
   */
  status?: AsyncOptionsStatus
  /**
   * Whether the first match is highlighted so Enter and Tab choose it. Visual only: screen readers
   * hear about it once an arrow key moves the highlight, so typed characters keep being echoed.
   * @defaultValue true
   */
  autoHighlight?: boolean
  /**
   * Whether arrow keys wrap from the last item to the first.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * Reopens a match dismissed with Escape, with the caret in it.
   * @defaultValue "ctrl+space"
   */
  shortcut?: string
  /** Opens, closes and inserts from anywhere. Create one with `createTriggerMenuController()`. */
  controller?: TriggerMenuController
} & DismissOptions<TriggerMenuOpenChangeReason> &
  PrimitiveOptions

/**
 * Props of the content, in every framework.
 * @stable
 */
type TriggerMenuContentProps = PositionProps &
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
     * Gap between the line of text and the list, in pixels.
     * @defaultValue 4
     */
    sideOffset?: number
    /**
     * Shift along the text, in pixels.
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
type TriggerMenuItemProps<T = string> = {
  /** What `onSelect` receives when the item is chosen. */
  value: T
  /** The text inserted and matched, when the content isn't plain text. */
  label?: string
  /** More words filtering matches. */
  keywords?: string[]
  /** Keeps the item from being chosen. It can still be highlighted, as the listbox pattern asks. */
  disabled?: boolean
  /** Runs before the menu's `onSelect`. `details.preventDefault()` skips the default insertion. */
  onSelect?: (
    value: T,
    details: TriggerMenuSelectDetails<T>
  ) => void | Promise<void | Partial<TokenInsert>>
}

/**
 * The state the `input` slot of `triggerMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TriggerMenuInputState = {
  /** Whether the menu is open. It opens on a typed trigger, and closes when nothing matches unless it's loading or renders an empty part. */
  open: boolean
  /** The trigger of the current match, like `"@"`, or null. */
  trigger: string | null
}
/**
 * The state the `content` slot of `triggerMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TriggerMenuContentState = {
  /** Whether the menu is open. False while it animates out. */
  open: boolean
  /** The trigger of the current match, like `"@"`, or null. */
  trigger: string | null
  /** The text after the trigger, or after the current argument's start. */
  query: string
  /** The argument being typed, by name, or null at the first level. */
  argument: string | null
  /** Whether items are loading or failed. */
  status: AsyncOptionsStatus
  /** The visible data items, for rendering them yourself. */
  items: TriggerMenuData<unknown>
}
/**
 * The props the `item-icon` slot of `triggerMenu` takes.
 * @stable
 */
type TriggerMenuItemIconProps = ItemIconProps
/**
 * The state the `item-icon` slot of `triggerMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TriggerMenuItemIconState = ItemIconState
/**
 * The state the `item` slot of `triggerMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TriggerMenuItemState = {
  /** Whether the item is highlighted, by the keyboard or the pointer. */
  highlighted: boolean
  /** Whether the item can't be chosen. */
  disabled: boolean
}
/**
 * The state the `empty` slot of `triggerMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TriggerMenuEmptyState = {
  /** Whether items are loading. */
  loading: boolean
  /** Whether no item matches. */
  empty: boolean
  /** The text after the trigger. */
  query: string
}
/**
 * The state the `status` slot of `triggerMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TriggerMenuStatusState = {
  /** Whether the menu is open. It opens on a typed trigger, and closes when nothing matches unless it's loading or renders an empty part. */
  open: boolean
  /** Whether items are loading or failed. */
  status: AsyncOptionsStatus
  /** Whether items are loading. */
  loading: boolean
  /** How many items match. */
  count: number
  /** The argument being typed, by name, or null. */
  argument: string | null
}
/**
 * The state the `hint` slot of `triggerMenu` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TriggerMenuHintState = {
  /** The argument being typed, by name, or null. */
  argument: string | null
  /** The ghost text: the hints of the arguments still to type. */
  hint: string
}

const triggerMenuPrimitive = /* @__PURE__ */ definePrimitive({
  name: "trigger-menu",
  // `onSelect`'s Promise makes the token it inserts pending.
  options: {
    container: "value",
    triggers: "value",
    editor: "value",
    open: "boolean",
    onOpenChange: "callback",
    onOpenChangeComplete: "callback",
    onQueryChange: "callback",
    onSelect: "action",
    pendingAnnouncement: "string",
    status: "string",
    autoHighlight: "boolean",
    loop: "boolean",
    shortcut: "string",
    controller: "value",
    dismissible: "boolean",
    onDismissAttempt: "callback",
  },
  state: initialTriggerMenuState,
  live: ["highlighted", "navigated"],
  controlled: ["open"],
  sync: syncTriggerMenuState,
  api: triggerMenuApi,
  slots: (slot) => triggerMenuSlots(slot),
  agent: { actions: ["setOpen", "insert"] },
})
/**
 * The type of `triggerMenu`.
 * @stable
 */
interface TriggerMenuPrimitive extends WithGeneric<
  typeof triggerMenuPrimitive,
  TriggerMenuGeneric
> {}

/**
 * The trigger menu primitive, with the slots `input`, `content`, `list`,
 * `item`, `item-icon`, `group`, `group-label`, `separator`, `empty`, `status`,
 * `hint`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const triggerMenu = triggerMenuPrimitive as TriggerMenuPrimitive

export {
  createTriggerMenuController,
  type TriggerAfter,
  type TriggerArgument,
  type TriggerDefinition,
  type TriggerItemsLoader,
  triggerMenu,
  type TriggerMenuChangeOptions,
  type TriggerMenuContentProps,
  type TriggerMenuContentState,
  type TriggerMenuController,
  type TriggerMenuData,
  type TriggerMenuDataGroup,
  type TriggerMenuDataItem,
  type TriggerMenuDismissReason,
  type TriggerMenuEmptyState,
  type TriggerMenuHintState,
  type TriggerMenuInputState,
  type TriggerMenuItemIconProps,
  type TriggerMenuItemIconState,
  type TriggerMenuItemProps,
  type TriggerMenuItemState,
  type TriggerMenuOpenChangeReason,
  type TriggerMenuOptions,
  type TriggerMenuPrimitive,
  type TriggerMenuQueryChangeReason,
  type TriggerMenuSelectDetails,
  type TriggerMenuStatusState,
}
export type { TriggerMenuApi } from "./trigger-menu-api"
export type {
  TriggerBoundary,
  TriggerMatch,
  TriggerRule,
} from "./trigger-match"
export type {
  EditorChange,
  EditorReplaceOptions,
  TextEditorAdapter,
  TextRange,
  TextRect,
  Token,
  TokenInsert,
} from "../../foundation/text/text-editor"
export type {
  ListFilter,
  ListItem,
  ListSeparator,
} from "../../foundation/lists/listbox"
export { textFieldAdapter } from "../../foundation/text/caret"
