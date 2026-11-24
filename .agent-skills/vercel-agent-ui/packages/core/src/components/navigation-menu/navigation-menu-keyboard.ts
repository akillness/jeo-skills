// The optional arrow keys of the APG disclosure navigation pattern, as pure
// decisions. They add to Tab and never replace it, and nothing wraps.
// https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/

/**
 * How content entered or left, in item order: `start` is the side of the first item.
 * @stable
 */
type NavigationMenuMotion = "from-start" | "from-end" | "to-start" | "to-end"

type Orientation = "horizontal" | "vertical"

// What a key does on a top-level trigger or link: move along the list, or
// open the trigger's panel and move into it. Undefined for other keys.
function listKey(key: string, orientation: Orientation, rtl: boolean) {
  const inlineEnd = rtl ? "ArrowLeft" : "ArrowRight"
  const inlineStart = rtl ? "ArrowRight" : "ArrowLeft"
  const [next, previous, enter] =
    orientation === "vertical"
      ? ["ArrowDown", "ArrowUp", inlineEnd]
      : [inlineEnd, inlineStart, "ArrowDown"]
  if (key === next) {
    return 1
  }
  if (key === previous) {
    return -1
  }
  if (key === "Home") {
    return "first" as const
  }
  if (key === "End") {
    return "last" as const
  }
  if (key === enter) {
    return "enter" as const
  }
}

// What a key does on a link inside an open panel: Down and the inline end go
// to the next one, Up and the inline start to the previous one.
function panelKey(key: string, rtl: boolean) {
  if (key === "ArrowDown" || key === (rtl ? "ArrowLeft" : "ArrowRight")) {
    return 1
  }
  if (key === "ArrowUp" || key === (rtl ? "ArrowRight" : "ArrowLeft")) {
    return -1
  }
  if (key === "Home") {
    return "first" as const
  }
  if (key === "End") {
    return "last" as const
  }
}

// Keys pressed with a modifier belong to the browser or the system, like
// Alt+Left for Back, so the menu leaves them alone.
function isModified(event: {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}) {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
}

// The index a step lands on, stopping at the ends.
function stepIndex(
  index: number,
  step: number | "first" | "last",
  count: number
) {
  if (step === "first") {
    return 0
  }
  if (step === "last") {
    return count - 1
  }
  return Math.max(0, Math.min(count - 1, index + step))
}

// Which way content moves when the open item changes, from the items' order.
// Order is logical, so `end` is on the left in right-to-left layouts.
function motionOf(
  key: string,
  state: {
    value: string | null
    previous: string | null
    forward: boolean | null
  }
) {
  if (state.forward === null) {
    return
  }
  if (key === state.value) {
    return state.forward ? "from-end" : "from-start"
  }
  if (key === state.previous) {
    return state.forward ? "to-start" : "to-end"
  }
}

// Whether a link press should leave the page alone: a modifier or the middle
// button opens it somewhere else, so the menu stays as it was.
function opensElsewhere(event: Event) {
  if (!("button" in event)) {
    return false
  }
  const press = event as MouseEvent
  return (
    press.metaKey ||
    press.ctrlKey ||
    press.shiftKey ||
    press.altKey ||
    press.button === 1
  )
}

export {
  isModified,
  listKey,
  motionOf,
  type NavigationMenuMotion,
  opensElsewhere,
  panelKey,
  stepIndex,
}
