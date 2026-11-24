<!--
@component
A search field over an always-open list of commands. Renders a `div` around them.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import type { AsyncOptionsStatus } from "@ui-sdk/core/async-options"
  import {
    command as commandPrimitive,
    type CommandActionDetails,
    type CommandController,
    type CommandData,
    type CommandPagesChangeReason,
    type CommandQueryChangeReason,
    type CommandState,
    type CommandValueChangeDetails,
    type ListAnnouncement,
    type SearchFilter,
  } from "@ui-sdk/core/command"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import { useOwnPart } from "../own-part.svelte"
  import { useControllerEntry } from "../popup.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import { OwnListKey } from "./context"
  import CommandList from "./command-list.svelte"

  type QueryDetails = ChangeDetails<CommandQueryChangeReason>
  type PagesDetails = ChangeDetails<CommandPagesChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    query = $bindable(),
    defaultQuery,
    pages = $bindable(),
    defaultPages,
    onAction,
    pendingAnnouncement,
    items,
    emptyItems,
    filter,
    announcement,
    autoHighlight,
    loop,
    status,
    controller,
    debug,
    onValueChange,
    onQueryChange,
    onPagesChange,
    onLoadMore,
    children,
    ...rest
  }: PartProps<"div", CommandState> & {
    /** The highlighted command's value. Bind it with `bind:value` to control the highlight. `null` highlights nothing. */
    value?: string | null
    /** The command highlighted at first, when uncontrolled. Without it, the first command is, with `autoHighlight`. */
    defaultValue?: string | null
    /** The search text, which filters the commands. Bind it with `bind:query` to control it. */
    query?: string
    /** The search text at first, when uncontrolled. */
    defaultQuery?: string
    /** The stack of open pages, from the first page opened to the current one. Bind it with `bind:pages` to control it. */
    pages?: string[]
    /** The pages open at first, when uncontrolled. */
    defaultPages?: string[]
    /** Runs when a command runs, with its value: Enter, a click, or its shortcut. Return a Promise to mark the command pending until it settles. */
    onAction?: (value: string, details: CommandActionDetails) => unknown
    /** What screen readers hear once a command has been pending for a second. An empty string says nothing. */
    pendingAnnouncement?: string
    /** The commands as data. Renders them for you, ranked as the user types, with pages for commands that have `items`. */
    items?: CommandData
    /** Commands shown instead of `items` on the first page while the search is empty, like recent ones. Needs `items`. */
    emptyItems?: CommandData
    /** How typing narrows the list: `"fuzzy"`, `"contains"`, `"startsWith"`, a scoring function, or `false` to keep every command. */
    filter?: SearchFilter<string>
    /** What screen readers hear after typing pauses, when no `CommandStatus` is rendered. Return null for nothing. */
    announcement?: (change: ListAnnouncement) => string | null | undefined
    /** Whether the first command is highlighted while nothing else is, and the best match as the user types. */
    autoHighlight?: boolean
    /** Whether arrow keys wrap from the last command to the first. */
    loop?: boolean
    /** Whether results are loading or failed, for the empty and status parts. */
    status?: AsyncOptionsStatus
    /** Reads and drives the list from anywhere. Create one with `createCommandController()`. */
    controller?: CommandController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when the highlight moves: arrow keys, the pointer, typing, a page change or a controller. `details.cancel()` stops it. */
    onValueChange?: (
      value: string | null,
      details: CommandValueChangeDetails
    ) => void
    /** Runs when the search text wants to change: typing, opening a page, going back, or a controller. `details.cancel()` stops it. */
    onQueryChange?: (query: string, details: QueryDetails) => void
    /** Runs when a page opens or Backspace or Escape goes back. `details.cancel()` stops it. */
    onPagesChange?: (pages: string[], details: PagesDetails) => void
    /** Runs when the highlight or scrolling reaches the last command, so the next page can load. */
    onLoadMore?: () => void
  } = $props()

  const id = $props.id()
  const command = usePrimitive(commandPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    get query() {
      return query
    },
    defaultQuery,
    get pages() {
      return pages
    },
    defaultPages,
    onAction,
    pendingAnnouncement,
    items,
    emptyItems,
    filter,
    announcement,
    autoHighlight,
    loop,
    status,
    controller,
    debug,
    onValueChange: (
      next: string | null,
      details: CommandValueChangeDetails
    ) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onQueryChange: (next: string, details: QueryDetails) => {
      onQueryChange?.(next, details)
      if (!details.canceled) {
        query = next
      }
    },
    onPagesChange: (next: string[], details: PagesDetails) => {
      onPagesChange?.(next, details)
      if (!details.canceled) {
        pages = next
      }
    },
    onLoadMore,
  }))
  useControllerEntry(() => controller, command)
  provideInstance(commandPrimitive, command)
  // A data command renders its list, unless a CommandList is among the children.
  const own = useOwnPart(OwnListKey)
  const root = useHandlePart(command, "root")
</script>

{#snippet content(state: CommandState)}
  {@render children?.(state)}
  {#if items && !own()}<CommandList fromRoot />{/if}
{/snippet}

<Part tag="div" part={root} props={{ ...rest, children: content }} />
