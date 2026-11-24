// The end of a draft: a drag or keyboard move that shows a value before it commits.

/**
 * Clears a draft once the value it committed arrives, so a controlled value
 * never renders its old state between the drop and its new value. `before`
 * is the value from before the commit: an uncontrolled store has already
 * moved on, so `clear` runs now, and a parent that kept the old value shows
 * it again a task later. `clear` should check the draft is still the one
 * dropped, since another can start before the value arrives.
 * @experimental
 */
function settleDraft(
  store: { subscribe: (listener: () => void) => () => void },
  value: () => unknown,
  before: unknown,
  clear: () => void
) {
  if (value() !== before) {
    return clear()
  }
  const done = () => {
    unsubscribe()
    clearTimeout(timer)
    clear()
  }
  const unsubscribe = store.subscribe(() => value() !== before && done())
  const timer = setTimeout(done)
}

export { settleDraft }
