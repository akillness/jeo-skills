// Opening a popup by resting the pointer on its trigger: a delay before it
// opens, a delay before it closes, and a bridge spanning the trigger and the
// popup, so the pointer can cross from one to the other.
import { on } from "../kernel/events"
import { bridgeBetween } from "./bridge"

function createHoverIntent(options: {
  // The two elements the pointer may move between, looked up live.
  trigger: () => HTMLElement | undefined
  popup: () => HTMLElement | undefined
  // Whether leaving should close the popup now: it's open, and the pointer opened it.
  closesOnLeave: () => boolean
  // Milliseconds before closing once the pointer has left both. Read on every leave.
  closeDelay: () => number
  // Closes the popup, after the delay.
  close: (event: PointerEvent) => void
}) {
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let stopBridge: (() => void) | undefined

  function stopWatching() {
    stopBridge?.()
    stopBridge = undefined
  }

  // Forgets any pending open or close, like after a press.
  function clear() {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
    stopWatching()
  }

  function scheduleClose(event: PointerEvent) {
    stopWatching()
    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => options.close(event), options.closeDelay())
  }

  return {
    clear,
    // The pointer entered the trigger or the popup. Entering either keeps an
    // open popup open. From the trigger, `open` runs after `delay`, at once
    // for 0. Touch has no hover, so a tap never counts.
    enter(event: PointerEvent, open?: () => void, delay = 0) {
      if (event.pointerType === "touch") {
        return
      }
      clearTimeout(closeTimer)
      stopWatching()
      if (!open) {
        return
      }
      clearTimeout(openTimer)
      if (delay > 0) {
        openTimer = setTimeout(open, delay)
      } else {
        open()
      }
    },
    // The pointer left the trigger or the popup. A pending open is dropped.
    // On its way between the two, the popup stays open until the pointer
    // leaves the area that spans both.
    leave(event: PointerEvent) {
      if (event.pointerType === "touch") {
        return
      }
      clearTimeout(openTimer)
      if (!options.closesOnLeave()) {
        return
      }
      const trigger = options.trigger()
      const popup = options.popup()
      if (!trigger || !popup) {
        return scheduleClose(event)
      }
      const inside = bridgeBetween(
        trigger.getBoundingClientRect(),
        popup.getBoundingClientRect()
      )
      if (!inside(event.clientX, event.clientY)) {
        return scheduleClose(event)
      }
      stopWatching()
      stopBridge = on(popup.ownerDocument, "pointermove", (move) => {
        if (!inside(move.clientX, move.clientY)) {
          scheduleClose(move)
        }
      })
    },
  }
}

type HoverIntent = ReturnType<typeof createHoverIntent>

export { createHoverIntent, type HoverIntent }
