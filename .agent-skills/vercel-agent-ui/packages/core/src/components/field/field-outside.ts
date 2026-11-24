import { dev, warn } from "#dev"
import { checkName } from "#name-check"
import type { FieldErrorProps, FieldErrorState } from "./field"

// Field parts outside a Field render as plain elements with no field wiring,
// so a FieldLabel can wrap a whole Field, like a choice card, and label the
// control inside it the way any native <label> does. Adapters render them
// with what this module gives, and check their elements through it.

type FieldOutsideSlot = "label" | "description" | "error" | "control"

// What a part outside a field shows: no field disables, requires or invalidates it.
const fieldOutsideState: FieldErrorState = {
  disabled: false,
  required: false,
  focused: false,
  invalid: false,
  valid: false,
  message: "",
}

// Only the slot, so styles that select a part still match it.
const fieldOutsideAttrs = (slot: FieldOutsideSlot) => ({
  "data-slot": `field-${slot}`,
})

// No validation decides an error outside a field, so only `match` shows it.
const fieldOutsideErrorShown = (props: FieldErrorProps) => props.match === true

// How long a label outside a field may wait for its control, like one behind
// a Suspense boundary or an `{#if}`, before it warns that it labels nothing.
const labelWait = 1000

// Elements already checked or being watched, since a framework may hand one
// over again, like React's strict mode or Vue on every render.
const checked = new WeakSet<Element>()

// Whether a label labels something now, or names its control with `for`,
// whose target may render anywhere and at any time.
const labels = (el: Element) =>
  el instanceof HTMLLabelElement ? !!el.control || el.htmlFor !== "" : false

// A short quote of the label, so the warning says which one.
const quote = (el: Element) => {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

// Watches a label for its control: any change inside it may bring one, and
// one that comes in time ends the wait. The label warns only if it's still in
// the page without a control once the wait ends. One that isn't in the page
// yet, like one behind a pending boundary, waits again.
function watchLabel(el: Element, fix: string) {
  const observer = new MutationObserver(() => {
    if (labels(el)) {
      done()
    }
  })
  observer.observe(el, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["for"],
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const done = () => {
    observer.disconnect()
    clearTimeout(timer)
  }
  let waits = 0
  const wait = () => {
    timer = setTimeout(() => {
      if (labels(el)) {
        return done()
      }
      if (!el.isConnected) {
        return ++waits < 10 ? wait() : done()
      }
      done()
      warn(
        `A FieldLabel outside a Field labels nothing ("${quote(el)}"). ${fix}`,
        { component: "field" }
      )
    }, labelWait)
  }
  wait()
}

/**
 * In development, warns when a part outside a field leaves a control without
 * a label: a label that labels no control, or a control nothing names. `fix`
 * says, in the adapter's own words, how to give a label its control.
 */
function checkFieldOutside(
  el: Element | null | undefined,
  slot: FieldOutsideSlot,
  fix = "Put the control inside it, or point its `for` at the control."
) {
  if (
    !dev ||
    !el ||
    checked.has(el) ||
    typeof MutationObserver === "undefined"
  ) {
    return
  }
  checked.add(el)
  if (slot === "control") {
    return checkName(el as HTMLElement, "A FieldControl outside a Field", {
      component: "field",
    })
  }
  if (slot === "label" && !labels(el)) {
    watchLabel(el, fix)
  }
}

export {
  checkFieldOutside,
  fieldOutsideAttrs,
  fieldOutsideErrorShown,
  type FieldOutsideSlot,
  fieldOutsideState,
}
