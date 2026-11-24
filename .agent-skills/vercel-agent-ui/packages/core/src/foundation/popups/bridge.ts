type Point = { x: number; y: number }
type Box = { left: number; right: number; top: number; bottom: number }

// The area a pointer may cross between a trigger and its popup: on either,
// or anywhere between them, as the convex hull of both boxes grown by
// `padding`. The pointer can then leave the trigger by any edge, even
// sideways, on its way to the popup. Returns a test for points, built once,
// so a pointer move only does the arithmetic and allocates nothing.
function bridgeBetween(trigger: Box, popup: Box, padding = 4) {
  const corners = [trigger, popup].flatMap((box) => [
    { x: box.left - padding, y: box.top - padding },
    { x: box.right + padding, y: box.top - padding },
    { x: box.right + padding, y: box.bottom + padding },
    { x: box.left - padding, y: box.bottom + padding },
  ])
  const hull = convexHull(corners)
  return (x: number, y: number) => {
    for (let index = 0; index < hull.length; index++) {
      const from = hull[index]
      const to = hull[(index + 1) % hull.length]
      if ((to.x - from.x) * (y - from.y) - (to.y - from.y) * (x - from.x) < 0) {
        return false
      }
    }
    return true
  }
}

function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function convexHull(points: Point[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const half = (list: Point[]) => {
    const chain: Point[] = []
    for (const point of list) {
      while (
        chain.length >= 2 &&
        cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0
      ) {
        chain.pop()
      }
      chain.push(point)
    }
    chain.pop()
    return chain
  }
  return [...half(sorted), ...half(sorted.reverse())]
}

export { bridgeBetween }
