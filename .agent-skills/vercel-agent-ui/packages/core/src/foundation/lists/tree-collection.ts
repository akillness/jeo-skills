// A tree's shape as plain data: who each node's parent and children are, its
// level, its place among its siblings, and which nodes show for a set of
// expanded branches. Trees, nested menus and outlines read their structure
// from it, so no adapter rebuilds parent tracking. Pure, so it runs on the
// server and in tests without a DOM.
import { sameValue } from "../kernel/store"

/**
 * One node of a tree, as `createTreeCollection` reads it.
 * @stable
 */
type TreeCollectionNode = {
  /** The node's key, unique in the tree. */
  key: string
  /** The key of the node it's nested in, or `null` at the top level. */
  parent: string | null
  /** Whether it has children, or can load them, even while none are known yet. */
  branch?: boolean
}

type Entry = {
  parent: string | null
  children: string[]
  branch: boolean
  index: number
}

/**
 * A tree's structure from its nodes, listed parents before children and
 * siblings in order. A node whose parent isn't listed sits at the top level.
 * Every lookup is a map read or a walk up the node's ancestors; `visible`
 * keeps its last answer while the expanded keys stay the same.
 *
 * ```ts
 * const tree = createTreeCollection([
 *   { key: "src", parent: null },
 *   { key: "src/index.ts", parent: "src" },
 *   { key: "README.md", parent: null },
 * ])
 * tree.level("src/index.ts") // 2
 * tree.position("README.md") // { index: 2, size: 2 }
 * tree.visible([]) // ["src", "README.md"]
 * ```
 * @stable
 */
function createTreeCollection(nodes: Iterable<TreeCollectionNode>) {
  const entries = new Map<string, Entry>()
  const roots: string[] = []
  for (const node of nodes) {
    if (entries.has(node.key)) {
      continue
    }
    entries.set(node.key, {
      parent: node.parent,
      children: [],
      branch: !!node.branch,
      index: 0,
    })
  }
  for (const [key, entry] of entries) {
    const parent = entry.parent === null ? undefined : entries.get(entry.parent)
    if (!parent) {
      entry.parent = null
    }
    const siblings = parent ? parent.children : roots
    entry.index = siblings.push(key)
  }

  const none: readonly string[] = []
  const children = (key: string | null) =>
    key === null ? roots : (entries.get(key)?.children ?? none)
  const parent = (key: string) => entries.get(key)?.parent ?? null

  function ancestors(key: string) {
    const found: string[] = []
    for (let up = parent(key); up !== null; up = parent(up)) {
      found.unshift(up)
    }
    return found
  }

  // Every node under `key` in order, or every node for `null`, walking only
  // into the branches `enter` allows.
  function walk(
    key: string | null,
    enter: (key: string) => boolean,
    into: string[]
  ) {
    for (const child of children(key)) {
      into.push(child)
      if (enter(child)) {
        walk(child, enter, into)
      }
    }
    return into
  }

  let lastExpanded: readonly string[] | undefined
  let lastVisible: readonly string[] = none

  return {
    /** How many nodes the tree has. */
    size: entries.size,
    /** Whether the tree has a node with this key. */
    has: (key: string) => entries.has(key),
    /** The key of the node `key` is nested in, or `null` at the top level. */
    parent,
    /** The keys of a node's children in order, or of the top-level nodes for `null`. */
    children: children as (key: string | null) => readonly string[],
    /** Whether a node has children, or was listed as a branch. */
    isBranch: (key: string) => {
      const entry = entries.get(key)
      return !!entry && (entry.branch || entry.children.length > 0)
    },
    /** A node's depth: 1 at the top level, as `aria-level` counts. */
    level: (key: string) => ancestors(key).length + 1,
    /** A node's place among its siblings, both counted from 1, as `aria-posinset` and `aria-setsize` count. */
    position(key: string) {
      const entry = entries.get(key)
      if (!entry) {
        return { index: 0, size: 0 }
      }
      return { index: entry.index, size: children(entry.parent).length }
    },
    /** The keys of a node's ancestors, outermost first. */
    ancestors,
    /** The keys of every node under `key`, in order. */
    descendants: (key: string) => walk(key, () => true, []),
    /** Every key in order, parents before their children. */
    keys: () => walk(null, () => true, []),
    /**
     * The keys that show when only the branches in `expanded` are open: the
     * top-level nodes, and the children of every expanded branch whose
     * ancestors are expanded too, in order. Kept while `expanded` holds the
     * same keys, even when it's the same array changed in place.
     */
    visible(expanded: readonly string[]) {
      if (lastExpanded && sameValue(lastExpanded, expanded)) {
        return lastVisible
      }
      const open = new Set(expanded)
      lastExpanded = [...expanded]
      return (lastVisible = walk(null, (key) => open.has(key), []))
    },
  }
}

/**
 * What `createTreeCollection` returns.
 * @stable
 */
type TreeCollection = ReturnType<typeof createTreeCollection>

/**
 * A node of tree data: a value, the text it shows, and its children.
 * @stable
 */
type TreeItemData = {
  /** Identifies the item. Unique in the tree. */
  value: string
  /** What it shows, and what typeahead matches. */
  label: string
  /** Its children. Leave it out for a leaf. An empty array is a branch with no children, or one whose children load when it opens. */
  children?: TreeItemData[]
  /** Whether it can't be selected, checked or activated. It can still take focus. */
  disabled?: boolean
  /** Makes the item a link to this address. */
  href?: string
}

/**
 * Lists tree data as collection nodes, parents before children.
 * @stable
 */
function treeDataNodes(items: readonly TreeItemData[]) {
  const nodes: (TreeCollectionNode & { item: TreeItemData })[] = []
  const add = (list: readonly TreeItemData[], parent: string | null) => {
    for (const item of list) {
      nodes.push({
        key: item.value,
        parent,
        branch: item.children !== undefined,
        item,
      })
      if (item.children) {
        add(item.children, item.value)
      }
    }
  }
  add(items, null)
  return nodes
}

/**
 * Tree data from a list of file paths, like `["src/index.ts", "README.md"]`.
 * Each folder becomes a branch whose value is its path, and each file a leaf.
 * A path ending in `/` is an empty folder. Folders come first, then files,
 * each in the order the list gives.
 * @stable
 */
function treeFromPaths(paths: readonly string[]) {
  const top: TreeItemData[] = []
  const folders = new Map<string, TreeItemData[]>()
  const folder = (path: string, label: string, into: TreeItemData[]) => {
    let children = folders.get(path)
    if (!children) {
      folders.set(path, (children = []))
      into.push({ value: path, label, children })
    }
    return children
  }
  for (const path of paths) {
    const segments = path.split("/")
    const isFolder = segments.at(-1) === ""
    if (isFolder) {
      segments.pop()
    }
    let into = top
    let prefix = ""
    segments.forEach((segment, index) => {
      prefix = prefix ? `${prefix}/${segment}` : segment
      if (index < segments.length - 1 || isFolder) {
        into = folder(prefix, segment, into)
      } else if (!into.some((item) => item.value === prefix)) {
        into.push({ value: prefix, label: segment })
      }
    })
  }
  // check-code: allow return-type recursive, so TypeScript cannot infer it.
  const foldersFirst = (items: TreeItemData[]): TreeItemData[] =>
    [
      ...items.filter((item) => item.children),
      ...items.filter((item) => !item.children),
    ].map((item) =>
      item.children ? { ...item, children: foldersFirst(item.children) } : item
    )
  return foldersFirst(top)
}

/**
 * One row of tree data that shows, with what a flat rendering needs to place it.
 * @stable
 */
type TreeRow = {
  /** The object from your data this row shows, the same one you passed in, children included. */
  item: TreeItemData
  /** The value of the item it's nested in, or `null` at the top level. */
  parent: string | null
  /** Its depth, 1 at the top level. */
  level: number
  /** Its place among the rows that show, from 0, for a virtualized list. */
  index: number
}

/**
 * The rows of tree data that show when the branches in `expanded` are open,
 * in order, for a flat rendering such as a virtualized list. Render each as
 * a `TreeItem` with its `value`: the tree reads its level, place and children from the data.
 * @stable
 */
function visibleTreeRows(
  items: readonly TreeItemData[],
  expanded: readonly string[]
) {
  const open = new Set(expanded)
  const rows: TreeRow[] = []
  const add = (
    list: readonly TreeItemData[],
    parent: string | null,
    level: number
  ) => {
    for (const item of list) {
      rows.push({ item, parent, level, index: rows.length })
      if (item.children && open.has(item.value)) {
        add(item.children, item.value, level + 1)
      }
    }
  }
  add(items, null, 1)
  return rows
}

export {
  createTreeCollection,
  type TreeCollection,
  type TreeCollectionNode,
  treeDataNodes,
  treeFromPaths,
  type TreeItemData,
  type TreeRow,
  visibleTreeRows,
}
