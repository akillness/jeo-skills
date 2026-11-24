import {
  tree as treePrimitive,
  type TreeItemData,
  type TreeItemProps,
  type TreeItemState,
  type TreeOptions,
  type TreeState,
  type TreeMode,
} from "@ui-sdk/core/tree"
import * as React from "react"
import { hasChild } from "./children"
import {
  createParts,
  readIn,
  useHandle,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(treePrimitive, {
  label: "span",
  indicator: "span",
  checkbox: "span",
  group: "div",
})

// The item the items in a group belong to.
const ItemContext = React.createContext<string | null>(null)

// Element props that mean something else on a tree part.
type Clashing =
  "value" | "defaultValue" | "defaultChecked" | "onChange" | "onSelect"

/**
 * The props of `Tree`.
 * @stable
 */
type TreeProps<Mode extends TreeMode = "single"> = Omit<
  PartProps<"div", TreeState>,
  Clashing | keyof TreeOptions
> &
  TreeOptions<Mode> & {}

/**
 * A tree of items that expand and collapse, with one tab stop and arrow keys between its items.
 * @stable
 */
function Tree<Mode extends TreeMode = "single">({
  items,
  paths,
  mode,
  value,
  defaultValue,
  onValueChange,
  activation,
  expanded,
  defaultExpanded,
  onExpandedChange,
  expandOnPress,
  checkable,
  checked,
  defaultChecked,
  onCheckedChange,
  checkStrategy,
  onAction,
  pendingAnnouncement,
  loadChildren,
  current,
  onHighlight,
  disabled,
  focusableWhenDisabled,
  keepMounted,
  hiddenUntilFound,
  announcement,
  controller,
  debug,
  children,
  ...props
}: TreeProps<Mode>) {
  const tree = usePrimitive(treePrimitive, {
    items,
    paths,
    mode,
    value,
    defaultValue,
    onValueChange,
    activation,
    expanded,
    defaultExpanded,
    onExpandedChange,
    expandOnPress,
    checkable,
    checked,
    defaultChecked,
    onCheckedChange,
    checkStrategy,
    onAction,
    pendingAnnouncement,
    loadChildren,
    current,
    onHighlight,
    disabled,
    focusableWhenDisabled,
    keepMounted,
    hiddenUntilFound,
    announcement,
    controller,
    debug,
  } as TreeOptions)
  // Without children, a data tree renders its items.
  const data = readIn(tree, () => tree.api.internal.items())
  const content = children ?? (data && <TreeItems items={data} />)
  return (
    <ItemContext.Provider value={null}>
      {usePart(tree, "root", {}, { ...props, children: content })}
    </ItemContext.Provider>
  )
}

/**
 * An item. Put its text in a `TreeItemLabel` and its children in a
 * `TreeGroup`, which makes it a branch. Set `branch` for one whose children
 * load later, or whose group is inside a component of your own.
 * @stable
 */
function TreeItem({
  value,
  branch,
  disabled,
  label,
  children,
  ...props
}: Omit<PartProps<"div", TreeItemState>, Clashing> &
  Omit<TreeItemProps, "parent">) {
  const parent = React.useContext(ItemContext)
  const item = {
    value,
    parent,
    // A branch is one with a group among its children.
    branch:
      branch ??
      (typeof children === "function"
        ? undefined
        : hasChild(children, TreeGroup) || undefined),
    disabled,
    label,
  }
  return (
    <ItemContext.Provider value={value}>
      {usePart(treePrimitive, "item", item, { ...props, children })}
    </ItemContext.Provider>
  )
}

/**
 * The item's text, which names it. Render it as a link to make the item one.
 * @stable
 */
const TreeItemLabel = parts.Label

/**
 * The arrow that expands and collapses a branch. Alt or Option expands everything in it.
 * @stable
 */
const TreeItemIndicator = parts.Indicator

/**
 * The item's checkbox, with `checkable`. Screen readers hear the item's checked state instead.
 * @stable
 */
const TreeItemCheckbox = parts.Checkbox

/**
 * A branch's children. Rendered while the branch is expanded or animating closed.
 * @stable
 */
const TreeGroup = parts.Group

/**
 * Renders data items. Used by data trees, and available for custom layouts.
 * @stable
 */
function TreeItems({ items }: { items: TreeItemData[] }) {
  const tree = useHandle(treePrimitive)
  const checkable = tree.state.checkable
  return items.map((item) => (
    <TreeItem
      key={item.value}
      value={item.value}
      branch={item.children !== undefined}
      disabled={item.disabled}
    >
      {checkable && <TreeItemCheckbox />}
      <TreeItemLabel render={item.href ? <a href={item.href} /> : undefined}>
        {item.label}
      </TreeItemLabel>
      {item.children && (
        <TreeGroup>
          <TreeItems items={item.children} />
        </TreeGroup>
      )}
    </TreeItem>
  ))
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
