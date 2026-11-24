// Document order. Parts register in any order: Vue registers them before it
// inserts them, and custom elements upgrade in any order. So lists sort when
// they're used, with these, and keep the result until it changes.

const following = 4

/** Whether `later` comes after `node` in the document. */
const isAfter = (node: Node, later: Node) =>
  !!(node.compareDocumentPosition(later) & following)

/** Compares two nodes for a sort into document order. */
const documentOrder = (a: Node, b: Node) => (isAfter(a, b) ? -1 : 1)

const walkFrom = 16
const walkPerEntry = 32

// Entries in document order. The browser compares two siblings by walking
// the siblings before one of them, so sorting a long list by comparing costs
// far more than its length. A long list is ordered by one walk of the subtree
// holding it instead, which stops at the last entry. Entries the walk can't reach, like
// ones in separate shadow roots, are compared.
function inDocumentOrder<Entry extends { el: HTMLElement }>(entries: Entry[]) {
  let container = entries.length < walkFrom ? null : entries[0].el.parentNode
  while (container && !entries.every(({ el }) => container!.contains(el))) {
    container = container.parentNode
  }
  if (container) {
    const byElement = new Map<Node, Entry>(
      entries.map((entry) => [entry.el, entry])
    )
    const sorted: Entry[] = []
    const walker = entries[0].el.ownerDocument.createTreeWalker(container, 1)
    let budget = entries.length * walkPerEntry
    for (
      let node: Node | null = container;
      node && budget--;
      node = walker.nextNode()
    ) {
      const entry = byElement.get(node)
      if (entry && sorted.push(entry) === entries.length) {
        return sorted
      }
    }
  }
  return entries.sort((a, b) => documentOrder(a.el, b.el))
}

/**
 * Keyed items in document order: sorted once, and kept after that. Items that
 * join take their places in the kept list by binary search, and items that
 * leave drop out, so a branch expanding in a long tree costs its own items,
 * not the whole list. Only a move sorts again. Menus, roving groups, toggle
 * groups and listboxes share it, so a key press reads a cached list instead
 * of sorting every item. `elements()` sorts on every call instead, so
 * components without a collection don't ship this.
 */
function createOrder<Entry extends { key: string; el: HTMLElement }>() {
  const entries = new Map<string, Entry>()
  let order: readonly Entry[] | undefined
  // Entries added since `order` was kept, and whether any left.
  let joined: Entry[] = []
  let left = false
  let moves: MutationObserver | undefined
  const watched = new Set<Node>()
  const current = (entry: Entry) => entries.get(entry.key) === entry

  // Watches the parents of `added` up to where they meet the list, so a move
  // among them sorts again.
  function watch(added: readonly Entry[], list: readonly Entry[]) {
    moves ??= new MutationObserver(() => (order = undefined))
    const last = list[list.length - 1]?.el
    for (const { el } of added) {
      for (
        let node = el.parentNode;
        node && !watched.has(node);
        node = node.parentNode
      ) {
        watched.add(node)
        moves.observe(node, { childList: true })
        if (node.contains(last)) {
          break
        }
      }
    }
  }

  function sorted() {
    const all = [...entries.values()]
    const list = inDocumentOrder(all.filter((entry) => entry.el.isConnected))
    // Vue adds items before it inserts them, so only a complete list is kept.
    if (list.length < all.length) {
      return list
    }
    if (typeof MutationObserver !== "undefined") {
      moves?.disconnect()
      watched.clear()
      watch(list, list)
    }
    return (order = list)
  }

  // `kept` with the entries that joined since in their places, and without
  // those that left. Undefined when a sort is cheaper, or an entry that
  // joined isn't in the page yet.
  function updated(kept: readonly Entry[]) {
    const added = joined.filter(current)
    if (added.some((entry) => !entry.el.isConnected)) {
      return
    }
    const list = kept.filter(current)
    if (added.length * Math.log2(list.length + 2) > list.length) {
      return
    }
    for (const entry of added) {
      let low = 0
      let high = list.length
      while (low < high) {
        const middle = (low + high) >> 1
        if (isAfter(list[middle].el, entry.el)) {
          low = middle + 1
        } else {
          high = middle
        }
      }
      list.splice(low, 0, entry)
    }
    if (moves) {
      watch(added, list)
    }
    return list
  }

  return {
    /** The entries in the page, in document order. Shared until one is added, removed or moved. */
    list() {
      // Moves this observer hasn't heard about yet count too, like one that
      // another observer handles first.
      if (moves?.takeRecords().length) {
        order = undefined
      }
      if (order && (joined.length || left)) {
        order = updated(order)
      }
      joined = []
      left = false
      return order ?? sorted()
    },
    /** Adds an entry, or replaces the one with its key. Returns its removal. */
    add(entry: Entry) {
      if (order && entries.has(entry.key)) {
        left = true
      }
      entries.set(entry.key, entry)
      if (order) {
        joined.push(entry)
      }
      return () => {
        if (!current(entry)) {
          return
        }
        entries.delete(entry.key)
        left = true
        if (!entries.size) {
          moves?.disconnect()
          watched.clear()
          order = undefined
        }
      }
    },
    get: (key: string) => entries.get(key),
    size: () => entries.size,
  }
}

export { createOrder, documentOrder, inDocumentOrder, isAfter }
