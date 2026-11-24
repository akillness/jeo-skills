// Development warnings for parts nobody can name. Core imports it as
// `#name-check`, a conditional subpath import like `#dev`, so a production
// build resolves `name-check-stub.ts` instead and ships none of this, nor the
// accessible name it reads.
import { warn } from "#dev"
import { hasAccessibleName } from "./accessible-name"

// Elements another component names, like an icon button its tooltip names, and
// whether it does now.
const namers = new WeakMap<Element, () => boolean>()

/**
 * Tells `checkName` that a component names `el` while `names()` says so, like
 * a tooltip naming an icon trigger it shares with a popover. Returns a cleanup.
 */
function nameFrom(el: Element, names: () => boolean) {
  namers.set(el, names)
  return () => {
    if (namers.get(el) === names) {
      namers.delete(el)
    }
  }
}

/**
 * Warns when a part has no accessible name and no component names it through
 * `nameFrom`. Names come from content or `aria-*`, never a `label` prop, and
 * every part warns through here, so the inspector shows it. Hidden text, like
 * an icon inside `aria-hidden`, names nothing, and a part inside `aria-hidden`
 * needs no name. It checks a task later, once every part on the element has
 * bound and rendered, so a tooltip that names the same element counts.
 */
function checkName(
  el: HTMLElement,
  part: string,
  from: { component: string; id?: string }
) {
  if (typeof document === "undefined") {
    return
  }
  setTimeout(() => {
    if (
      el.isConnected &&
      !el.closest('[aria-hidden="true"]') &&
      !hasAccessibleName(el) &&
      !namers.get(el)?.()
    ) {
      warn(`${part} has no accessible name. Add text or an aria-label.`, from)
    }
  })
}

export { checkName, nameFrom }
