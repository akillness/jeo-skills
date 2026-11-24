// Reading the DOM the way assistive technology does, for `checkPattern`:
// roles, names, tab stops, id references, direction, and what a person can't
// reach. Approximations a test DOM can answer without layout.
import {
  accessibleName,
  namedByContent,
  roleOf,
} from "../foundation/text/accessible-name"

// What takes focus, like the tab order in `input.ts`.
const focusable =
  "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]:not([contenteditable=false])"

const referenceAttributes = [
  "aria-controls",
  "aria-labelledby",
  "aria-describedby",
  "aria-activedescendant",
  "aria-owns",
]

// Not rendered, so no person meets it: removed, `hidden`, or `inert`.
const isGone = (el: Element) =>
  !el.isConnected || !!el.closest("[hidden], [inert]")

// Rendered but hidden from screen readers, or unreachable: focus must never land here.
const isUnreachable = (el: Element) =>
  !!el.closest('[aria-hidden="true"], [inert]')

// The parent the page renders an element in: the slot it's assigned to, or a shadow root's host.
const renderedParent = (el: Element) =>
  el.assignedSlot ??
  el.parentElement ??
  ((el.parentNode as ShadowRoot | null)?.host || null)

/** Whether `display: none` on `el` or an element around it hides it, like a closed branch its styles hide. */
// check-code: allow return-type recursive, so TypeScript cannot infer it.
function isUndisplayed(
  el: Element | null,
  known = new Map<Element, boolean>()
): boolean {
  if (!el) {
    return false
  }
  let hidden = known.get(el)
  if (hidden === undefined) {
    known.set(
      el,
      (hidden =
        getComputedStyle(el).display === "none" ||
        isUndisplayed(renderedParent(el), known))
    )
  }
  return hidden
}

/**
 * Every element in `scope` with one of `roles`, in page order, leaving out what isn't rendered or is
 * hidden from screen readers, like a form's hidden native input. With `displayed` false it keeps what
 * styles hide, like a collapsed tree branch's group, for structure checks.
 */
function withRole(scope: Element, roles: string[], { displayed = true } = {}) {
  const known = new Map<Element, boolean>()
  return [...scope.querySelectorAll("*")].filter(
    (el) =>
      roles.includes(roleOf(el)) &&
      !isGone(el) &&
      !isUnreachable(el) &&
      (!displayed || !isUndisplayed(el, known))
  )
}

/** Whether an attribute is "true" or "false", as a boolean state must be. */
const hasBoolean = (el: Element, attribute: string) =>
  ["true", "false"].includes(el.getAttribute(attribute) ?? "")

/** A checked state as a screen reader reads it: aria-checked, or a native input's `checked`. */
const checkedOf = (el: Element) =>
  el instanceof HTMLInputElement && !el.hasAttribute("aria-checked")
    ? String(el.checked)
    : (el.getAttribute("aria-checked") ?? "")

// `aria-readonly` says a control keeps its state: it takes focus, never a change.
const isReadOnly = (el: Element) => el.getAttribute("aria-readonly") === "true"

function isTabStop(el: Element, known: Map<Element, boolean>) {
  if (!el.matches(focusable) || isGone(el)) {
    return false
  }
  if ((el as HTMLElement).tabIndex < 0 || el.matches(":disabled")) {
    return false
  }
  if (el instanceof HTMLInputElement && el.type === "hidden") {
    return false
  }
  if (isUndisplayed(el, known)) {
    return false
  }
  // Native radios that share a name are one stop: the checked one, else the first.
  if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
    const group = [
      ...el.ownerDocument.querySelectorAll<HTMLInputElement>(
        "input[type=radio]"
      ),
    ].filter(
      (radio) =>
        radio.name === el.name &&
        radio.form === el.form &&
        !isUndisplayed(radio, known)
    )
    return el === (group.find((radio) => radio.checked) ?? group[0])
  }
  return true
}

/** The elements in `scope`, itself included, that Tab stops at. */
function tabStops(scope: Element) {
  const known = new Map<Element, boolean>()
  return [scope, ...scope.querySelectorAll(focusable)].filter((el) =>
    isTabStop(el, known)
  )
}

/** The elements in `scope` that can take focus, by Tab or by script, like roving items. */
function focusables(scope: Element) {
  const known = new Map<Element, boolean>()
  return [...scope.querySelectorAll(focusable)].filter(
    (el) =>
      !isGone(el) &&
      !el.matches(":disabled") &&
      !(el instanceof HTMLInputElement && el.type === "hidden") &&
      !isUndisplayed(el, known)
  )
}

const ids = (el: Element, attribute: string) =>
  (el.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean)

const textOf = (el: Element) =>
  (el.textContent ?? "").replace(/\s+/g, " ").trim()

/** The element an id reference names, in the document or shadow root `el` is in, as ARIA resolves it. */
function byId(el: Element, id: string) {
  const root = el.getRootNode()
  return root instanceof Document || root instanceof ShadowRoot
    ? root.getElementById(id)
    : null
}

/** The id references in `scope` that point at nothing, with the attribute that holds each. */
function danglingReferences(scope: Element) {
  const dangling: { el: Element; attribute: string; id: string }[] = []
  // What isn't rendered says nothing to anyone, like a popup that closed.
  for (const el of [scope, ...scope.querySelectorAll("*")].filter(
    (el) => !isGone(el)
  )) {
    for (const attribute of referenceAttributes) {
      // A closed popup's trigger may point at a popup that isn't rendered,
      // as axe allows: aria-controls with aria-expanded=false.
      if (
        attribute === "aria-controls" &&
        el.getAttribute("aria-expanded") === "false"
      ) {
        continue
      }
      for (const id of ids(el, attribute)) {
        if (!byId(el, id)) {
          dangling.push({ el, attribute, id })
        }
      }
    }
  }
  return dangling
}

/** Whether `el` reads right to left: the nearest `dir`, else its computed direction. */
function isRtl(el: Element) {
  const dir = el.closest("[dir]")?.getAttribute("dir")?.toLowerCase()
  if (dir === "rtl" || dir === "ltr") {
    return dir === "rtl"
  }
  return getComputedStyle(el).direction === "rtl"
}

/** A short selector that names an element in a problem, like `button#tabs-tab-b[role=tab]`. */
function describe(el: Element | null | undefined) {
  if (!el) {
    return "nothing"
  }
  if (el === el.ownerDocument.body) {
    return "body"
  }
  const role = el.getAttribute("role")
  const selector = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${role ? `[role=${role}]` : ""}`
  // Without an id, the start of its text tells an item from its siblings. A
  // container's text is all its items', which tells nothing.
  if (el.id || (el.children.length && !namedByContent.has(roleOf(el)))) {
    return selector
  }
  const text = textOf(el).slice(0, 24)
  return text ? `${selector} "${text}"` : selector
}

export {
  accessibleName,
  byId,
  checkedOf,
  danglingReferences,
  describe,
  focusables,
  hasBoolean,
  ids,
  isGone,
  isReadOnly,
  isRtl,
  isUndisplayed,
  isUnreachable,
  roleOf,
  tabStops,
  withRole,
}
