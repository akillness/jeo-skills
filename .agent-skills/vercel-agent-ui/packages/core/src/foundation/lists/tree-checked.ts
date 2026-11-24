// Tri-state checkboxes over a tree: checking a branch checks everything in
// it, a branch shows mixed while only some of it is checked, and the checked
// value reports the nodes a strategy asks for. Pure, over a tree collection.
import type { TreeCollection } from "./tree-collection"

/**
 * Which nodes a tree's checked value lists, and whether checks cascade.
 * - `"leaf"`: the checked leaves. A branch is checked when all its leaves are.
 * - `"trunk"`: the outermost fully checked nodes, so a checked folder stands for everything in it.
 * - `"branch"`: every fully checked node, branches and leaves.
 * - `"independent"`: each node on its own, with no cascading and no mixed state.
 * @stable
 */
type TreeCheckStrategy = "leaf" | "trunk" | "branch" | "independent"

/**
 * A node's checkbox: checked, unchecked, or `"indeterminate"` while only some of a branch is checked.
 * @stable
 */
type TreeCheckedState = boolean | "indeterminate"

// A node with no known children counts as a leaf, so a branch whose children
// haven't loaded yet checks like one, and passes its check on once they load.
const isLeaf = (tree: TreeCollection, key: string) =>
  tree.children(key).length === 0

/**
 * The checked leaves a value stands for. A branch in the value stands for
 * every leaf under it, whatever the strategy, so a value written for another
 * strategy, or one checked before the branch's children loaded, still reads right.
 */
function checkedLeaves(tree: TreeCollection, value: readonly string[]) {
  const leaves = new Set<string>()
  for (const key of value) {
    if (!tree.has(key)) {
      continue
    }
    if (isLeaf(tree, key)) {
      leaves.add(key)
    } else {
      for (const below of tree.descendants(key)) {
        if (isLeaf(tree, below)) {
          leaves.add(below)
        }
      }
    }
  }
  return leaves
}

/**
 * Every node's checkbox for a checked value, from one pass over the tree, so
 * reading a node is a map lookup however big its branch is.
 * @stable
 */
function treeCheckedStates(
  tree: TreeCollection,
  value: readonly string[],
  strategy: TreeCheckStrategy = "leaf"
) {
  const states = new Map<string, TreeCheckedState>()
  if (strategy === "independent") {
    for (const key of value) {
      states.set(key, true)
    }
    return (key: string) => states.get(key) ?? false
  }
  const leaves = checkedLeaves(tree, value)
  // Post order: each branch counts its leaves and checked leaves from its children.
  // check-code: allow return-type recursive, so TypeScript cannot infer it.
  const count = (key: string): [number, number] => {
    if (isLeaf(tree, key)) {
      const checked = leaves.has(key)
      if (checked) {
        states.set(key, true)
      }
      return [1, checked ? 1 : 0]
    }
    let total = 0
    let checked = 0
    for (const child of tree.children(key)) {
      const [childTotal, childChecked] = count(child)
      total += childTotal
      checked += childChecked
    }
    if (checked) {
      states.set(key, checked === total ? true : "indeterminate")
    }
    return [total, checked]
  }
  for (const root of tree.children(null)) {
    count(root)
  }
  return (key: string) => states.get(key) ?? false
}

/** The value a strategy reports for a set of checked leaves, in tree order. */
function report(
  tree: TreeCollection,
  leaves: ReadonlySet<string>,
  strategy: TreeCheckStrategy
) {
  const state = treeCheckedStates(tree, [...leaves], "leaf")
  const keys = tree.keys()
  if (strategy === "leaf") {
    return keys.filter((key) => leaves.has(key))
  }
  if (strategy === "branch") {
    return keys.filter((key) => state(key) === true)
  }
  // Trunk: a fully checked node whose parent isn't fully checked.
  return keys.filter((key) => {
    if (state(key) !== true) {
      return false
    }
    const parent = tree.parent(key)
    return parent === null || state(parent) !== true
  })
}

/**
 * The checked value after a node's checkbox is pressed. A branch whose
 * checkable leaves are all checked unchecks them, and any other checks them;
 * nodes `checkable` refuses, like disabled ones, keep their state.
 * @stable
 */
function toggleTreeChecked(
  tree: TreeCollection,
  value: readonly string[],
  key: string,
  {
    strategy = "leaf",
    checkable = () => true,
  }: { strategy?: TreeCheckStrategy; checkable?: (key: string) => boolean } = {}
) {
  if (!checkable(key)) {
    return [...value]
  }
  if (strategy === "independent") {
    return value.includes(key)
      ? value.filter((checked) => checked !== key)
      : [...value, key]
  }
  const leaves = checkedLeaves(tree, value)
  const below = isLeaf(tree, key)
    ? [key]
    : tree.descendants(key).filter((node) => isLeaf(tree, node))
  const depth = tree.ancestors(key).length + 1
  // A refused node keeps its state and shields what's under it.
  const affected = below.filter(
    (leaf) =>
      checkable(leaf) &&
      tree
        .ancestors(leaf)
        .slice(depth)
        .every((node) => checkable(node))
  )
  // Checks unless every leaf it can change is checked, so a branch with a refused leaf still unchecks.
  const check = !affected.every((leaf) => leaves.has(leaf))
  for (const leaf of affected) {
    if (check) {
      leaves.add(leaf)
    } else {
      leaves.delete(leaf)
    }
  }
  return report(tree, leaves, strategy)
}

export {
  toggleTreeChecked,
  type TreeCheckedState,
  treeCheckedStates,
  type TreeCheckStrategy,
}
