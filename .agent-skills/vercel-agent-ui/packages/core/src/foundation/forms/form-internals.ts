// Form participation for form-associated custom elements, through their
// ElementInternals. Only the web adapter imports this module: it hands each
// element's internals to the core with `bindElementInternals`, so components
// in the other adapters, which use a hidden input, never ship it.
import {
  claimInvalidFocus,
  focusWith,
  labelledBy,
  labelsOf,
  validityChanged,
  type Association,
  type FormValue,
} from "./form"

type FormCallbacks = {
  reset?: () => void
  disabled?: (disabled: boolean) => void
  restore?: (state: unknown, mode: string) => void
  // The element's own setCustomValidity() changed its message.
  customValidity?: () => void
}

const callbacksOf = new WeakMap<HTMLElement, FormCallbacks>()

// The message each element's own setCustomValidity() set. Like a native
// input's, it stays through form resets and reconnects until the app clears it.
const customMessages = new WeakMap<HTMLElement, string>()

// Adapters forward formResetCallback, formDisabledCallback,
// formStateRestoreCallback and setCustomValidity here.
function formCallback(el: HTMLElement, type: "reset"): void
function formCallback(
  el: HTMLElement,
  type: "disabled",
  disabled: boolean
): void
function formCallback(
  el: HTMLElement,
  type: "restore",
  state: unknown,
  mode: string
): boolean
function formCallback(
  el: HTMLElement,
  type: "customValidity",
  message: string
): boolean
function formCallback(
  el: HTMLElement,
  type: keyof FormCallbacks,
  ...args: unknown[]
) {
  if (type === "customValidity") {
    customMessages.set(el, args[0] as string)
  }
  const callback = callbacksOf.get(el)?.[type] as
    ((...args: unknown[]) => void) | undefined
  callback?.(...args)
  return !!callback
}

// Reports a form-associated custom element's value and validity through its
// ElementInternals, and handles its form callbacks.
function bindElementInternals(
  el: HTMLElement,
  internals: ElementInternals,
  options: Association & {
    // What the element submits under its `name`, or several values for a
    // group, under `name()`, or entries of its own, like files. Null submits nothing.
    value: () => FormValue
    name?: () => string | undefined
    // Saved with the value, and handed back when the browser restores the form.
    state: () => string
    restore: (state: string) => void
    valueMissing: () => boolean
    message: () => string
    // A problem the component finds itself, like a date picker's text that
    // isn't a date, with its message and where the browser points it.
    invalid?: () =>
      | { flags: ValidityStateFlags; message: string; anchor?: HTMLElement }
      | undefined
    // Where the browser points its validation message.
    anchor?: () => HTMLElement | undefined
    // Where focus goes for the element, when it isn't focusable itself, like a group.
    focus?: () => void
    subscribe: (listener: () => void) => () => void
  }
) {
  // The component's own problem last reported, so fields hear when it changes.
  let reported = ""
  const sync = () => {
    const value = options.value()
    if (value instanceof FormData) {
      internals.setFormValue(value, options.state())
    } else if (Array.isArray(value)) {
      const data = new FormData()
      const name = options.name?.()
      if (name) {
        for (const item of value) {
          data.append(name, item)
        }
      }
      internals.setFormValue(data, options.state())
    } else {
      internals.setFormValue(value, options.state())
    }
    const missing = options.valueMissing()
    const custom = customMessages.get(el)
    const invalid = options.invalid?.()
    if (custom) {
      internals.setValidity(
        { customError: true },
        custom,
        options.anchor?.() ?? el
      )
    } else if (invalid) {
      internals.setValidity(
        invalid.flags,
        invalid.message,
        invalid.anchor ?? options.anchor?.() ?? el
      )
    } else if (missing) {
      internals.setValidity(
        { valueMissing: true },
        options.message(),
        options.anchor?.() ?? el
      )
    } else {
      internals.setValidity({})
    }
    if ((invalid?.message ?? "") === reported) {
      return
    }
    reported = invalid?.message ?? ""
    validityChanged(el)
  }
  sync()
  const unsubscribe = options.subscribe(sync)
  const unfocus = options.focus ? focusWith(el, options.focus) : () => {}
  // A fieldset may have disabled it before the core was listening.
  if (el.matches(":disabled")) {
    options.disabled(true)
  }

  callbacksOf.set(el, {
    reset: () => {
      options.reset()
      sync()
    },
    disabled: (disabled) => options.disabled(disabled),
    restore: (state) => {
      if (typeof state === "string") {
        options.restore(state)
      }
    },
    customValidity: sync,
  })

  const unlabel = labelledBy(el, () => labelsOf(el))

  // A group element isn't focusable, and Firefox won't focus its validation
  // anchor either, so an invalid group sends focus to its first item.
  const onInvalid = () => {
    if (options.focus) {
      claimInvalidFocus(el, internals.form)
    }
  }
  el.addEventListener("invalid", onInvalid)

  return () => {
    el.removeEventListener("invalid", onInvalid)
    unsubscribe()
    unlabel()
    callbacksOf.delete(el)
    unfocus()
  }
}

export { bindElementInternals, formCallback }
