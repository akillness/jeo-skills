const registry = () =>
  ((globalThis as Record<symbol, unknown>)[
    Symbol.for("ui-sdk.popup-elements@1")
  ] ??= new WeakMap<Node, number>()) as WeakMap<Node, number>

/** Marks a popup's content element. Returns a function that undoes it. */
function registerPopupElement(el: Element) {
  const elements = registry()
  elements.set(el, (elements.get(el) ?? 0) + 1)
  let done = false
  return () => {
    if (done) {
      return
    }
    done = true
    const count = (elements.get(el) ?? 1) - 1
    if (count > 0) {
      elements.set(el, count)
    } else {
      elements.delete(el)
    }
  }
}

// Whether a node is inside a popup's content element, open or closed. Crosses shadow roots.
function inPopupElement(target: Node) {
  const elements = registry()
  for (
    let node: Node | null = target;
    node;
    node = node.parentNode ?? (node as ShadowRoot).host ?? null
  ) {
    if (elements.has(node)) {
      return true
    }
  }
  return false
}

// Whether an event is the element's own, not one bubbling up from a part like
// it nested inside, like a submenu's keys through its parent menu. `same`
// names the parts that count as nested ones, by default those of its slot.
function ownsEvent(
  el: Element,
  event: Event,
  same = `[data-slot="${el.getAttribute("data-slot")}"]`
) {
  return (event.target as Element).closest(same) === el
}

export { inPopupElement, ownsEvent, registerPopupElement }
