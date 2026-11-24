// Where a sheet can rest. Snap points are written as the app thinks of them
// (a fraction of the screen, pixels, rem, a percentage, or the content's own
// size) and resolve to extents in px, which is all the machine knows.

/**
 * A place the sheet can rest, measured from the edge it comes from. A number
 * up to 1 is a fraction of the screen along the sheet's axis, and a larger one
 * is pixels. `"…px"`, `"…rem"` and `"…%"` (of the screen) work too.
 * `"content"` is the sheet's own size. None can be larger than the sheet.
 * @stable
 */
type SnapPoint =
  number | `${number}px` | `${number}rem` | `${number}%` | "content"

/** A snap point resolved to an extent. Points within 1px of each other share one entry. */
type ResolvedSnapPoint = {
  /** The id the machine and attributes use: the snap point as a string. */
  id: string
  /** The snap point as written, which callbacks report. */
  value: SnapPoint
  /** px from the attached edge. */
  extent: number
  /** Every snap point merged into this one, as ids. */
  ids: string[]
}

function snapPointId(point: SnapPoint) {
  return String(point)
}

// The extent of one snap point, or NaN when it can't be read.
function snapPointExtent(
  point: SnapPoint,
  context: { container: number; content: number; rootFontSize: number }
) {
  if (typeof point === "number") {
    return point <= 1 ? point * context.container : point
  }
  if (point === "content") {
    return context.content
  }
  const amount = parseFloat(point)
  if (point.endsWith("rem")) {
    return amount * context.rootFontSize
  }
  if (point.endsWith("%")) {
    return (amount / 100) * context.container
  }
  if (point.endsWith("px")) {
    return amount
  }
  return NaN
}

/**
 * Resolves snap points to ascending extents. `container` is the space along
 * the axis (the screen, less the keyboard) and `content` is the sheet's own
 * size, which caps every point. Points within 1px of each other merge, and
 * the one written later names the entry, so `"content"` equal to `1` on a
 * short screen doesn't leave a dead snap point.
 */
function resolveSnapPoints(
  points: readonly SnapPoint[],
  context: { container: number; content: number; rootFontSize: number }
) {
  const measured = points
    .map((value, index) => ({
      value,
      index,
      extent: Math.min(snapPointExtent(value, context), context.content),
    }))
    .filter((point) => point.extent > 0)
    .sort((a, b) => a.extent - b.extent || a.index - b.index)
  const resolved: (ResolvedSnapPoint & { index: number })[] = []
  for (const point of measured) {
    const id = snapPointId(point.value)
    const previous = resolved[resolved.length - 1]
    if (previous && point.extent - previous.extent < 1) {
      previous.ids.push(id)
      if (point.index > previous.index) {
        Object.assign(previous, { id, value: point.value, index: point.index })
      }
      previous.extent = Math.max(previous.extent, point.extent)
      continue
    }
    resolved.push({
      id,
      value: point.value,
      extent: Math.round(point.extent * 100) / 100,
      ids: [id],
      index: point.index,
    })
  }
  return resolved.map(({ index, ...point }) => point)
}

/** The index of the resolved entry a snap point merged into, or -1. */
function findSnapIndex(
  resolved: readonly ResolvedSnapPoint[],
  point: SnapPoint | string | null | undefined
) {
  if (point === null || point === undefined) {
    return -1
  }
  const id = String(point)
  return resolved.findIndex((entry) => entry.ids.includes(id))
}

/** Whether `point` is at or below `limit`, like a sheet resting where the page stays usable. */
function isAtOrBelow(
  resolved: readonly ResolvedSnapPoint[],
  point: SnapPoint | string | null | undefined,
  limit: SnapPoint | string | null | undefined
) {
  const below = findSnapIndex(resolved, limit)
  const index = findSnapIndex(resolved, point)
  return below >= 0 && index >= 0 && index <= below
}

export {
  findSnapIndex,
  isAtOrBelow,
  type ResolvedSnapPoint,
  resolveSnapPoints,
  type SnapPoint,
}
