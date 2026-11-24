import { isDisabled, watchFormDisabled } from "../../foundation/forms/form"
import { hiddenAttrs } from "../../foundation/motion/panel"
import { checkedAttrs, idPart, openAttrs } from "../../foundation/kernel/attrs"
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
import { live } from "../../foundation/kernel/live"
import { selects } from "../../foundation/kernel/selects"
import type {
  TreeCheckStrategy,
  TreeCheckedState,
} from "../../foundation/lists/tree-checked"
import type { ListHighlightDetails } from "../../foundation/lists/listbox"
import type { TreeItemData } from "../../foundation/lists/tree-collection"
import { treeApi, type TreeApi, type TreeStore } from "./tree-api"
import type { TreeGeneric } from "./tree-generic"

/**
 * How many items can be selected: none, like a tree of links, one, or many.
 * Checkboxes are separate, with `checkable`.
 * @stable
 */
type TreeMode = "none" | "single" | "multiple"

/**
 * The selected value: one item's value or `null`, or a list with `mode: "multiple"`.
 * @stable
 */
type TreeValue<Mode extends TreeMode = "single"> = Mode extends "multiple"
  ? string[]
  : string | null

/**
 * Why branches expanded or collapsed: a branch's row was pressed, its
 * indicator was pressed, an arrow key or `*` opened it, find in page matched
 * text inside it, or a controller changed it.
 * @stable
 */
type TreeExpandedChangeReason =
  | "item-press"
  | "trigger-press"
  | "list-navigation"
  | "find-in-page"
  | "imperative"

/**
 * Why the selection changed: an item was pressed, the keyboard moved it, or a controller changed it.
 * @stable
 */
type TreeValueChangeReason = "item-press" | "list-navigation" | "imperative"

/**
 * Why the checked items changed: a checkbox, a row with Space, or a controller.
 * @stable
 */
type TreeCheckedChangeReason = "item-press" | "imperative"

/**
 * What `onAction` receives besides the item's value.
 * @stable
 */
type TreeActionDetails = {
  /** The click or key press that ran it. */
  event?: Event
}

/**
 * What `announcement` is asked to put into words.
 * @stable
 */
type TreeAnnouncement = {
  /** What happened: a branch expanded or collapsed, its children started loading, or loading them failed. */
  type: "expanded" | "collapsed" | "loading" | "load-failed"
  /** The branch's value. */
  value: string
  /** The branch's text. */
  label: string
}

/**
 * Options for every write method on a controller.
 * @stable
 */
type TreeChangeOptions<Reason extends string = string> = ChangeOptions<Reason>

/**
 * Drives a tree from outside it: "Expand all" and "Collapse all" buttons, a
 * link to a file, or a test. Pass it as the `controller` option.
 * @stable
 */
function createTreeController() {
  return createController<{
    /** The values of the expanded branches. */
    getExpanded: () => string[]
    /** Expands exactly these branches. Returns false when canceled. */
    setExpanded: (
      expanded: string[],
      options?: TreeChangeOptions<TreeExpandedChangeReason>
    ) => boolean
    /** Whether a branch is expanded. */
    isExpanded: (value: string) => boolean
    /** Expands a branch, loading its children first with `loadChildren` when it has none. */
    expand: (
      value: string,
      options?: TreeChangeOptions<TreeExpandedChangeReason>
    ) => boolean
    /** Collapses a branch. Focus inside it moves to the branch. */
    collapse: (
      value: string,
      options?: TreeChangeOptions<TreeExpandedChangeReason>
    ) => boolean
    /** Expands a collapsed branch, or collapses an expanded one. */
    toggle: (
      value: string,
      options?: TreeChangeOptions<TreeExpandedChangeReason>
    ) => boolean
    /** Expands every branch, and every branch that renders inside one later. */
    expandAll: (
      options?: TreeChangeOptions<TreeExpandedChangeReason>
    ) => boolean
    /** Collapses every branch. */
    collapseAll: (
      options?: TreeChangeOptions<TreeExpandedChangeReason>
    ) => boolean
    /** The selected value: a value or `null`, or a list with `mode: "multiple"`. */
    getValue: () => string | string[] | null
    /** Selects these items. */
    setValue: (
      value: string | string[] | null,
      options?: TreeChangeOptions<TreeValueChangeReason>
    ) => boolean
    /** The checked value, as `checkStrategy` reports it. */
    getChecked: () => string[]
    /** Sets the checked value. */
    setChecked: (
      checked: string[],
      options?: TreeChangeOptions<TreeCheckedChangeReason>
    ) => boolean
    /** Whether an item's checkbox is checked, unchecked or `"indeterminate"`. */
    checkedState: (value: string) => TreeCheckedState
    /** Expands an item's ancestors, scrolls it into view and focuses it. */
    reveal: (value: string) => void
    /** Focuses an item, or the item with the tab stop. */
    focus: (value?: string) => void
  }>()
}

/**
 * A controller from `createTreeController()`. Pass it as the `controller` option.
 * @stable
 */
type TreeController = ReturnType<typeof createTreeController>

/**
 * The options `tree` takes. A component takes them as props on its root.
 * @stable
 */
type TreeOptions<Mode extends TreeMode = TreeMode> = {
  /** The items as data: each a `value`, a `label` and, for a branch, `children`. Renders them for you, and gives the tree its whole shape even where rows aren't rendered. */
  items?: TreeItemData[]
  /** Items from file paths, like `["src/index.ts", "README.md"]`: each folder becomes a branch, folders first. A path ending in `/` is an empty folder. */
  paths?: readonly string[]
  /**
   * How many items can be selected.
   * @defaultValue "single"
   */
  mode?: Mode
  /** The selected value. Pass it to control the selection. `null` selects nothing, and with `mode: "multiple"` it's a list. */
  value?: TreeValue<Mode>
  /** The value selected at first, when uncontrolled. */
  defaultValue?: TreeValue<Mode>
  /** Runs when the selection wants to change. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: TreeValue<Mode>,
    details: ChangeDetails<TreeValueChangeReason>
  ) => void
  /**
   * Whether moving focus with the keyboard selects, with one item
   * selectable: `"automatic"` selects the focused item, `"manual"` waits for
   * Enter, Space or a press.
   * @defaultValue "manual"
   */
  activation?: "automatic" | "manual"
  /** The expanded branches' values. Pass it to control which branches are open. */
  expanded?: string[]
  /** The branches expanded at first, when uncontrolled. The ancestors of `current` are added. */
  defaultExpanded?: string[]
  /** Runs when branches want to expand or collapse. `details.reason` says why, and `details.cancel()` stops it. */
  onExpandedChange?: (
    expanded: string[],
    details: ChangeDetails<TreeExpandedChangeReason>
  ) => void
  /**
   * Whether pressing a branch's row expands or collapses it. Its indicator always does.
   * @defaultValue true
   */
  expandOnPress?: boolean
  /**
   * Gives every item a tri-state checkbox, kept apart from the selection.
   * Checking a branch checks everything in it, and a branch shows mixed while
   * only some of it is checked. Space checks the focused item.
   * @defaultValue false
   */
  checkable?: boolean
  /** The checked items' values, as `checkStrategy` reports them. Pass it to control the checkboxes. */
  checked?: string[]
  /** The items checked at first, when uncontrolled. A branch stands for everything in it. */
  defaultChecked?: string[]
  /** Runs when checkboxes want to change. `details.reason` says why, and `details.cancel()` stops it. */
  onCheckedChange?: (
    checked: string[],
    details: ChangeDetails<TreeCheckedChangeReason>
  ) => void
  /**
   * Which items the checked value lists: `"leaf"` the checked leaves,
   * `"trunk"` the outermost fully checked items, `"branch"` every fully
   * checked item, and `"independent"` each item on its own, with no cascading.
   * @defaultValue "leaf"
   */
  checkStrategy?: TreeCheckStrategy
  /** Runs when an item is pressed or Enter is pressed on it, apart from selecting it, like opening a file. Return a Promise to mark the item pending until it settles. */
  onAction?: (value: string, details: TreeActionDetails) => unknown
  /**
   * What screen readers hear once an item's action has been pending for a second, so a slow action
   * doesn't pass in silence. Set it in the page's language. An empty string says nothing.
   * @defaultValue "Loading"
   */
  pendingAnnouncement?: string
  /**
   * Loads a branch's children the first time it expands while it has none.
   * The branch shows `data-loading` and expands once the Promise resolves; a
   * rejection marks it `data-failed` and the next expand tries again. Expanding
   * it again while loading cancels through `signal`.
   */
  loadChildren?: (
    value: string,
    details: { signal: AbortSignal }
  ) => void | Promise<unknown>
  /** The value of the item for the current page. It gets `aria-current="page"`, takes the tab stop first, and its ancestors expand, at first and whenever it changes. */
  current?: string | null
  /**
   * Runs when the keyboard moves focus to an item, with its row among the
   * items that show, from 0. A virtualized list scrolls that row into view
   * here, so an item it hasn't rendered can take focus once it does.
   */
  onHighlight?: (value: string, details: ListHighlightDetails) => void
  /**
   * Disables every item. Items stay focusable unless `focusableWhenDisabled` is false.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Whether disabled items take focus, so a screen reader still finds them.
   * @defaultValue true
   */
  focusableWhenDisabled?: boolean
  /**
   * Whether collapsed branches keep their groups in the page, hidden.
   * @defaultValue false
   */
  keepMounted?: boolean
  /**
   * Keeps collapsed groups in the page as `hidden="until-found"`, so the
   * browser's find in page can match their text and expand them.
   * @defaultValue false
   */
  hiddenUntilFound?: boolean
  /**
   * What screen readers hear when a branch expands, collapses, starts loading
   * or fails to load. Return null for nothing. Expanding and collapsing are
   * announced on Apple platforms only, where VoiceOver doesn't read the change.
   * @defaultValue "Expanded", "Collapsed", "Loading", or "Couldn't load src."
   */
  announcement?: (change: TreeAnnouncement) => string | null | undefined
  /** Drives the tree from anywhere. Create one with `createTreeController()`. */
  controller?: TreeController
} & PrimitiveOptions

/**
 * The props the `item` slot of `tree` takes.
 * @stable
 */
type TreeItemProps = {
  /** Identifies the item, unique in the tree. Passed to `onAction`, and listed by the value, `expanded` and `checked`. */
  value: string
  /** @internal The value of the item it's nested in. Adapters pass it from the item around it. */
  parent?: string | null
  /** Whether it's a branch. Adapters set it when it has a group; set it yourself for a branch whose children load later. */
  branch?: boolean
  /** Stops it from being selected, checked, expanded or run. It stays focusable unless `focusableWhenDisabled` is false. */
  disabled?: boolean
  /** The text typeahead matches, when its label isn't plain text. */
  label?: string
}

type ValueProps = {
  /** @internal The value of the item the part belongs to. Parts read it from the item. */
  value?: string
}

type GroupProps = ValueProps & {
  /** Whether the group stays in the page, hidden, while collapsed. Overrides the tree's. */
  keepMounted?: boolean
  /** Whether the group stays findable with `hidden="until-found"` while collapsed. Overrides the tree's. */
  hiddenUntilFound?: boolean
}

/**
 * The props the `label`, `indicator` and `checkbox` slots of `tree` take. They read their item from the item around them.
 * @stable
 */
type TreeItemPartProps = Omit<ValueProps, "value">
/**
 * The props the `group` slot of `tree` takes.
 * @stable
 */
type TreeGroupProps = Omit<GroupProps, "value">

/**
 * What the root's `render` functions and state-based class names receive.
 * @stable
 */
type TreeState = {
  /** How many items can be selected. */
  mode: TreeMode
  /** Whether items have checkboxes. */
  checkable: boolean
  /** Whether the whole tree is disabled, by its `disabled` option or a disabled fieldset around it. */
  disabled: boolean
}

/**
 * What an item's `render` functions and state-based class names receive. Its label, indicator and checkbox get the same.
 * @stable
 */
type TreeItemState = {
  /** Whether it's a branch that's expanded. */
  expanded: boolean
  /** Whether its value is in the tree's value. Separate from `checked`, which its checkbox sets. */
  selected: boolean
  /** Its checkbox: checked, unchecked or `"indeterminate"`. False without `checkable`. */
  checked: TreeCheckedState
  /** Whether it can't be selected, checked, expanded or run. */
  disabled: boolean
  /** Whether it has children, or can load them. */
  branch: boolean
  /** Its depth, 1 at the top level. */
  level: number
  /** Whether it's the current page's item. */
  current: boolean
  /** Whether its children are loading. */
  loading: boolean
  /** Whether loading its children failed. */
  failed: boolean
  /** Whether its `onAction` is still running. */
  pending: boolean
}

/**
 * What a group's `render` functions and state-based class names receive.
 * @stable
 */
type TreeGroupState = {
  /** Whether its branch is expanded. */
  expanded: boolean
  /** The depth of the items in it. */
  level: number
}

type ItemProps = TreeItemProps

// Every part of an item shares its state.
function itemState(
  state: TreeStore,
  key: string,
  props: ItemProps | undefined,
  api: TreeApi
): TreeItemState {
  const branch = api.internal.isBranch(key, props)
  return {
    expanded: branch && state.expanded.includes(key),
    selected: state.selected.includes(key),
    checked: state.checks[key] ?? false,
    disabled: api.internal.isDisabled(state, key, props),
    branch,
    level: api.internal.level(key, props),
    current: state.current === key,
    loading: state.loading.includes(key),
    failed: state.failed.includes(key),
    pending: state.pending.includes(key),
  }
}

const flag = (on: boolean) => (on ? "" : undefined)

// Items nest, so a key or press on a child item bubbles through its parents. Only its own item acts on it.
const ownEvent = (el: HTMLElement | undefined, event?: Event) =>
  !el ||
  !(event?.target instanceof Element) ||
  event.target.closest('[role="treeitem"]') === el

// Data attributes every part of an item writes.
function itemDataAttrs(item: TreeItemState) {
  return {
    "data-level": String(item.level),
    "data-branch": flag(item.branch),
    "data-expanded": flag(item.expanded),
    "data-selected": flag(item.selected),
    "data-disabled": flag(item.disabled),
    "data-current": flag(item.current),
    "data-loading": flag(item.loading),
    "data-failed": flag(item.failed),
    "data-pending": flag(item.pending),
  }
}

// What each item part reads, so a change reaches only the items it touches.
// The value of the item a part is in. Every renderer fills it from the item
// around the part, so it's set by the time the part reads it.
const itemOf = (props: ValueProps) => props.value!
const byItem = ({ props }: { props: ValueProps }) => [itemOf(props)]
const itemReads = {
  selected: ({ key }: { key: string }) => [key],
  expanded: ({ key }: { key: string }) => [key],
  checks: ({ key }: { key: string }) => [key],
  current: ({ key }: { key: string }) => [key],
  loading: ({ key }: { key: string }) => [key],
  failed: ({ key }: { key: string }) => [key],
  pending: ({ key }: { key: string }) => [key],
  value: [],
  checked: [],
  exiting: [],
  version: [],
}
const partReads = {
  selected: byItem,
  expanded: byItem,
  checks: byItem,
  current: byItem,
  loading: byItem,
  failed: byItem,
  pending: byItem,
  value: [],
  checked: [],
  exiting: [],
  active: [],
  version: [],
  siblings: [],
}

const keepsMounted = (state: TreeStore, props: GroupProps) =>
  props.keepMounted ?? state.keepMounted
const findable = (state: TreeStore, props: GroupProps) =>
  props.hiddenUntilFound ?? state.hiddenUntilFound

const treePrimitive = /* @__PURE__ */ definePrimitive({
  name: "tree",
  // `onAction`'s Promise makes its item pending.
  options: {
    items: "value",
    paths: "value",
    mode: "string",
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    activation: "string",
    expanded: "list",
    defaultExpanded: "list",
    onExpandedChange: "callback",
    expandOnPress: "boolean",
    checkable: "boolean",
    checked: "list",
    defaultChecked: "list",
    onCheckedChange: "callback",
    checkStrategy: "string",
    onAction: "action",
    pendingAnnouncement: "string",
    loadChildren: "value",
    current: "string",
    onHighlight: "callback",
    disabled: "boolean",
    focusableWhenDisabled: "boolean",
    keepMounted: "boolean",
    hiddenUntilFound: "boolean",
    announcement: "value",
    controller: "value",
  },
  controlled: ["value", "expanded", "checked"],
  state: (options: TreeOptions): TreeStore => ({
    value: options.defaultValue ?? (options.mode === "multiple" ? [] : null),
    selected: [],
    expanded: options.defaultExpanded ?? [],
    checked: options.defaultChecked ?? [],
    checks: {},
    mode: "single",
    checkable: false,
    checkStrategy: "leaf",
    activation: "manual",
    expandOnPress: true,
    disabled: false,
    formDisabled: false,
    focusableWhenDisabled: true,
    keepMounted: false,
    hiddenUntilFound: false,
    current: null,
    items: undefined,
    paths: undefined,
    active: null,
    exiting: [],
    loading: [],
    failed: [],
    pending: [],
    version: 0,
    siblings: {},
  }),
  live: ["version", "siblings"],
  sync: (options) => ({
    mode: options.mode ?? "single",
    checkable: options.checkable ?? false,
    checkStrategy: options.checkStrategy ?? "leaf",
    activation: options.activation ?? "manual",
    expandOnPress: options.expandOnPress ?? true,
    disabled: options.disabled ?? false,
    focusableWhenDisabled: options.focusableWhenDisabled ?? true,
    keepMounted: options.keepMounted ?? false,
    hiddenUntilFound: options.hiddenUntilFound ?? false,
    current: options.current ?? null,
    items: options.items,
    paths: options.paths,
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.expanded === undefined ? {} : { expanded: options.expanded }),
    ...(options.checked === undefined ? {} : { checked: options.checked }),
  }),
  api: treeApi,
  slots: (slot) => ({
    root: slot<{}, TreeState>({
      role: "tree",
      keys: { none: "Focus stays on an item, whose keydown handles them." },
      state: (state) => ({
        mode: state.mode,
        checkable: state.checkable,
        disabled: isDisabled(state),
      }),
      attrs: (state) => ({
        "aria-multiselectable": state.mode === "multiple" ? "true" : undefined,
        "aria-disabled": isDisabled(state) ? "true" : undefined,
        "data-disabled": flag(isDisabled(state)),
      }),
      bind(el, { api, store }) {
        const cleanups = [
          watchFormDisabled(el, store),
          api.internal.bindRoot(el),
        ]
        return () => cleanups.forEach((cleanup) => cleanup?.())
      },
    }),

    item: slot<ItemProps, TreeItemState>({
      role: "treeitem",
      focus: "roving",
      keys: (state) => [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "*",
        "Enter",
        ...(state.checkable || state.mode !== "none" ? [" "] : []),
        "typeahead",
        ...(state.mode === "multiple" ? ["mod+a"] : []),
      ],
      // Its parent is the item it's inside.
      props: {
        value: "string",
        parent: { kind: "string", from: "item.value" },
        branch: "boolean",
        disabled: "boolean",
        label: "string",
      },
      selects: selects({
        ...itemReads,
        active: ({ key }) => [key, null],
        siblings: ({ props }) => [props.parent ?? ""],
      }),
      state: (state, { key, props, api }) => itemState(state, key, props, api),
      attrs: (state, part) => {
        const { id, key, props, api } = part
        const item = itemState(state, key, props, api)
        const position = api.internal.dataPosition(key)
        return {
          id: `${id}-item-${idPart(key)}`,
          tabindex: api.internal.tabIndex(state, part),
          "aria-labelledby": `${id}-label-${idPart(key)}`,
          "aria-level": String(item.level),
          "aria-posinset": position && String(position.index),
          "aria-setsize": position && String(position.size),
          "aria-expanded": item.branch ? String(item.expanded) : undefined,
          "aria-selected":
            state.mode === "none" ? undefined : String(item.selected),
          "aria-checked": state.checkable
            ? item.checked === "indeterminate"
              ? "mixed"
              : String(item.checked)
            : undefined,
          "aria-disabled": item.disabled ? "true" : undefined,
          "aria-current": item.current ? "page" : undefined,
          "aria-busy": item.loading || item.pending ? "true" : undefined,
          ...itemDataAttrs(item),
          ...(state.checkable ? checkedAttrs(item.checked) : {}),
          style: `--tree-level:${item.level}`,
        }
      },
      // Composed items learn their place among their siblings once they're in the page.
      live: live((state, { key, props, api }) => {
        if (api.internal.dataPosition(key)) {
          return {}
        }
        const position = api.internal.composedPosition(
          state.siblings,
          key,
          props
        )
        return position
          ? {
              "aria-posinset": String(position.index),
              "aria-setsize": String(position.size),
            }
          : {}
      }),
      press: ({ api, key, el }, event) =>
        ownEvent(el, event) && api.internal.press(key, el, event),
      on: {
        keydown: (event, { api, el, key }) =>
          ownEvent(el, event) &&
          api.internal.keydown(event as KeyboardEvent, el, key),
      },
      bind: (el, part) => part.api.internal.bindItem(el, part),
    }),

    // The item's text, which names it. A link here is the item's link.
    label: slot<ValueProps, TreeItemState>({
      props: { value: { kind: "string", from: "item" } },
      selects: selects(partReads),
      state: (state, { props, api }) =>
        itemState(state, itemOf(props), undefined, api),
      // The item's data attributes too, so a row styles from its label, apart from the items nested in it.
      attrs: (state, { id, props, api }) => ({
        id: `${id}-label-${idPart(itemOf(props))}`,
        ...itemDataAttrs(itemState(state, itemOf(props), undefined, api)),
      }),
      // A link inside an item leaves the tab order to the item.
      bind: (el) => {
        if (el.matches("a[href]") && !el.hasAttribute("tabindex")) {
          el.tabIndex = -1
        }
      },
    }),

    // The arrow that expands and collapses a branch. Alt or Option expands everything in it.
    indicator: slot<ValueProps, TreeItemState>({
      props: { value: { kind: "string", from: "item" } },
      selects: selects(partReads),
      state: (state, { props, api }) =>
        itemState(state, itemOf(props), undefined, api),
      attrs: (state, { props, api }) => ({
        "aria-hidden": "true",
        ...itemDataAttrs(itemState(state, itemOf(props), undefined, api)),
      }),
      press: ({ api, props }, event) =>
        api.internal.pressIndicator(itemOf(props), event),
    }),

    // The item's checkbox. Hidden from screen readers, which hear the item's `aria-checked`.
    checkbox: slot<ValueProps, TreeItemState>({
      props: { value: { kind: "string", from: "item" } },
      selects: selects(partReads),
      state: (state, { props, api }) =>
        itemState(state, itemOf(props), undefined, api),
      attrs: (state, { props, api }) => {
        const item = itemState(state, itemOf(props), undefined, api)
        return {
          "aria-hidden": "true",
          ...checkedAttrs(item.checked),
          "data-disabled": flag(item.disabled),
        }
      },
      press: ({ api, props }, event) =>
        api.internal.pressCheckbox(itemOf(props), event),
    }),

    // A branch's children. A collapsed group stays in the page while it animates out.
    group: slot<GroupProps, TreeGroupState>({
      role: "group",
      props: {
        value: { kind: "string", from: "item" },
        keepMounted: "boolean",
        hiddenUntilFound: "boolean",
      },
      selects: selects({ ...partReads, exiting: byItem }),
      present: (state, { props }) =>
        state.expanded.includes(itemOf(props)) ||
        state.exiting.includes(itemOf(props)) ||
        keepsMounted(state, props) ||
        findable(state, props),
      state: (state, { props, api }) => ({
        expanded: state.expanded.includes(itemOf(props)),
        level: api.internal.level(itemOf(props)) + 1,
      }),
      attrs: (state, { id, props }) => {
        const open = state.expanded.includes(itemOf(props))
        return {
          id: `${id}-group-${idPart(itemOf(props))}`,
          ...hiddenAttrs(
            open || state.exiting.includes(itemOf(props)),
            findable(state, props)
          ),
          ...openAttrs(open),
        }
      },
      bind: (el, part) =>
        part.api.internal.bindGroup(
          el,
          itemOf(part.props),
          () => findable(part.store.get(), part.props),
          part
        ),
    }),
  }),
  agent: {
    actions: [
      "setExpanded",
      "expand",
      "collapse",
      "expandAll",
      "collapseAll",
      "setValue",
      "setChecked",
    ],
    closed: true,
    items: (api) => api.internal.items(),
  },
})
/**
 * The type of `tree`.
 * @stable
 */
interface TreePrimitive extends WithGeneric<
  typeof treePrimitive,
  TreeGeneric
> {}

/**
 * The tree primitive, with the slots `root`, `item`, `label`, `indicator`,
 * `checkbox` and `group`. Items nest inside their parent's group, or render
 * flat from `items` data. Render it with an adapter's `usePrimitive`, or
 * compose it inside your own primitive.
 * @stable
 */
const tree = treePrimitive as TreePrimitive

export {
  createTreeController,
  tree,
  type TreeActionDetails,
  type TreeAnnouncement,
  type TreeChangeOptions,
  type TreeCheckedChangeReason,
  type TreeController,
  type TreeExpandedChangeReason,
  type TreeGroupProps,
  type TreeGroupState,
  type TreeItemPartProps,
  type TreeItemProps,
  type TreeItemState,
  type TreeOptions,
  type TreePrimitive,
  type TreeState,
  type TreeMode,
  type TreeValue,
  type TreeValueChangeReason,
}
export type {
  TreeCheckStrategy,
  TreeCheckedState,
} from "../../foundation/lists/tree-checked"
export type {
  TreeCollection,
  TreeCollectionNode,
  TreeItemData,
  TreeRow,
} from "../../foundation/lists/tree-collection"
export {
  toggleTreeChecked,
  treeCheckedStates,
} from "../../foundation/lists/tree-checked"
export {
  createTreeCollection,
  treeDataNodes,
  treeFromPaths,
  visibleTreeRows,
} from "../../foundation/lists/tree-collection"
export type { ListHighlightDetails } from "../../foundation/lists/listbox"
export type { TreeApi } from "./tree-api"
