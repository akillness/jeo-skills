// Command: a search field over an always-open list of commands, like a
// command palette. Typing filters and ranks the commands, arrow keys move a
// highlight while focus stays in the field, Enter runs the highlighted one,
// and commands can open pages of more commands. It's built on the listbox
// engine Combobox uses. This module is the public API and assembles the
// primitive; state and the API live in command-api.ts, and parts and
// attributes in command-parts.ts.
import { type AsyncOptionsStatus } from "../../foundation/lists/async-options"
import { commandSlots } from "./command-parts"
import {
  commandApi,
  initialCommandState,
  syncCommandState,
} from "./command-api"
import { type SearchFilter } from "../../foundation/lists/autocomplete-core"
import {
  filterAttribute,
  type ListData,
  type ListEmptyState,
  type ListGroup,
  type ListItem,
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
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

/**
 * Why the highlighted command changed. Moving to another page or typing highlights the best match.
 * @stable
 */
type CommandValueChangeReason =
  | "list-navigation"
  | "item-hover"
  | "input-change"
  | "item-press"
  | "shortcut"
  | "back"
  | "escape-key"
  | "item-removed"
  | "imperative"

/**
 * Why the search text changed. Opening a page empties it, and going back puts that page's text back.
 * @stable
 */
type CommandQueryChangeReason =
  | "input-change"
  | "item-press"
  | "shortcut"
  | "back"
  | "escape-key"
  | "imperative"

/**
 * Why the stack of pages changed: a command opened one, or Backspace or Escape went back.
 * @stable
 */
type CommandPagesChangeReason =
  "item-press" | "shortcut" | "back" | "escape-key" | "imperative"

/**
 * What `onValueChange` receives besides the value: where the highlighted command is.
 * @stable
 */
type CommandValueChangeDetails = ChangeDetails<CommandValueChangeReason> & {
  /** The command's index among the visible commands, for a virtualized list to scroll to. -1 for none. */
  index: number
}

/**
 * What `onAction` receives besides the command's value.
 * @stable
 */
type CommandActionDetails = {
  /** The click or key press that ran it. Undefined for a controller's `run()`. */
  event?: Event
}

/**
 * A command as data.
 * @stable
 */
type CommandDataItem = ListItem & {
  /** A keyboard shortcut that runs the command, like `"mod+p"`, while the list is in the page, whatever page it's on. Shows `⌘P` on Apple platforms and `Ctrl+P` elsewhere. */
  shortcut?: string
  /** Commands on a page of their own. Choosing this command opens the page, and Backspace in the empty field goes back. */
  items?: CommandData
}

/**
 * A labelled group of commands, as data.
 * @stable
 */
type CommandDataGroup = ListGroup<string, CommandDataItem>

/**
 * Commands as data: commands, plain strings, groups and separators. The same shape renders in every framework.
 * @stable
 */
type CommandData = ListData<string, CommandDataItem>

/**
 * Options for every write method on a command controller.
 * @stable
 */
type CommandChangeOptions<Reason extends string> = ChangeOptions<Reason>

/**
 * Reads and drives a command list from outside it. Pass it as the `controller` option.
 * @stable
 */
function createCommandController() {
  return createController<{
    /** The highlighted command's value, or `null`. */
    getValue: () => string | null
    /**
     * Highlights a command, and scrolls it into view.
     * Returns false when the change was canceled or nothing changed.
     */
    setValue: (
      value: string | null,
      options?: CommandChangeOptions<CommandValueChangeReason>
    ) => boolean
    /** The search text. */
    getQuery: () => string
    /**
     * Changes the search text, which filters the commands.
     * Returns false when the change was canceled or nothing changed.
     */
    setQuery: (
      query: string,
      options?: CommandChangeOptions<CommandQueryChangeReason>
    ) => boolean
    /** The stack of open pages, from the first page opened to the current one. Empty on the first page. */
    getPages: () => string[]
    /** Replaces the stack of pages. Returns false when the change was canceled or nothing changed. */
    setPages: (
      pages: string[],
      options?: CommandChangeOptions<CommandPagesChangeReason>
    ) => boolean
    /**
     * Opens a page on top of the current one, by the `value` of a `CommandPage` or a data command.
     * Returns false when the change was canceled or nothing changed.
     */
    push: (
      page: string,
      options?: CommandChangeOptions<CommandPagesChangeReason>
    ) => boolean
    /**
     * Goes back to the previous page, and puts back the search text typed there.
     * Returns false when the change was canceled or nothing changed.
     */
    pop: (options?: CommandChangeOptions<CommandPagesChangeReason>) => boolean
    /** Runs a command, as Enter would: the highlighted one, or the one with this value. */
    run: (value?: string) => void
    /** Moves focus to the search field. */
    focus: () => void
  }>()
}

/**
 * A controller from `createCommandController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type CommandController = ReturnType<typeof createCommandController>

/**
 * The options `command` takes. A component takes them as props on its root.
 * @stable
 */
type CommandOptions = {
  /** The highlighted command's value. Pass it to control the highlight. `null` highlights nothing. */
  value?: string | null
  /** The command highlighted at first, when uncontrolled. Without it, the first command is, with `autoHighlight`. */
  defaultValue?: string | null
  /** Runs when the highlight moves: arrow keys, the pointer, typing, a page change or a controller. `details.index` says where the command is, for virtualized lists. */
  onValueChange?: (
    value: string | null,
    details: CommandValueChangeDetails
  ) => void
  /** The search text, which filters the commands. Pass it to control it. */
  query?: string
  /** The search text at first, when uncontrolled. */
  defaultQuery?: string
  /** Runs when the search text wants to change: typing, opening a page, going back, or a controller. */
  onQueryChange?: (
    query: string,
    details: ChangeDetails<CommandQueryChangeReason>
  ) => void
  /** The stack of open pages, from the first page opened to the current one. Pass it to control it. */
  pages?: string[]
  /**
   * The pages open at first, when uncontrolled.
   * @defaultValue []
   */
  defaultPages?: string[]
  /** Runs when a page opens or Backspace or Escape goes back. */
  onPagesChange?: (
    pages: string[],
    details: ChangeDetails<CommandPagesChangeReason>
  ) => void
  /**
   * Runs when a command runs, with its value: Enter, a click, or its shortcut. Return a Promise to
   * mark the command pending until it settles: it gets `data-pending`, `aria-busy` and
   * `aria-disabled`, and running it again waits. A rejection puts the reason in its `error` state
   * until the next run.
   */
  onAction?: (value: string, details: CommandActionDetails) => unknown
  /**
   * What screen readers hear once a command has been pending for a second, so a slow action
   * doesn't pass in silence. Set it in the page's language. An empty string says nothing.
   * @defaultValue "Loading"
   */
  pendingAnnouncement?: string
  /** The commands as data. Renders them for you, ranked as the user types, with pages for commands that have `items`. */
  items?: CommandData
  /** Commands shown instead of `items` on the first page while the search is empty, like recent or suggested ones. Groups work, like `{ type: "group", label: "Suggestions", items }`. Needs `items`. */
  emptyItems?: CommandData
  /**
   * How typing narrows the list: `"fuzzy"` keeps commands with the text's letters in order, best
   * matches first; `"contains"` and `"startsWith"` match the text itself. A function returns a score
   * (0 hides) or a boolean. `false` keeps every command, for results a server already filtered.
   * Composed commands keep their order, and data commands are ranked by score.
   * @defaultValue "fuzzy"
   */
  filter?: SearchFilter<string>
  /**
   * Whether the first command is highlighted while nothing else is, and the best match as the user
   * types, so Enter runs it.
   * @defaultValue true
   */
  autoHighlight?: boolean
  /**
   * Whether arrow keys wrap from the last command to the first.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * Whether results are loading or failed, for the empty and status parts. Sets `aria-busy` on the list while loading.
   * @defaultValue "idle"
   */
  status?: AsyncOptionsStatus
  /** Runs when the highlight or scrolling reaches the last command, so the next page can load, like `createAsyncOptions`'s `loadMore`. Not again for the same commands, unless the last load failed. */
  onLoadMore?: () => void
  /**
   * What screen readers hear after typing pauses, when no `CommandStatus` is rendered. Return null for nothing.
   * @defaultValue "3 results", "No results" or "Loading"
   */
  announcement?: (change: ListAnnouncement) => string | null | undefined
  /** Reads and drives the list from anywhere. Create one with `createCommandController()`. */
  controller?: CommandController
} & PrimitiveOptions

/**
 * Props of a command, in every framework.
 * @stable
 */
type CommandItemProps = {
  /** Passed to `onAction` and `onValueChange`, and identifies the command. Without it, one is generated. */
  value?: string
  /** The text the search matches, when the content isn't plain text. Not the accessible name: use `aria-label` for that. */
  label?: string
  /** More words the search matches. */
  keywords?: string[]
  /** Keeps the command from running. Arrow keys and the pointer skip it. Sets `data-disabled` and `aria-disabled`. */
  disabled?: boolean
  /** A keyboard shortcut that runs the command while it's in the page, like `"mod+p"`. Sets `aria-keyshortcuts`, and a `CommandShortcut` inside shows it. */
  shortcut?: string
  /** The page choosing this command opens, by the `value` of a `CommandPage`. */
  page?: string
  /** The command's position among all visible commands, for virtualized lists that render only some. Sets `aria-posinset` and `aria-setsize`. */
  index?: number
  /**
   * Runs when the command runs, before `onAction`, with the click or key press that ran it, or a
   * new `select` Event for a shortcut or a controller's `run()`. Call `event.preventDefault()` to
   * skip `onAction` and the page. Return a Promise to mark the command pending until it settles,
   * like `onAction`.
   */
  onSelect?: (event: Event) => unknown
}

/**
 * Props of a page of commands, in every framework.
 * @stable
 */
type CommandPageProps = {
  /** The page's name, which a command's `page` opens. Leave it out for the first page. */
  value?: string
}

/**
 * Props of the keys a shortcut shows, in every framework.
 * @stable
 */
type CommandShortcutProps = {
  /** The keys to show, like `"mod+p"`. Inside a command, its `shortcut`. */
  shortcut?: string
}

/**
 * The state the `root` slot of `command` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CommandState = {
  /** The current page, or `null` on the first page. */
  page: string | null
  /** Whether results are loading. */
  loading: boolean
}
/**
 * The state the `input` slot of `command` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CommandInputState = {
  /** The current page, or `null` on the first page. */
  page: string | null
}
/**
 * The state the `list` slot of `command` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CommandListState = {
  /** Whether results are loading or failed. */
  status: AsyncOptionsStatus
  /** The visible data commands, ranked, for rendering a virtualized list yourself. */
  items: CommandData
}
/**
 * The state the `item` slot of `command` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CommandItemState = {
  /** Whether the command is highlighted, by the keyboard, the pointer or typing. */
  highlighted: boolean
  /** Whether the command can't run. */
  disabled: boolean
  /** Whether its action's Promise is running. */
  pending: boolean
  /** Why its last action failed, until it runs again. */
  error: unknown
}
/**
 * The state the `empty` slot of `command` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CommandEmptyState = ListEmptyState
/**
 * The state the `item-text` slot of `command` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CommandItemTextState = ListItemTextState
/**
 * The props the `item-icon` slot of `command` takes.
 * @stable
 */
type CommandItemIconProps = ItemIconProps
/**
 * The state the `item-icon` slot of `command` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CommandItemIconState = ItemIconState
/**
 * The state the `status` slot of `command` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CommandStatusState = ListStatusState
/**
 * The state the `shortcut` slot of `command` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CommandShortcutState = {
  /** The shortcut formatted for this platform: `⌘P` on Apple platforms and `Ctrl+P` elsewhere. Empty without one. */
  text: string
}

const commandPrimitive = /* @__PURE__ */ definePrimitive({
  name: "command",
  // `onAction`'s Promise makes the command pending.
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    query: "string",
    defaultQuery: "string",
    onQueryChange: "callback",
    pages: "list",
    defaultPages: "list",
    onPagesChange: "callback",
    onAction: "action",
    pendingAnnouncement: "string",
    items: "value",
    emptyItems: "value",
    filter: filterAttribute(["contains", "startsWith", "fuzzy"], "fuzzy"),
    autoHighlight: "boolean",
    loop: "boolean",
    status: "string",
    onLoadMore: "callback",
    announcement: "value",
    controller: "value",
  },
  state: initialCommandState,
  live: ["value", "highlighted"],
  controlled: ["value", "query", "pages"],
  sync: syncCommandState,
  api: commandApi,
  slots: (slot) => commandSlots(slot),
  agent: { actions: ["run", "setValue", "setQuery", "setPages"] },
})

/**
 * The type of `command`.
 * @stable
 */
interface CommandPrimitive extends Named<typeof commandPrimitive> {}

/**
 * The command primitive, with the slots `root`, `input`, `list`, `item`,
 * `item-text`, `item-icon`, `group`, `group-label`, `separator`, `empty`,
 * `status`, `page`, `shortcut`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const command: CommandPrimitive = commandPrimitive

export {
  command,
  type CommandActionDetails,
  type CommandChangeOptions,
  type CommandController,
  type CommandData,
  type CommandDataGroup,
  type CommandDataItem,
  type CommandEmptyState,
  type CommandInputState,
  type CommandItemIconProps,
  type CommandItemIconState,
  type CommandItemProps,
  type CommandItemState,
  type CommandItemTextState,
  type CommandListState,
  type CommandOptions,
  type CommandPageProps,
  type CommandPagesChangeReason,
  type CommandPrimitive,
  type CommandQueryChangeReason,
  type CommandState,
  type CommandShortcutProps,
  type CommandShortcutState,
  type CommandStatusState,
  type CommandValueChangeDetails,
  type CommandValueChangeReason,
  createCommandController,
}
export type { ListFilter, ListSeparator } from "../../foundation/lists/listbox"
export type { ListAnnouncement } from "../../foundation/lists/listbox-search"
export type { MatchSegment } from "../../foundation/text/match"
export type { SearchFilter } from "../../foundation/lists/autocomplete-core"
export type { CommandApi } from "./command-api"
