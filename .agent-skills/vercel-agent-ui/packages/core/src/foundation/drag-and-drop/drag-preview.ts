// A copy of a dragged element that follows the pointer above everything else.
// The element itself stays in the page, where it would land, so frameworks
// can keep rendering it, and the copy is never clipped by a scrolling list
// or adds to its scroll area, as a translated element in an `overflow`
// container does.

// Styles the copy keeps from the element, as longhands, since a shorthand
// reads empty when its sides differ: inherited ones it would lose outside its
// ancestors, and the box a popover's own styles would replace.
const sides = ["top", "right", "bottom", "left"]
const kept = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-transform",
  "direction",
  "background-color",
  ...sides.flatMap((side) => [
    `padding-${side}`,
    `border-${side}-width`,
    `border-${side}-style`,
    `border-${side}-color`,
  ]),
  ...["top-left", "top-right", "bottom-right", "bottom-left"].map(
    (corner) => `border-${corner}-radius`
  ),
]

/**
 * Shows a copy of `el` over the page, in the top layer where the browser
 * has one, at `el`'s place, and moves it with the pointer from the point
 * the drag started at. The copy has `data-drag-preview`, is hidden from
 * screen readers and from pointer hit testing, and has no ids.
 *
 * ```ts
 * const preview = bindDragPreview(el, { x: event.clientX, y: event.clientY })
 * // onMove: preview.move(x, y)
 * // onEnd: preview.remove()
 * ```
 * @experimental
 */
function bindDragPreview(el: HTMLElement, from: { x: number; y: number }) {
  const doc = el.ownerDocument
  const rect = el.getBoundingClientRect()
  const computed = getComputedStyle(el)
  const copy = el.cloneNode(true) as HTMLElement
  for (const node of [copy, ...copy.querySelectorAll("[id]")]) {
    node.removeAttribute("id")
  }
  // A checked radio joining the page unchecks the rest of its named group, the element's own among
  // them, and named details that join an open one close. The copy leaves every group.
  const grouped = "input[type=radio][name], details[name]"
  for (const node of [copy, ...copy.querySelectorAll(grouped)]) {
    if (node.matches(grouped)) {
      node.removeAttribute("name")
    }
  }
  copy.setAttribute("aria-hidden", "true")
  copy.setAttribute("data-drag-preview", "")
  copy.removeAttribute("tabindex")
  copy.inert = true
  for (const name of kept) {
    copy.style.setProperty(name, computed.getPropertyValue(name))
  }
  Object.assign(copy.style, {
    position: "fixed",
    inset: "auto",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    boxSizing: "border-box",
    overflow: "visible",
    pointerEvents: "none",
    zIndex: "2147483647",
    translate: "none",
  })
  doc.body.append(copy)
  if ("showPopover" in copy) {
    copy.popover = "manual"
    try {
      copy.showPopover()
    } catch {
      // Not connected or not supported: the fixed position and z-index stand in.
    }
  }
  return {
    /** The copy, for styles a drag sets as it goes. */
    el: copy,
    /** Moves the copy as far as the pointer moved from where the drag started. */
    move(x: number, y: number) {
      copy.style.translate = `${x - from.x}px ${y - from.y}px`
    },
    /** Takes the copy out of the page. */
    remove() {
      copy.remove()
    },
  }
}

/**
 * What `bindDragPreview` returns.
 * @experimental
 */
type DragPreview = ReturnType<typeof bindDragPreview>

export { bindDragPreview, type DragPreview }
