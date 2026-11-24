// Focus that would fall to the page when the focused part leaves it, like an
// item inside a branch that collapses, or a row that's deleted, goes to a
// part the component picks instead, so a keyboard user keeps their place.

/**
 * A part that left the page while it held focus.
 * @stable
 */
type LostFocus<Props = any> = {
  /** The part's key. */
  key: string
  /** The props of the part's last render. */
  props: Props
  /** Its element, now out of the page or about to be. */
  el: HTMLElement
}

/**
 * Keeps focus in a collection when the part that holds it leaves the page.
 * Call it once in `api`, and `bind` each part from its slot's `bind`. When
 * a bound part leaves with focus inside it, or focus fell to the page from
 * it, `fallback` names the element to focus instead, a microtask later, once
 * the framework is done removing. Nested parts work: focus belongs to the
 * innermost bound part around it.
 *
 * ```ts
 * const recovery = createFocusRecovery({
 *   fallback: (lost) => context.element("item", lost.props.parent),
 * })
 * // In the item slot:
 * bind: (el, part) => part.api.recovery.bind(el, part),
 * ```
 * @stable
 */
function createFocusRecovery<Props = any>(options: {
  /** The element to focus instead of a part that left with focus, or nothing to let focus go. */
  fallback: (lost: LostFocus<Props>) => HTMLElement | null | undefined
}) {
  const bound = new WeakMap<Element, unknown>()
  // The bound element that held focus last, until focus leaves it for good.
  let holder: HTMLElement | null = null

  const innermost = (node: EventTarget | null) => {
    for (
      let el = node instanceof Element ? node : null;
      el;
      el = el.parentElement
    ) {
      if (bound.has(el)) {
        return el
      }
    }
    return null
  }

  return {
    /** Tracks a bound part. Call it from the slot's `bind` and return its cleanup. */
    bind(el: HTMLElement, part: { key: string; props: Props }) {
      bound.set(el, part)
      const focusin = (event: FocusEvent) => {
        if (innermost(event.target) === el) {
          holder = el
        }
      }
      // Focus moving elsewhere lets go, unless the element left the page, which
      // some browsers report as a blur too.
      const focusout = () =>
        queueMicrotask(() => {
          if (
            holder === el &&
            el.isConnected &&
            !el.contains(document.activeElement)
          ) {
            holder = null
          }
        })
      el.addEventListener("focusin", focusin)
      el.addEventListener("focusout", focusout)
      return () => {
        el.removeEventListener("focusin", focusin)
        el.removeEventListener("focusout", focusout)
        bound.delete(el)
        const active =
          typeof document === "undefined" ? null : document.activeElement
        const held =
          el.contains(active) ||
          (holder === el && (!active || active === document.body))
        if (holder === el) {
          holder = null
        }
        if (!held) {
          return
        }
        const lost = { key: part.key, props: part.props, el }
        queueMicrotask(() => {
          const now = document.activeElement
          // Something else took focus meanwhile, like a dialog the removal opened.
          if (
            now &&
            now !== document.body &&
            now.isConnected &&
            !el.contains(now)
          ) {
            return
          }
          const target = options.fallback(lost)
          if (target?.isConnected) {
            target.focus({ preventScroll: true })
          }
        })
      }
    },
  }
}

/**
 * What `createFocusRecovery` returns.
 * @stable
 */
type FocusRecovery = ReturnType<typeof createFocusRecovery>

export { createFocusRecovery, type FocusRecovery, type LostFocus }
