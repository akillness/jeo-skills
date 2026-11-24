// One keyboard map for numeric controls, as the APG's slider and spinbutton
// patterns describe it, read into a move that `stepBy` applies.
import { isComposing } from "../kernel/events"
import type { NumberMove } from "./steps"

/**
 * How a control lays out and which arrows it takes.
 * @experimental
 */
type NumberKeyOptions = {
  /** Which way the control runs. Right to left flips Left and Right only on a horizontal one. @defaultValue "horizontal" */
  orientation?: "horizontal" | "vertical"
  /** The control's direction, like `getComputedStyle(el).direction`. @defaultValue "ltr" */
  dir?: "ltr" | "rtl"
  /**
   * Which arrows step. `"vertical"` leaves Left and Right to a text caret, as
   * a number field does, and `"horizontal"` leaves Up and Down to the page. @defaultValue "all"
   */
  arrows?: "all" | "horizontal" | "vertical"
}

/**
 * The move a key asks of a numeric control, or null for keys it leaves alone.
 * Up and Right step up, Down and Left step down, Shift takes the large step
 * and Alt the small one; Page Up and Down take the large step; Home and End go
 * to the bounds. Ctrl and Cmd are the caller's to check. A key an input
 * method is composing with, like an arrow choosing a candidate, is null too.
 * @experimental
 */
function stepFromKey(
  event: { key: string; shiftKey?: boolean; altKey?: boolean } & Parameters<
    typeof isComposing
  >[0],
  {
    orientation = "horizontal",
    dir = "ltr",
    arrows = "all",
  }: NumberKeyOptions = {}
) {
  if (isComposing(event)) {
    return null
  }
  if (event.key === "Home") {
    return { bound: "min" } satisfies NumberMove
  }
  if (event.key === "End") {
    return { bound: "max" } satisfies NumberMove
  }
  if (event.key === "PageUp" || event.key === "PageDown") {
    return {
      direction: event.key === "PageUp" ? 1 : -1,
      size: "large",
    } satisfies NumberMove
  }
  const flip = dir === "rtl" && orientation === "horizontal" ? -1 : 1
  const vertical =
    arrows === "horizontal"
      ? 0
      : event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowDown"
          ? -1
          : 0
  const horizontal =
    arrows === "vertical"
      ? 0
      : event.key === "ArrowRight"
        ? flip
        : event.key === "ArrowLeft"
          ? -flip
          : 0
  const direction = vertical || horizontal
  if (!direction) {
    return null
  }
  return {
    direction: direction as 1 | -1,
    size: event.shiftKey ? "large" : event.altKey ? "small" : "step",
  } satisfies NumberMove
}

export { type NumberKeyOptions, stepFromKey }
