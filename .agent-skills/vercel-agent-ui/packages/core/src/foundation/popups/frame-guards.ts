import { on } from "../kernel/events"
import { tabbables } from "../focus/tabbable"

const hidden =
  "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;outline:none"

// Tab inside an iframe moves focus in the iframe's document, where a focus
// trap can't hear it, and out of its ends to the page or the browser. While
// an iframe in `popup` has focus, a stop on each side takes that Tab back.
function guardFrames(popup: HTMLElement, trapping: () => boolean) {
  const doc = popup.ownerDocument
  let frame: HTMLIFrameElement | undefined
  let guards: HTMLElement[] = []
  const remove = () => {
    guards.forEach((guard) => guard.remove())
    guards = []
    frame = undefined
  }
  const guard = () => {
    const el = doc.createElement("span")
    el.tabIndex = 0
    el.setAttribute("aria-hidden", "true")
    el.style.cssText = hidden
    return el
  }
  const watch = () => {
    const active = doc.activeElement
    if (
      guards.length ||
      !trapping() ||
      !(active instanceof HTMLIFrameElement) ||
      !popup.contains(active)
    ) {
      return
    }
    frame = active
    guards = [guard(), guard()]
    active.before(guards[0])
    active.after(guards[1])
  }
  // Focus moving into an iframe blurs the window and moves no focus in it.
  // Some browsers point activeElement at the iframe only after the blur, and
  // some fire no blur on a window without system focus.
  const later = () => {
    watch()
    setTimeout(watch)
  }
  const offBlur = on(doc.defaultView ?? window, "blur", later)
  const offFocusOut = on(doc, "focusout", later)
  const offFocus = on(doc, "focusin", (event) => {
    const side = guards.indexOf(event.target as HTMLElement)
    const from = frame
    remove()
    if (side < 0 || !from) {
      return
    }
    const stops = tabbables(popup)
    const step = side === 0 ? -1 : 1
    const next = stops.at((stops.indexOf(from) + step) % stops.length)
    ;(next ?? popup).focus({ preventScroll: true })
  })
  return () => {
    offBlur()
    offFocusOut()
    offFocus()
    remove()
  }
}

export { guardFrames }
