/**
 * A side of the anchor. `start` and `end` are logical: left and right, swapped in right-to-left layouts.
 * @stable
 */
type Side = "top" | "bottom" | "left" | "right" | "start" | "end"
/** A side on screen, after logical sides are resolved. */
type PhysicalSide = "top" | "bottom" | "left" | "right"

// `start` and `end` on screen.
function physicalSide(side: Side, rtl = false) {
  if (side === "start") {
    return rtl ? "right" : "left"
  }
  if (side === "end") {
    return rtl ? "left" : "right"
  }
  return side
}

const opposite: Record<PhysicalSide, PhysicalSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
}

export { opposite, physicalSide, type PhysicalSide, type Side }
