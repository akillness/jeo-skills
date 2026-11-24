// Whether a press landed on an element's scrollbar rather than its content.
// Coordinates are relative to the element's border box.
function onScrollbar(
  point: { x: number; y: number },
  box: {
    width: number
    height: number
    clientLeft: number
    clientTop: number
    clientWidth: number
    clientHeight: number
    borders: { top: number; right: number; bottom: number; left: number }
  }
) {
  const { x, y } = point
  const { borders } = box
  const inBorders =
    x >= borders.left &&
    x < box.width - borders.right &&
    y >= borders.top &&
    y < box.height - borders.bottom
  // The padding box. In right-to-left layouts, clientLeft includes a scrollbar on the left.
  const inPadding =
    x >= box.clientLeft &&
    x < box.clientLeft + box.clientWidth &&
    y >= box.clientTop &&
    y < box.clientTop + box.clientHeight
  return inBorders && !inPadding
}

function pressedScrollbar(event: PointerEvent, target: Node) {
  if (!(target instanceof Element)) {
    return false
  }
  const doc = target.ownerDocument
  // The page's own scrollbar sits outside the root element's client area.
  if (target === doc.documentElement) {
    return (
      event.clientX >= target.clientWidth ||
      event.clientY >= target.clientHeight
    )
  }
  if (target.clientWidth === 0 && target.clientHeight === 0) {
    return false
  }
  const rect = target.getBoundingClientRect()
  const style = getComputedStyle(target)
  return onScrollbar(
    { x: event.clientX - rect.left, y: event.clientY - rect.top },
    {
      width: rect.width,
      height: rect.height,
      clientLeft: target.clientLeft,
      clientTop: target.clientTop,
      clientWidth: target.clientWidth,
      clientHeight: target.clientHeight,
      borders: {
        top: parseFloat(style.borderTopWidth) || 0,
        right: parseFloat(style.borderRightWidth) || 0,
        bottom: parseFloat(style.borderBottomWidth) || 0,
        left: parseFloat(style.borderLeftWidth) || 0,
      },
    }
  )
}

export { onScrollbar, pressedScrollbar }
