// Spatial focus: arrow keys go to the nearest item on screen in their
// direction, not the next one in the document. For layouts that aren't a line
// or a regular grid, like a board of cards placed anywhere, a ring of
// actions, a dashboard or a grid whose rows wrap at different widths.
import type { RovingFocusMoveContext } from "./roving-focus"

/**
 * A box on screen, like `getBoundingClientRect()` returns.
 * @experimental
 */
type SpatialRect = { left: number; top: number; right: number; bottom: number }

const arrows: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

/**
 * The key of the box nearest `from` in a direction, `[1, 0]` for right, or
 * `undefined` when none lies that way. Boxes inside a 45° cone come first, and
 * distance to the side counts double, so a box straight ahead beats a closer
 * one off to the side. Pure, so a test or a server can run it.
 * @experimental
 */
function nearestInDirection(
  from: SpatialRect,
  candidates: readonly { key: string; rect: SpatialRect }[],
  direction: readonly [number, number]
) {
  const [dx, dy] = direction
  const cx = (from.left + from.right) / 2
  const cy = (from.top + from.bottom) / 2
  let best: { key: string; score: number; cone: boolean } | undefined
  for (const { key, rect } of candidates) {
    const x = (rect.left + rect.right) / 2 - cx
    const y = (rect.top + rect.bottom) / 2 - cy
    const ahead = x * dx + y * dy
    if (ahead <= 0) {
      continue
    }
    const aside = Math.abs(dx ? y : x)
    const cone = aside <= ahead
    const score = ahead + aside * 2
    if (
      !best ||
      (cone && !best.cone) ||
      (cone === best.cone && score < best.score)
    ) {
      best = { key, score, cone }
    }
  }
  return best?.key
}

/**
 * A `move` for `createRovingFocus` that sends each arrow to the nearest item on
 * screen in its direction. Home and End go to the first and last item in
 * the document. Directions are physical: Left is left in either reading
 * direction, since the items sit where they're drawn. Arrows with Alt, Ctrl
 * or ⌘ are left alone, for a component's own shortcuts, like nudging.
 *
 * ```ts
 * createRovingFocus(context, { slot: "card", key: "focused", move: spatialMove() })
 * ```
 * @experimental
 */
function spatialMove(
  options: {
    /** Where an item is on screen. Defaults to its element's `getBoundingClientRect()`. */
    rect?: (el: HTMLElement, key: string) => SpatialRect
  } = {}
) {
  const rectOf =
    options.rect ?? ((el: HTMLElement) => el.getBoundingClientRect())
  return (event: KeyboardEvent, { from, items }: RovingFocusMoveContext) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return undefined
    }
    if (event.key === "Home") {
      return items[0]?.key
    }
    if (event.key === "End") {
      return items[items.length - 1]?.key
    }
    const direction = arrows[event.key]
    if (!direction) {
      return undefined
    }
    const candidates = items
      .filter((item) => item.key !== from.key)
      .map((item) => ({ key: item.key, rect: rectOf(item.el, item.key) }))
    return nearestInDirection(rectOf(from.el, from.key), candidates, direction)
  }
}

export { nearestInDirection, spatialMove, type SpatialRect }
