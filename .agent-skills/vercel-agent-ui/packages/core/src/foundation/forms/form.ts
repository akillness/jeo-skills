// Native form participation, shared by every form control.
//
// A control takes part in a plain <form> in one of two ways:
// - React and Vue render a visually hidden native <input> next to the control.
//   `bindHiddenInput` keeps it in sync, so the form submits, resets and
//   validates it like any input, even before hydration.
// - Custom elements are form-associated. The web adapter hands the core their
//   ElementInternals with the binder from form-internals.ts, and forwards
//   their form callbacks there. `bindInternals` reports the value and
//   validity through it.
import { takeEarlyText } from "../kernel/early-text"
import { documentOrder } from "../kernel/order"
import { trusted } from "../kernel/trusted"
import { afterReset, writeValue, writingFromScript } from "./value"
import type { bindElementInternals } from "./form-internals"

type InternalsBinder = typeof bindElementInternals

const internalsOf = new WeakMap<
  HTMLElement,
  { internals: ElementInternals; bind: InternalsBinder }
>()

// What a control submits: one value, several under its name, entries of its
// own like files, or nothing.
type FormValue = string | string[] | FormData | null
const focusOf = new WeakMap<HTMLElement, () => void>()

// Where focus goes for an element that isn't focusable itself, like a group. Returns a cleanup.
function focusWith(el: HTMLElement, focus: () => void) {
  focusOf.set(el, focus)
  return () => {
    if (focusOf.get(el) === focus) {
      focusOf.delete(el)
    }
  }
}

// Focuses a control the way a user would reach it. A group focuses its tab stop.
function focusControl(el: HTMLElement) {
  const focus = focusOf.get(el)
  if (focus) {
    focus()
  } else {
    el.focus()
  }
}

// The first invalid control of a submission takes focus, and later ones don't
// steal it. Microtasks run between the browser's invalid events, so the claim
// lasts until the next task.
const focusing = new WeakSet<object>()
function claimInvalidFocus(
  el: HTMLElement,
  form: HTMLFormElement | null | undefined
) {
  const owner = form ?? el.ownerDocument
  if (focusing.has(owner)) {
    return
  }
  focusing.add(owner)
  setTimeout(() => focusing.delete(owner))
  focusControl(el)
}

// Whether an earlier control of this submission already took focus.
function invalidFocusClaimed(
  el: HTMLElement,
  form: HTMLFormElement | null | undefined
) {
  return focusing.has(form ?? el.ownerDocument)
}

// Called by adapters for form-associated custom elements, with
// `bindElementInternals` from form-internals.ts, so only they ship it.
function attachFormInternals(
  el: HTMLElement,
  internals: ElementInternals,
  bind: InternalsBinder
) {
  internalsOf.set(el, { internals, bind })
}

function formInternals(el: HTMLElement | undefined) {
  return el ? internalsOf.get(el)?.internals : undefined
}

const messages = new Map<string, string>()

// The browser's own message for a missing value, in the user's language. A
// detached required input carries it.
function valueMissingMessage(
  type: "checkbox" | "radio" | "select" | "file" | "text"
) {
  if (typeof document === "undefined") {
    return ""
  }
  if (!messages.has(type)) {
    const control =
      type === "select"
        ? document.createElement("select")
        : Object.assign(document.createElement("input"), { type })
    control.name = "message"
    control.required = true
    messages.set(type, control.validationMessage)
  }
  return messages.get(type)!
}

// Fields that read their controls' validity again when a component changes it
// in a way no event reports.
const validityListeners = new Set<(el: HTMLElement) => void>()

// Tells fields around a control that its validity changed.
function validityChanged(el: HTMLElement) {
  validityListeners.forEach((listener) => listener(el))
}

// Calls `listener` with the control whenever `validityChanged` reports one. Returns a cleanup.
function onValidityChange(listener: (el: HTMLElement) => void) {
  validityListeners.add(listener)
  return () => {
    validityListeners.delete(listener)
  }
}

// The message a component holds on a control, and the app's own message it
// replaced. Kept by element, so a part that binds again, like under React's
// <Activity>, picks up what the element already carries.
const heldMessages = new WeakMap<
  HTMLInputElement,
  { message: string; app: string; flag?: ValidityFlag }
>()

type ValidityFlag = Exclude<keyof ValidityState, "valid">

// Sets a native control's custom validity from a component's own check, like a
// date picker's text that isn't a date, and tells fields around it. An empty
// message gives the control back the message the app had set, unless the app
// set another one since. A control barred from validation, like a disabled
// one, reports no message, so there it's taken to still hold the component's.
function setComponentValidity(
  el: HTMLInputElement,
  message: string,
  flag?: ValidityFlag
) {
  const held = heldMessages.get(el)
  if ((held?.message ?? "") === message && held?.flag === flag) {
    return
  }
  if (message) {
    if (held) {
      held.message = message
      held.flag = flag
    } else {
      heldMessages.set(el, {
        message,
        app: el.validity.customError ? el.validationMessage : "",
        flag,
      })
    }
    el.setCustomValidity(message)
  } else {
    heldMessages.delete(el)
    if (!el.willValidate || el.validationMessage === held!.message) {
      el.setCustomValidity(held!.app)
    }
  }
  validityChanged(el)
}

// The flag a component's message stands for, like rangeUnderflow, which a
// custom validity can't set on a native control.
function componentFlagOf(el: HTMLElement) {
  const held = heldMessages.get(el as HTMLInputElement)
  return held && (el as HTMLInputElement).validationMessage === held.message
    ? held.flag
    : undefined
}

const blocksImplicitSubmission = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
  "number",
])

// A Date Input's and Time Input's segments. A browser counts each one as a
// text field that blocks implicit submission, but a native date input as none.
const segments = new WeakSet<HTMLInputElement>()
const nudged = new WeakSet<Event>()

// `form.elements` leaves out image buttons, so this reads the form's tree.
const defaultButton = (form: HTMLFormElement) =>
  Array.from(
    (form.getRootNode() as ParentNode).querySelectorAll<
      HTMLButtonElement | HTMLInputElement
    >("button, input[type=submit], input[type=image]")
  ).find(
    (el) => el.form === form && (el.type === "submit" || el.type === "image")
  )

const blocking = (elements: Element[]) =>
  elements.filter(
    (el): el is HTMLInputElement =>
      el instanceof HTMLInputElement && blocksImplicitSubmission.has(el.type)
  )

// Enter on a checkbox, switch or radio submits its form, like it does on a
// native one: it clicks the default button, or submits a form without one
// when nothing else claims Enter.
function submitImplicitly(form: HTMLFormElement | null | undefined) {
  if (!form) {
    return
  }
  const button = defaultButton(form)
  if (button) {
    if (!button.disabled) {
      button.click()
    }
    return
  }
  if (
    blocking(Array.from(form.elements)).filter((el) => !segments.has(el))
      .length <= 1
  ) {
    form.requestSubmit()
  }
}

// Enter in a form whose only text field sits beside segments, or in a segment
// of a form with no other, submits it, which the browser doesn't.
function bindSegmentSubmit(input: HTMLInputElement) {
  segments.add(input)
  const doc = input.ownerDocument
  const onKeydown = (event: KeyboardEvent) => {
    const target = event.composedPath()[0]
    const form = input.form
    if (
      !form ||
      event.key !== "Enter" ||
      event.defaultPrevented ||
      event.isComposing ||
      nudged.has(event) ||
      !(target instanceof HTMLInputElement) ||
      target.form !== form ||
      !blocksImplicitSubmission.has(target.type)
    ) {
      return
    }
    nudged.add(event)
    const fields = blocking(Array.from(form.elements))
    if (
      !defaultButton(form) &&
      fields.length > 1 &&
      fields.filter((el) => !segments.has(el)).length <= 1
    ) {
      form.requestSubmit()
    }
  }
  doc.addEventListener("keydown", onKeydown)
  return () => {
    segments.delete(input)
    doc.removeEventListener("keydown", onKeydown)
  }
}

// Native `input` and `change` events from the element that takes part in the
// form, after a user changes the value, so form listeners and fields hear it.
// Controls with a continuous value send `input` as it changes and `change`
// when the interaction ends, like a native range or text input.
function dispatchChange(
  el: HTMLElement | undefined,
  types: readonly ("input" | "change")[] = ["input", "change"]
) {
  if (!el || writingFromScript(el)) {
    return
  }
  // Controlled components render the new value first.
  queueMicrotask(() => {
    if (!el.isConnected) {
      return
    }
    if (types.includes("input")) {
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
    }
    if (types.includes("change")) {
      el.dispatchEvent(new Event("change", { bubbles: true }))
    }
  })
}

// An ancestor fieldset's `disabled` disables every control inside it, except
// those in its first legend.
function fieldsetDisabled(el: Element) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (!(node instanceof HTMLFieldSetElement) || !node.disabled) {
      continue
    }
    const legend = node.querySelector(":scope > legend")
    if (!legend?.contains(el)) {
      return true
    }
  }
  return false
}

// Visually hidden, but still able to take focus, so the browser can point its
// validation message at it. Positioned where it would sit in the flow, next to the control.
const hiddenInputStyle =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;opacity:0;pointer-events:none"

type Association = {
  // Runs after a form reset, once the form has reset its own controls.
  reset: () => void
  // An ancestor fieldset or the form disabled the control, or enabled it again.
  disabled: (disabled: boolean) => void
}

// The form side of a hidden native input: a form reset, the browser focusing
// it (like on an invalid submit), and ancestor fieldsets disabling it.
function associate(
  input: HTMLInputElement,
  options: Association & { focus: () => void; write: () => void }
) {
  const cleanups: (() => void)[] = []

  const onReset = (event: Event) => {
    if (event.target !== input.form) {
      return
    }
    afterReset(event, () => {
      options.reset()
      options.write()
    })
  }
  input.ownerDocument.addEventListener("reset", onReset, true)
  cleanups.push(() =>
    input.ownerDocument.removeEventListener("reset", onReset, true)
  )

  const onFocus = () => options.focus()
  input.addEventListener("focus", onFocus)
  cleanups.push(() => input.removeEventListener("focus", onFocus))

  cleanups.push(watchFieldsets(input, options.disabled))
  return () => cleanups.forEach((cleanup) => cleanup())
}

// What a watched element checks again once it moves, for a renderer that
// keeps its binding through a move, like a custom element.
const moves = new WeakMap<Element, () => void>()

// Reports whether ancestor fieldsets disable `el`, now and whenever that
// changes. Vue binds before the element is in its parents, so fieldsets are
// found a microtask later. Returns a cleanup.
function watchFieldsets(el: Element, onChange: (disabled: boolean) => void) {
  let disabled: boolean | undefined
  let observer: MutationObserver | undefined
  let active = true
  // A move out of a fieldset removes `el`, or a node between it and the
  // fieldset, from its parent, so those parents are watched too.
  const check = () => {
    if (observer) {
      observer.disconnect()
      for (
        let node = el.parentElement;
        node?.closest("fieldset");
        node = node.parentElement
      ) {
        observer.observe(node, {
          childList: true,
          attributeFilter: ["disabled"],
        })
      }
    }
    const now = fieldsetDisabled(el)
    if (now !== disabled) {
      onChange((disabled = now))
    }
  }
  const watch = () => {
    if (!active) {
      return
    }
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(check)
    }
    check()
    moves.set(el, check)
  }
  if (el.isConnected) {
    watch()
  } else {
    queueMicrotask(watch)
  }
  return () => {
    active = false
    observer?.disconnect()
    moves.delete(el)
  }
}

// Tells what watches `el` that it moved, which no mutation of the fieldsets shows.
const elementMoved = (el: Element) => moves.get(el)?.()

// A control's own `disabled` (or its field's), or a disabled fieldset around it
// as `watchFieldsets` reports.
const isDisabled = (state: { disabled: boolean; formDisabled: boolean }) =>
  state.disabled || state.formDisabled

const watchFormDisabled = (
  el: Element,
  store: { set: (patch: { formDisabled: boolean }) => void }
) => watchFieldsets(el, (formDisabled) => store.set({ formDisabled }))

// Whether a person can't use `el`: natively disabled, by itself or a fieldset,
// or marked `aria-disabled`.
const isDisabledElement = (el: Element) =>
  el.matches(":disabled") || el.getAttribute("aria-disabled") === "true"

// Keeps a hidden input's checkedness in step with the control and reports
// what happens to its form.
function bindHiddenInput(
  input: HTMLInputElement,
  options: Association & {
    checked: () => boolean
    indeterminate?: () => boolean
    subscribe: (listener: () => void) => () => void
    // Where focus goes when the browser focuses the input, like on an invalid submit.
    focus: () => void
    // The visible control. A <label> can only name and activate it when it's
    // labelable, like a button. Otherwise the label reaches this input instead.
    control?: () => HTMLElement | undefined
    // What a click from a label does: toggle or select, like on the control.
    activate?: (event: Event) => void
  }
) {
  const write = () => {
    const checked = options.checked()
    if (input.checked !== checked) {
      input.checked = checked
    }
    const indeterminate = options.indeterminate?.() ?? false
    if (input.indeterminate !== indeterminate) {
      input.indeterminate = indeterminate
    }
  }
  write()
  const cleanups = [
    options.subscribe(write),
    associate(input, { ...options, write }),
  ]

  // A label around a control that isn't labelable activates this input. The
  // control does what it would have done, and the input stays in step.
  const onClick = (event: MouseEvent) => {
    const control = options.control?.()
    if (!control || isLabelable(control)) {
      return
    }
    event.preventDefault()
    options.focus()
    options.activate?.(event)
  }
  input.addEventListener("click", onClick)
  cleanups.push(() => input.removeEventListener("click", onClick))
  // Labels around it name the control too.
  queueMicrotask(() => {
    const control = options.control?.()
    if (control && !isLabelable(control)) {
      cleanups.push(labelledBy(control, () => labelsOf(input)))
    }
  })

  return () => cleanups.forEach((cleanup) => cleanup())
}

// Keeps a visually hidden text input's value in step with a control that
// holds a value, like a select, and reports what happens to its form. A real
// text input, so `required` validates and the browser can autofill it:
// `autofill` hears what the browser wrote.
function bindValueInput(
  input: HTMLInputElement,
  options: Association & {
    value: () => string
    subscribe: (listener: () => void) => () => void
    focus: () => void
    autofill?: (value: string) => void
  }
) {
  const write = () => writeValue(input, options.value())
  write()
  // Events this code dispatches itself carry no autofill.
  const onChange = (event: Event) => {
    if (!trusted(event) || input.value === options.value()) {
      return
    }
    options.autofill?.(input.value)
    write()
  }
  input.addEventListener("change", onChange)
  const cleanups = [
    options.subscribe(write),
    associate(input, { ...options, write }),
    () => input.removeEventListener("change", onChange),
  ]
  return () => cleanups.forEach((cleanup) => cleanup())
}

// Reports a form-associated custom element's value and validity through its
// ElementInternals, with the binder the web adapter attached. Elsewhere,
// like for a React control, it does nothing.
function bindInternals(
  el: HTMLElement,
  options: Parameters<InternalsBinder>[2]
) {
  const attached = internalsOf.get(el)
  return attached ? attached.bind(el, attached.internals, options) : () => {}
}

// Shared on `globalThis` like anchor names, so two copies of core never give two labels one id.
const labelCount = ((globalThis as Record<symbol, unknown>)[
  Symbol.for("ui-sdk.label-ids@1")
] ??= { count: 0 }) as { count: number }

const fieldControlId = (fieldId: string) => `${fieldId}-control`

// Elements a <label> can name and activate.
function isLabelable(el: HTMLElement) {
  return (
    el instanceof HTMLButtonElement ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLMeterElement ||
    el instanceof HTMLOutputElement ||
    el instanceof HTMLProgressElement ||
    internalsOf.has(el)
  )
}

// Assistive technology and test tools don't all name a custom element from its
// <label>. Point aria-labelledby at its labels, unless it's named some other way.
// Does nothing for elements that aren't form-associated. `target` is the
// element to name, when it isn't the custom element itself, like a select's trigger.
function nameFromLabels(el: HTMLElement, target: HTMLElement = el) {
  return formInternals(el)
    ? labelledBy(target, () => labelsOf(el), el)
    : () => {}
}

// The <label> elements that name a labelable element, in document order,
// like its `labels`. Chromium finds those by walking the whole document on
// every read, which made mounting many controls quadratic. Only a label
// around the element or one pointing at its id can name it. An element with
// an id still costs one query of its root, about half what `labels` costs.
function labelsOf(el: HTMLElement) {
  const labels: HTMLLabelElement[] = []
  const around = el.closest("label")
  if (around?.control === el) {
    labels.push(around)
  }
  if (el.id) {
    const root = el.getRootNode() as ParentNode
    root
      .querySelectorAll<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`)
      .forEach((label) => {
        if (label !== around && label.control === el) {
          labels.push(label)
        }
      })
  }
  return labels.sort(documentOrder)
}

// Points aria-labelledby at labels, unless the element is named some other way.
// `watch` is where focus arriving refreshes it, the element itself by default.
function labelledBy(
  el: HTMLElement,
  findLabels: () => HTMLElement[],
  watch: HTMLElement = el
) {
  let written: string | undefined
  const update = () => {
    const current = el.getAttribute("aria-labelledby")
    if (
      el.hasAttribute("aria-label") ||
      (current !== null && current !== written)
    ) {
      return
    }
    const labels = findLabels()
    for (const label of labels) {
      if (!label.id) {
        label.id = `ui-sdk-label-${++labelCount.count}`
      }
    }
    const ids = labels.map((label) => label.id).join(" ")
    if (!ids) {
      if (written !== undefined) {
        el.removeAttribute("aria-labelledby")
      }
      written = undefined
      return
    }
    written = ids
    if (current !== ids) {
      el.setAttribute("aria-labelledby", ids)
    }
  }
  // Labels after the element connect after it.
  queueMicrotask(update)
  watch.addEventListener("focusin", update)
  return () => watch.removeEventListener("focusin", update)
}

// Text typed before the page's script ran goes in as typing. A field can show more
// than one text, like a date before and after its root reads the page's language.
// Text a framework wrote over as it hydrated goes in once hydration is done.
function takeTypedText(
  input: HTMLInputElement,
  shown: () => string[],
  take: () => void
) {
  const typed = () =>
    input.value !== input.defaultValue && !shown().includes(input.value)
  const text = takeEarlyText(input)
  if (typed()) {
    take()
    return
  }
  if (text === undefined) {
    return
  }
  queueMicrotask(() => {
    if (input.isConnected && !typed()) {
      input.value = text
      if (typed()) {
        take()
      }
    }
  })
}

export {
  associate,
  type Association,
  attachFormInternals,
  bindHiddenInput,
  bindSegmentSubmit,
  bindInternals,
  bindValueInput,
  claimInvalidFocus,
  componentFlagOf,
  dispatchChange,
  elementMoved,
  fieldControlId,
  fieldsetDisabled,
  focusWith,
  formInternals,
  type FormValue,
  hiddenInputStyle,
  invalidFocusClaimed,
  isDisabled,
  isDisabledElement,
  isLabelable,
  labelledBy,
  labelsOf,
  nameFromLabels,
  onValidityChange,
  setComponentValidity,
  submitImplicitly,
  takeTypedText,
  validityChanged,
  valueMissingMessage,
  watchFieldsets,
  watchFormDisabled,
}
