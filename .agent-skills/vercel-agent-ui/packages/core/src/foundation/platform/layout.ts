const isTransformed = (style: CSSStyleDeclaration) =>
  style.transform !== "none" ||
  style.translate !== "none" ||
  style.scale !== "none" ||
  style.rotate !== "none"

// Elements up to the offset parent can move the rects without touching the
// offsets, by a transform, or by scrolling when they aren't the offset parent.
function movesRects(node: HTMLElement, parent: HTMLElement) {
  for (let el: Element | null = node; el && el !== parent;) {
    const scrolled = el !== node && (el.scrollLeft || el.scrollTop)
    if (scrolled || isTransformed(getComputedStyle(el))) {
      return true
    }
    el = el.parentElement
  }
  return false
}

// offsetLeft rounds to whole pixels, so the fraction comes from the rects,
// scaled back to layout pixels. Offsets from the body skip its margin, and
// rects a pixel or more away from the offsets were moved, so the offsets stand.
function offsetIn(node: HTMLElement, parent: HTMLElement) {
  const offset = {
    x: node.offsetLeft + parent.clientLeft,
    y: node.offsetTop + parent.clientTop,
  }
  if (parent === node.ownerDocument.body || movesRects(node, parent)) {
    return offset
  }
  const rect = node.getBoundingClientRect()
  const parentRect = parent.getBoundingClientRect()
  const size = layoutSize(parent)
  const x =
    ((rect.left - parentRect.left) * size.width) / parentRect.width +
    parent.scrollLeft
  const y =
    ((rect.top - parentRect.top) * size.height) / parentRect.height +
    parent.scrollTop
  return {
    x: Math.abs(x - offset.x) < 1 ? x : offset.x,
    y: Math.abs(y - offset.y) < 1 ? y : offset.y,
  }
}

// An element's place in the page's layout: its border box's offset from the
// start of the offset parent chain. Offsets come from layout, so transforms and
// scrolling never move them.
function layoutOrigin(el: HTMLElement) {
  let x = 0
  let y = 0
  for (
    let node: HTMLElement | null = el;
    node;
    node = node.offsetParent as HTMLElement | null
  ) {
    const parent = node.offsetParent as HTMLElement | null
    if (!parent) {
      x += node.offsetLeft
      y += node.offsetTop
      continue
    }
    const offset = offsetIn(node, parent)
    x += offset.x
    y += offset.y
  }
  return { x, y }
}

// An element's border box size in layout pixels, keeping the fraction that
// offsetWidth rounds away. Inline elements have no computed size, so they fall
// back to the offsets.
function layoutSize(el: HTMLElement) {
  const style = getComputedStyle(el)
  const total = (...names: string[]) =>
    names.reduce(
      (sum, name) => sum + (parseFloat(style.getPropertyValue(name)) || 0),
      0
    )
  const contentBox = style.boxSizing !== "border-box"
  const width =
    parseFloat(style.width) +
    (contentBox
      ? total(
          "padding-left",
          "padding-right",
          "border-left-width",
          "border-right-width"
        )
      : 0)
  const height =
    parseFloat(style.height) +
    (contentBox
      ? total(
          "padding-top",
          "padding-bottom",
          "border-top-width",
          "border-bottom-width"
        )
      : 0)
  return {
    width: Number.isFinite(width) ? width : el.offsetWidth,
    height: Number.isFinite(height) ? height : el.offsetHeight,
  }
}

// An element's box inside a container's scrollable area: the offset from each
// edge of that area, and the size. What an indicator positioned inside the
// container needs to cover the element.
function layoutBox(el: HTMLElement, container: HTMLElement) {
  const at = layoutOrigin(el)
  const origin = layoutOrigin(container)
  const left = at.x - origin.x - container.clientLeft
  const top = at.y - origin.y - container.clientTop
  const { width, height } = layoutSize(el)
  const area = { width: container.scrollWidth, height: container.scrollHeight }
  return {
    left,
    top,
    width,
    height,
    right: area.width - (left + width),
    bottom: area.height - (top + height),
  }
}

export { layoutBox, layoutOrigin, layoutSize }
