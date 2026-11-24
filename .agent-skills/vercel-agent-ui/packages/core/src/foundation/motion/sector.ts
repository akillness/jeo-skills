// Which way a stroke points, as one of a few equal wedges around a center:
// the choice in a radial or marking menu, a flick to pick a reaction, a
// swipe that means "archive" one way and "snooze" another.

/**
 * The wedge a stroke points into, from 0 to `count - 1`, clockwise from the
 * top (or from `start` turns), or `-1` while it's within `deadZone` pixels of
 * the center. Each wedge is centered on its direction: with four, 0 is up, 1
 * right, 2 down, 3 left. Pure.
 *
 * ```ts
 * sectorOf(30, -2, 4) // 1, right
 * sectorOf(3, 4, 8) // -1, too short to point anywhere
 * ```
 * @experimental
 */
function sectorOf(
  dx: number,
  dy: number,
  count: number,
  options: { deadZone?: number; start?: number } = {}
) {
  if (count < 1 || Math.hypot(dx, dy) < (options.deadZone ?? 18)) {
    return -1
  }
  const turn =
    (Math.atan2(dx, -dy) / (2 * Math.PI) - (options.start ?? 0) + 2) % 1
  return Math.round(turn * count) % count
}

export { sectorOf }
