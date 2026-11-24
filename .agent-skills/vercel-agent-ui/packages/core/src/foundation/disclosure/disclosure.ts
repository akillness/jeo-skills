import {
  bindFindable,
  bindPanel,
  hiddenAttrs,
  supportsHiddenUntilFound,
  type PanelBinding,
} from "../motion/panel"
import { openAttrs } from "../kernel/attrs"

// What Collapsible and Accordion share: a trigger that shows and hides a panel,
// and the panel's presence, size variables, find in page and focus handling.
// An accordion is a group of these, so both primitives build on this module.

// The reason of the change in flight, for the value change it causes. A
// controlled value arrives later, through options, and a parent that ignores
// the request never sends it back, so the reason lapses 100 ms after it was
// asked for: a later value of the parent's own isn't this change.
function createPendingReason<Reason extends string>(none: Reason) {
  let reason = none
  let askedAt = 0
  return {
    set(next: Reason) {
      reason = next
      askedAt = Date.now()
    },
    // The reason for the value that just arrived, once.
    take() {
      const taken = Date.now() - askedAt < 100 ? reason : none
      reason = none
      return taken
    },
  }
}

// Triggers rendered as something other than a button still need to be one.
function bindTriggerElement(el: HTMLElement) {
  if (el.tagName === "BUTTON") {
    return
  }
  if (!el.hasAttribute("role")) {
    el.setAttribute("role", "button")
  }
  if (!el.matches("a[href]") && !el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "0")
  }
}

// Buttons and links activate themselves. Anything else needs a click on Enter
// and Space, and so does Space on a link that says it's a button.
function triggerKeydown(event: KeyboardEvent, el: HTMLElement | undefined) {
  if (!el || el.tagName === "BUTTON" || event.target !== el) {
    return
  }
  if (
    el.matches("a[href]") &&
    (event.key !== " " || el.getAttribute("role") !== "button")
  ) {
    return
  }
  if (event.key !== "Enter" && event.key !== " ") {
    return
  }
  event.preventDefault()
  el.click()
}

// Safari doesn't focus buttons on click, so the next Tab would start from the page.
function focusPressedTrigger(el: HTMLElement | undefined) {
  if (el && typeof document !== "undefined" && document.activeElement !== el) {
    el.focus({ preventScroll: true })
  }
}

export {
  bindFindable,
  bindPanel,
  bindTriggerElement,
  createPendingReason,
  focusPressedTrigger,
  hiddenAttrs,
  openAttrs,
  type PanelBinding,
  supportsHiddenUntilFound,
  triggerKeydown,
}
