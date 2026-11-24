// Lets the pointer cross other triggers or items on its way to an open popup
// without switching to them. Moves inside the triangle from where it left the
// trigger to the popup's near edge are ignored until the pointer rests.

type Point = { x: number; y: number }

function createSafeArea({ restTimeout = 300 } = {}) {
  let apex: Point | undefined
  let popup: HTMLElement | undefined
  let axis: "x" | "y" = "x"
  let last: Point | undefined
  let restTimer: ReturnType<typeof setTimeout> | undefined
  let expired = false

  return {
    // Call when the pointer leaves the trigger. `along` is the axis the popup
    // sits on from its trigger: "x" beside it, "y" above or below.
    start(point: Point, target: HTMLElement, along: "x" | "y" = "x") {
      apex = point
      last = point
      popup = target
      axis = along
      expired = false
    },
    stop() {
      apex = popup = last = undefined
      clearTimeout(restTimer)
    },
    active: () => !!apex && !expired,
    // True when the move should be ignored.
    // `onRest` runs if the pointer stops inside the area.
    contains(point: Point, onRest: () => void) {
      if (!apex || !popup || expired) {
        return false
      }
      const rect = popup.getBoundingClientRect()
      const near =
        axis === "x"
          ? rect.left >= apex.x
            ? rect.left
            : rect.right
          : rect.top >= apex.y
            ? rect.top
            : rect.bottom
      const inside =
        axis === "x"
          ? inTriangle(
              point,
              apex,
              { x: near, y: rect.top - 8 },
              { x: near, y: rect.bottom + 8 }
            )
          : inTriangle(
              point,
              apex,
              { x: rect.left - 8, y: near },
              { x: rect.right + 8, y: near }
            )
      const progressing =
        !last || Math.abs(near - point[axis]) <= Math.abs(near - last[axis]) + 1
      last = point
      clearTimeout(restTimer)
      if (!inside || !progressing) {
        return false
      }
      restTimer = setTimeout(() => {
        expired = true
        onRest()
      }, restTimeout)
      return true
    },
  }
}

function inTriangle(p: Point, a: Point, b: Point, c: Point) {
  const sign = (p1: Point, p2: Point, p3: Point) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
  const d1 = sign(p, a, b)
  const d2 = sign(p, b, c)
  const d3 = sign(p, c, a)
  const negative = d1 < 0 || d2 < 0 || d3 < 0
  const positive = d1 > 0 || d2 > 0 || d3 > 0
  return !(negative && positive)
}

export { createSafeArea }
