import {
  tree as treePrimitive,
  treeFromPaths,
  type TreeGroupProps,
  type TreeGroupState,
  type TreeItemData,
  type TreeItemPartProps,
  type TreeItemProps,
  type TreeItemState,
  type TreeOptions,
  type TreeMode,
} from "@ui-sdk/core/tree"
import { isServer } from "@solidjs/web"
import {
  createContext,
  createMemo,
  createSignal,
  For,
  omit,
  onCleanup,
  Show,
  useContext,
  type ComponentProps,
} from "solid-js"
import {
  createParts,
  provided,
  useHandle,
  usePart,
  type PartProps,
} from "./use-primitive"

const parts = createParts(treePrimitive, { root: "div" })

// Whether items have checkboxes, for the items a data tree renders.
const CheckableContext = createContext<() => boolean>(() => false)
// The item a part belongs to, and the parent of the items in its group. A
// group among the item's children says it's there through `setGrouped`, which
// makes the item a branch: Solid's children are lazy, so the item can't look.
const ItemContext = createContext<{
  value: () => string
  props: () => TreeItemProps
  setGrouped: (present: boolean) => void
} | null>(null)

function useItem() {
  const item = useContext(ItemContext)
  if (!item) {
    throw new Error(
      "Tree labels, indicators, checkboxes and groups must be used inside <TreeItem>."
    )
  }
  return item
}

// Element props that mean something else on a tree part.
type Clashing =
  "value" | "defaultValue" | "defaultChecked" | "onChange" | "onSelect"

/**
 * The props of `Tree`.
 * @stable
 */
type TreeProps<Mode extends TreeMode = "single"> = TreeOptions<Mode> &
  Omit<ComponentProps<typeof parts.Root>, keyof TreeOptions> & {}

/**
 * A tree of items that expand and collapse, with one tab stop and arrow keys between its items.
 * @stable
 */
function Tree<Mode extends TreeMode = "single">(props: TreeProps<Mode>) {
  // The items a data tree renders, from the props: core syncs its options
  // after rendering, so asking it would render the items it had before.
  const data = createMemo(
    () => props.items ?? (props.paths && treeFromPaths(props.paths))
  )
  return (
    <CheckableContext value={() => !!props.checkable}>
      <ItemContext value={null}>
        <parts.Root {...props}>
          {/* Without children, a data tree renders its items. */}
          {props.children ?? (
            <Show when={data()}>
              {(items) => <TreeItems items={items()} />}
            </Show>
          )}
        </parts.Root>
      </ItemContext>
    </CheckableContext>
  )
}

/**
 * An item. Put its text in a `TreeItemLabel` and its children in a
 * `TreeGroup`, which makes it a branch. Set `branch` for one whose children
 * load later, or whose group is inside a component of your own.
 * @stable
 */
function TreeItem(
  props: Omit<PartProps<"div", TreeItemState>, Clashing> &
    Omit<TreeItemProps, "parent">
) {
  const parent = useContext(ItemContext)
  // Written by a TreeGroup among the children, while the children render.
  const [grouped, setGrouped] = createSignal(false, { ownedWrite: true })
  const item = () => ({
    value: props.value,
    parent: parent ? parent.value() : null,
    branch: props.branch ?? (grouped() || undefined),
    disabled: props.disabled,
    label: props.label,
  })
  const rest = omit(props, "value", "branch", "disabled", "label")
  const context = { value: () => props.value, props: item, setGrouped }
  // In document order on the server, so the first item claims the tab stop before the items after it.
  return provided(
    <ItemContext value={context}>
      {usePart(treePrimitive, "item", item, rest, "div")}
    </ItemContext>
  )
}

// A part inside an item, which reads the item it belongs to.
function useItemPart(
  slot: "label" | "indicator" | "checkbox",
  props: PartProps<"span", TreeItemState>
) {
  const item = useItem()
  const { instance } = useHandle(treePrimitive)
  return usePart(
    treePrimitive,
    slot,
    () => {
      // Core reads the item's props for the part's state, so they go first.
      // A group that joins or a prop that changes then reaches the part too.
      instance.part("item", item.props())
      return { value: item.value() }
    },
    props,
    "span"
  )
}

/**
 * The item's text, which names it. Render it as a link to make the item one.
 * @stable
 */
function TreeItemLabel(
  props: TreeItemPartProps & PartProps<"span", TreeItemState>
) {
  return useItemPart("label", props)
}

/**
 * The arrow that expands and collapses a branch. Alt or Option expands everything in it.
 * @stable
 */
function TreeItemIndicator(
  props: TreeItemPartProps & PartProps<"span", TreeItemState>
) {
  return useItemPart("indicator", props)
}

/**
 * The item's checkbox, with `checkable`. Screen readers hear the item's checked state instead.
 * @stable
 */
function TreeItemCheckbox(
  props: TreeItemPartProps & PartProps<"span", TreeItemState>
) {
  return useItemPart("checkbox", props)
}

/**
 * A branch's children. Rendered while the branch is expanded or animating closed.
 * @stable
 */
function TreeGroup(props: TreeGroupProps & PartProps<"div", TreeGroupState>) {
  const item = useItem()
  // The server writes an item's attributes before its children render, and
  // never writes signals, so there only `branch` makes an item a branch. A
  // group's item becomes one as the page hydrates.
  if (!isServer) {
    item.setGrouped(true)
    onCleanup(() => item.setGrouped(false))
  }
  const group = () => ({
    value: item.value(),
    keepMounted: props.keepMounted,
    hiddenUntilFound: props.hiddenUntilFound,
  })
  return usePart(
    treePrimitive,
    "group",
    group,
    omit(props, "keepMounted", "hiddenUntilFound"),
    "div"
  )
}

/**
 * Renders data items. Used by data trees, and available for custom layouts.
 * @stable
 */
function TreeItems(props: { items: TreeItemData[] }) {
  const checkable = useContext(CheckableContext)
  return (
    <For each={props.items}>
      {(item) => (
        <TreeItem
          value={item.value}
          branch={item.children !== undefined}
          disabled={item.disabled}
        >
          <Show when={checkable()}>
            <TreeItemCheckbox />
          </Show>
          <TreeItemLabel
            render={
              item.href
                ? (label) => <a {...label} href={item.href} />
                : undefined
            }
          >
            {item.label}
          </TreeItemLabel>
          <Show when={item.children}>
            {(children) => (
              <TreeGroup>
                <TreeItems items={children()} />
              </TreeGroup>
            )}
          </Show>
        </TreeItem>
      )}
    </For>
  )
}

export {
  createTreeController,
  toggleTreeChecked,
  treeCheckedStates,
  treeFromPaths,
  visibleTreeRows,
} from "@ui-sdk/core/tree"
export type {
  ListHighlightDetails,
  TreeActionDetails,
  TreeAnnouncement,
  TreeApi,
  TreeChangeOptions,
  TreeCheckStrategy,
  TreeCheckedChangeReason,
  TreeCheckedState,
  TreeCollection,
  TreeCollectionNode,
  TreeController,
  TreeExpandedChangeReason,
  TreeGroupProps,
  TreeGroupState,
  TreeItemData,
  TreeItemPartProps,
  TreeItemProps,
  TreeItemState,
  TreeOptions,
  TreePrimitive,
  TreeState,
  TreeRow,
  TreeMode,
  TreeValue,
  TreeValueChangeReason,
} from "@ui-sdk/core/tree"

export {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemCheckbox,
  TreeItemIndicator,
  TreeItemLabel,
  TreeItems,
  type TreeProps,
}
