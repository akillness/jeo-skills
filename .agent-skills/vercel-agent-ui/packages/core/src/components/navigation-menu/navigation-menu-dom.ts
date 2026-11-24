// What a navigation menu measures: the open content's size for the viewport,
// and the active item's box for the indicator. Both measure without forcing
// layout: ResizeObserver reports sizes after layout, and the indicator reads
// offsets once something moved.
import { supportsHiddenUntilFound } from "../../foundation/disclosure/disclosure"
import { layoutBox, layoutSize } from "../../foundation/platform/layout"

// Writes the open content's size onto the viewport as `--viewport-width` and
// `--viewport-height`, which a size transition can animate. Contents are
// observed while they're in the viewport.
function createViewportSize(config: {
  viewport: () => HTMLElement | undefined
  // The content of the open item, if it's in the page.
  content: () => HTMLElement | undefined
}) {
  const sizes = new WeakMap<Element, { width: number; height: number }>()
  const resize =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            // Border box sizes are logical. Horizontal writing modes are the ones menus use.
            const box = entry.borderBoxSize?.[0]
            sizes.set(
              entry.target,
              box
                ? { width: box.inlineSize, height: box.blockSize }
                : {
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                  }
            )
          }
          write()
        })

  function write() {
    const viewport = config.viewport()
    const content = config.content()
    const size = content && sizes.get(content)
    if (!viewport || !size) {
      return
    }
    // Sizes for `width` and `height` as they apply: with `border-box`, which
    // most resets use, the viewport's border comes on top. Contents sit at
    // its padding box's corner, so padding belongs on them.
    const frame = frameOf(viewport)
    viewport.style.setProperty(
      "--viewport-width",
      `${size.width + frame.width}px`
    )
    viewport.style.setProperty(
      "--viewport-height",
      `${size.height + frame.height}px`
    )
  }

  return {
    write,
    // Starts watching a content in the viewport. Returns a cleanup.
    observe(el: HTMLElement) {
      resize?.observe(el)
      return () => {
        resize?.unobserve(el)
        sizes.delete(el)
      }
    },
    // Measures a content now, a forced layout, for a viewport about to show
    // that can't wait for the observer.
    measure(el: HTMLElement) {
      sizes.set(el, layoutSize(el))
      write()
    },
    disconnect: () => resize?.disconnect(),
  }
}

// The border a `border-box` element adds around its padding box. Reads
// styles only, never layout.
function frameOf(el: HTMLElement) {
  const style = getComputedStyle(el)
  if (style.boxSizing !== "border-box") {
    return { width: 0, height: 0 }
  }
  const sum = (...names: string[]) =>
    names.reduce(
      (total, name) => total + (parseFloat(style.getPropertyValue(name)) || 0),
      0
    )
  return {
    width: sum("border-left-width", "border-right-width"),
    height: sum("border-top-width", "border-bottom-width"),
  }
}

// Styles that take a closed content out of the layout without hiding it from
// find in page: `hidden="until-found"` keeps the element's own box.
const collapsed = {
  position: "absolute",
  width: "0",
  height: "0",
  padding: "0",
  "border-width": "0",
  overflow: "hidden",
  "pointer-events": "none",
}

// Collapses a closed content kept findable in place, so its width and padding
// take no room and no presses, and lets go once it's shown. Restores only
// what it set: a popup layer positioning it meanwhile keeps its own values.
function collapseWhileHidden(
  el: HTMLElement,
  shown: () => boolean,
  store: { subscribe: (listener: () => void) => () => void }
) {
  // Where find in page can't reveal hidden content, `hidden="until-found"`
  // hides through the browser's own styles, which any display class beats.
  // Nothing can find it there, so it's simply not displayed.
  const styles = supportsHiddenUntilFound()
    ? collapsed
    : { ...collapsed, display: "none" }
  // What each property was before, and what it read back as once set, since
  // the browser normalizes values, like "0" to "0px".
  const set = new Map<string, { before: string; after: string }>()
  const release = () => {
    for (const [name, { before, after }] of set) {
      if (el.style.getPropertyValue(name) !== after) {
        continue
      }
      if (before) {
        el.style.setProperty(name, before)
      } else {
        el.style.removeProperty(name)
      }
    }
    set.clear()
  }
  const update = () => {
    const hide = !shown()
    if (hide === set.size > 0) {
      return
    }
    if (!hide) {
      return release()
    }
    for (const [name, value] of Object.entries(styles)) {
      const before = el.style.getPropertyValue(name)
      el.style.setProperty(name, value)
      set.set(name, { before, after: el.style.getPropertyValue(name) })
    }
  }
  update()
  const unsubscribe = store.subscribe(update)
  return () => {
    unsubscribe()
    release()
  }
}

// Places the indicator over its target through `--active-item-*` variables,
// relative to the indicator's own positioned ancestor, and marks it
// `data-visible` while it has one. Built from layout offsets, like Tabs', so a
// transform animating on an ancestor never moves it. Returns a cleanup.
function bindIndicator(
  el: HTMLElement,
  config: {
    target: () => HTMLElement | undefined
    // Elements whose size changes can move the target, like the list and its
    // items. The first is the list: items it gains later are watched too.
    watched: () => (HTMLElement | undefined)[]
    // Where a link becoming the current page shows up, as `aria-current`.
    root: () => HTMLElement | undefined
    // Calls back when the open item changes. Returns an unsubscribe.
    onChange: (listener: () => void) => () => void
  }
) {
  const update = () => {
    const target = config.target()
    const container =
      (el.offsetParent as HTMLElement | null) ?? el.parentElement
    if (!target || !container) {
      el.removeAttribute("data-visible")
      return
    }
    const box = layoutBox(target, container)
    el.style.setProperty("--active-item-left", `${box.left}px`)
    el.style.setProperty("--active-item-right", `${box.right}px`)
    el.style.setProperty("--active-item-top", `${box.top}px`)
    el.style.setProperty("--active-item-bottom", `${box.bottom}px`)
    el.style.setProperty("--active-item-width", `${box.width}px`)
    el.style.setProperty("--active-item-height", `${box.height}px`)
    el.setAttribute("data-visible", "")
  }
  const sized =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(update)
  const current =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(update)
  const root = config.root()
  if (root) {
    current?.observe(root, { subtree: true, attributeFilter: ["aria-current"] })
  }
  const unsubscribe = config.onChange(update)
  // Observes what's watched now, like an item added after the first bind.
  let observed = new Set<HTMLElement>()
  const watch = () => {
    const next = new Set(
      config.watched().filter((target): target is HTMLElement => !!target)
    )
    for (const target of observed) {
      if (!next.has(target)) {
        sized?.unobserve(target)
      }
    }
    for (const target of next) {
      if (!observed.has(target)) {
        sized?.observe(target)
      }
    }
    observed = next
  }
  const items =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(watch)
  let bound = true
  // Items bind in the same commit. Measure once they have, unless the
  // indicator went first, like a React Strict Mode remount.
  queueMicrotask(() => {
    if (!bound) {
      return
    }
    watch()
    const list = config.watched()[0]
    if (list) {
      items?.observe(list, { childList: true, subtree: true })
    }
    update()
  })
  return () => {
    bound = false
    unsubscribe()
    sized?.disconnect()
    current?.disconnect()
    items?.disconnect()
  }
}

export { bindIndicator, collapseWhileHidden, createViewportSize }
