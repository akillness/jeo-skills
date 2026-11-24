<!--
@component
A tree of items that expand and collapse, with one tab stop and arrow keys between its items.
@stable
-->
<script lang="ts" generics="Mode extends TreeMode = 'single'">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    tree as treePrimitive,
    type ListHighlightDetails,
    type TreeActionDetails,
    type TreeAnnouncement,
    type TreeCheckStrategy,
    type TreeCheckedChangeReason,
    type TreeController,
    type TreeExpandedChangeReason,
    type TreeItemData,
    type TreeState,
    type TreeMode,
    type TreeValue,
    type TreeValueChangeReason,
  } from "@ui-sdk/core/tree"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import {
    DataKey,
    ItemKey,
    type DataContext,
    type ItemContext,
  } from "./context"
  import TreeItems from "./tree-items.svelte"

  let {
    items,
    paths,
    mode,
    value = $bindable(),
    defaultValue,
    activation,
    expanded = $bindable(),
    defaultExpanded,
    expandOnPress,
    checkable,
    checked = $bindable(),
    defaultChecked,
    checkStrategy,
    onAction,
    pendingAnnouncement,
    loadChildren,
    current,
    disabled,
    focusableWhenDisabled,
    keepMounted,
    hiddenUntilFound,
    announcement,
    controller,
    debug,
    onValueChange,
    onExpandedChange,
    onCheckedChange,
    onHighlight,
    children,
    ...rest
  }: PartProps<"div", TreeState> & {
    /** The items as data: each a `value`, a `label` and, for a branch, `children`. Renders them for you, and gives the tree its whole shape even where rows aren't rendered. */
    items?: TreeItemData[]
    /** Items from file paths, like `["src/index.ts", "README.md"]`: each folder becomes a branch, folders first. A path ending in `/` is an empty folder. */
    paths?: readonly string[]
    /** How many items can be selected: `"none"`, `"single"` or `"multiple"`. */
    mode?: Mode
    /** The selected value. Bind it with `bind:value` to control the selection. `null` selects nothing, and with `mode: "multiple"` it's a list. */
    value?: TreeValue<Mode>
    /** The value selected at first, when uncontrolled. */
    defaultValue?: TreeValue<Mode>
    /** Whether moving focus with the keyboard selects, with one item selectable. `"manual"` waits for Enter, Space or a press. */
    activation?: "automatic" | "manual"
    /** The expanded branches' values. Bind it with `bind:expanded` to control which branches are open. */
    expanded?: string[]
    /** The branches expanded at first, when uncontrolled. The ancestors of `current` are added. */
    defaultExpanded?: string[]
    /** Whether pressing a branch's row expands or collapses it. Its indicator always does. */
    expandOnPress?: boolean
    /** Gives every item a tri-state checkbox, kept apart from the selection. */
    checkable?: boolean
    /** The checked items' values, as `checkStrategy` reports them. Bind it with `bind:checked` to control the checkboxes. */
    checked?: string[]
    /** The items checked at first, when uncontrolled. A branch stands for everything in it. */
    defaultChecked?: string[]
    /** Which items the checked value lists: `"leaf"`, `"trunk"`, `"branch"` or `"independent"`. */
    checkStrategy?: TreeCheckStrategy
    /** Runs when an item is pressed or Enter is pressed on it, apart from selecting it. Return a Promise to mark the item pending until it settles. */
    onAction?: (value: string, details: TreeActionDetails) => unknown
    /** What screen readers hear once an item's action has been pending for a second. An empty string says nothing. */
    pendingAnnouncement?: string
    /** Loads a branch's children the first time it expands while it has none. */
    loadChildren?: (
      value: string,
      details: { signal: AbortSignal }
    ) => void | Promise<unknown>
    /** The value of the item for the current page. It gets `aria-current="page"`, takes the tab stop first, and its ancestors expand. */
    current?: string | null
    /** Disables every item. Items stay focusable unless `focusableWhenDisabled` is false. */
    disabled?: boolean
    /** Whether disabled items take focus, so a screen reader still finds them. */
    focusableWhenDisabled?: boolean
    /** Whether collapsed branches keep their groups in the page, hidden. */
    keepMounted?: boolean
    /** Keeps collapsed groups in the page as `hidden="until-found"`, so find in page can match their text and expand them. */
    hiddenUntilFound?: boolean
    /** What screen readers hear when a branch expands, collapses, starts loading or fails to load. Return null for nothing. */
    announcement?: (change: TreeAnnouncement) => string | null | undefined
    /** Drives the tree from anywhere. Create one with `createTreeController()`. */
    controller?: TreeController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when the selection wants to change. `details.reason` says why, and `details.cancel()` stops it. */
    onValueChange?: (
      value: TreeValue<Mode>,
      details: ChangeDetails<TreeValueChangeReason>
    ) => void
    /** Runs when branches want to expand or collapse. `details.reason` says why, and `details.cancel()` stops it. */
    onExpandedChange?: (
      expanded: string[],
      details: ChangeDetails<TreeExpandedChangeReason>
    ) => void
    /** Runs when checkboxes want to change. `details.reason` says why, and `details.cancel()` stops it. */
    onCheckedChange?: (
      checked: string[],
      details: ChangeDetails<TreeCheckedChangeReason>
    ) => void
    /** Runs when the keyboard moves focus to an item, with its row among the items that show, from 0. */
    onHighlight?: (value: string, details: ListHighlightDetails) => void
  } = $props()

  const id = $props.id()
  const tree = usePrimitive(treePrimitive, () => ({
    id,
    items,
    paths,
    mode,
    get value() {
      return value
    },
    defaultValue,
    activation,
    get expanded() {
      return expanded
    },
    defaultExpanded,
    expandOnPress,
    checkable,
    get checked() {
      return checked
    },
    defaultChecked,
    checkStrategy,
    onAction,
    pendingAnnouncement,
    loadChildren,
    current,
    disabled,
    focusableWhenDisabled,
    keepMounted,
    hiddenUntilFound,
    announcement,
    controller,
    debug,
    onValueChange: (
      next: string | string[] | null,
      details: ChangeDetails<TreeValueChangeReason>
    ) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next as TreeValue<Mode>, details)
      if (!details.canceled) {
        value = next as TreeValue<Mode>
      }
    },
    onExpandedChange: (
      next: string[],
      details: ChangeDetails<TreeExpandedChangeReason>
    ) => {
      onExpandedChange?.(next, details)
      if (!details.canceled) {
        expanded = next
      }
    },
    onCheckedChange: (
      next: string[],
      details: ChangeDetails<TreeCheckedChangeReason>
    ) => {
      onCheckedChange?.(next, details)
      if (!details.canceled) {
        checked = next
      }
    },
    onHighlight,
  }))
  provideInstance(treePrimitive, tree)
  setContext<DataContext>(DataKey, { checkable: () => checkable ?? false })
  // Top-level items have no parent, even in a tree nested in another's item.
  setContext<ItemContext | undefined>(ItemKey, undefined)
  const root = useHandlePart(tree, "root")
  // The core reads the items from `items` or `paths`, so they're read here to stay in sync.
  const data = $derived.by(() => {
    items
    paths
    return tree.api.internal.items()
  })
</script>

<!-- Without content, a data tree renders its items. -->
{#snippet content(_state: TreeState)}
  {#if data}<TreeItems items={data} />{/if}
{/snippet}

<Part
  tag="div"
  part={root}
  props={{ ...rest, children: children ?? content }}
/>
