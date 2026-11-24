// Focus that follows an element a framework moves or renders anew.

// Chrome moves focus off a disabled or inert element a frame later, and
// Safari gives a clicked button's focus to its nearest focusable ancestor.
const lost = (active: Element, el: HTMLElement) =>
  active === el.ownerDocument.body ||
  !active.isConnected ||
  active.matches(":disabled") ||
  active.closest("[inert]") !== null ||
  active.contains(el)

/**
 * Focuses the element `element()` returns if focus fell to the page, or
 * sits where it can't stay or on an ancestor of the element, a microtask and
 * a task from now. A focused element that a framework moves,
 * or renders as a new element in another place, loses focus: React puts it
 * back after its commit, plain DOM code doesn't, and other frameworks render
 * a microtask later, or a task later. Call it after a keyboard move.
 * @stable
 */
function keepFocus(element: () => HTMLElement | undefined) {
  const restore = () => {
    const el = element()
    const active = el?.ownerDocument.activeElement
    if (el && active !== el && (!active || lost(active, el))) {
      el.focus()
    }
  }
  queueMicrotask(restore)
  setTimeout(restore)
}

export { keepFocus }
