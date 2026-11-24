import { layoutBox } from "../platform/layout"

/**
 * Keeps an indicator over a list's active item, like the selected tab, without
 * a render: measures the item against the list once they bind, whenever
 * `subscribe` calls back, and whenever the list or an item changes size, and
 * hands the box to `write`. Returns a cleanup.
 */
function bindIndicator(options: {
  list: () => HTMLElement | null | undefined
  active: () => HTMLElement | null | undefined
  itemSelector: string
  subscribe: (listener: () => void) => () => void
  write: (box: ReturnType<typeof layoutBox> | undefined) => void
}) {
  const update = () => {
    const list = options.list()
    const item = options.active()
    options.write(item && list ? layoutBox(item, list) : undefined)
  }
  const observer =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(update)
  // The watched set holds what it watches, so items that left leave it, or they stay alive.
  const observed = new Set<Element>()
  const remeasure = () => {
    const list = options.list()
    const targets = new Set(
      list ? [list, ...list.querySelectorAll(options.itemSelector)] : []
    )
    for (const target of observed) {
      if (!targets.has(target)) {
        observed.delete(target)
        observer?.unobserve(target)
      }
    }
    for (const target of targets) {
      if (observed.has(target)) {
        continue
      }
      observed.add(target)
      observer?.observe(target)
    }
    update()
  }
  const unsubscribe = options.subscribe(remeasure)
  // A new `dir` moves every item to the other side without resizing one.
  const flips =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(update)
  const list = options.list()
  if (list) {
    flips?.observe(list.ownerDocument.documentElement, {
      attributeFilter: ["dir"],
      subtree: true,
    })
  }
  // Items bind in the same commit. Measure once they have.
  queueMicrotask(remeasure)
  return () => {
    unsubscribe()
    observer?.disconnect()
    flips?.disconnect()
  }
}

// Which way `to` lies from `from` on screen.
function directionBetween(
  from: { left: number; top: number } | undefined,
  to: { left: number; top: number } | undefined,
  orientation: "horizontal" | "vertical"
) {
  if (!from || !to) {
    return "none"
  }
  const [a, b] =
    orientation === "vertical" ? [from.top, to.top] : [from.left, to.left]
  if (b === a) {
    return "none"
  }
  if (orientation === "vertical") {
    return b > a ? "down" : "up"
  }
  return b > a ? "right" : "left"
}

export { bindIndicator, directionBetween }
