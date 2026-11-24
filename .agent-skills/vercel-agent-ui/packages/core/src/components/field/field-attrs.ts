import type { FieldApi, FieldErrorProps } from "./field"
import type { Validity } from "./field-control"
import { fieldControlId, formInternals } from "../../foundation/forms/form"
import { madeLabel } from "../../foundation/kernel/part"
import type { Store } from "../../foundation/kernel/store"

// What a field's parts render: their public state, their data attributes, and
// the attributes the field puts on its control.

type FieldStore = {
  disabled: boolean
  // The `name` you pass, which a found control without its own submits under.
  name: string | undefined
  // The `invalid` you pass. Undefined leaves it to the browser's validation.
  external: boolean | undefined
  focused: boolean
  // A submit found the field invalid, so the browser's validation shows.
  revealed: boolean
  formDisabled: boolean
  required: boolean
  validity: Validity
  // Parts in the page, by id. The control points at these once the field binds.
  labels: string[]
  descriptions: string[]
  errors: string[]
  bound: boolean
  // The control's id, which labels point at.
  controlId: string | null
  // Whether a <label for> can point at the control. A radio group can't.
  labelable: boolean
  // A plain button, like a FileInputTrigger's, keeps its own text in its name after the label's.
  namedByContent: boolean
}

function fieldState(state: FieldStore, api: FieldApi) {
  const show = api.shown()
  const bad = api.invalid()
  return {
    disabled: api.disabled(),
    required: state.required,
    focused: state.focused,
    invalid: show && bad,
    // Only the browser's own validation says a value is valid.
    valid: state.external === undefined && show && !bad,
  }
}

function dataAttrs(state: FieldStore, api: FieldApi) {
  const { disabled, required, focused, invalid, valid } = fieldState(state, api)
  return {
    "data-disabled": disabled ? "" : undefined,
    "data-required": required ? "" : undefined,
    "data-focused": focused ? "" : undefined,
    "data-invalid": invalid ? "" : undefined,
    "data-valid": valid ? "" : undefined,
  }
}

function errorState(state: FieldStore, api: FieldApi) {
  return { ...fieldState(state, api), message: state.validity.message }
}

// `match` true or false decides on its own. Otherwise an error shows while the
// field shows as invalid, and a validity flag only while the browser's own
// validation reports that problem.
function errorShown(state: FieldStore, api: FieldApi, props: FieldErrorProps) {
  if (typeof props.match === "boolean") {
    return props.match
  }
  if (api.disabled() || !api.shown() || !api.invalid()) {
    return false
  }
  if (typeof props.match === "string") {
    return state.external === undefined && !!state.validity.flags[props.match]
  }
  return true
}

// The parts the control points at. Parts register as they bind, so until the
// field binds, like on a server, the control points at the ids its parts take
// when they have none of their own, wherever they render. The server's HTML
// and the first render then agree, and binding replaces them with the parts
// in the page.
function references(state: FieldStore, api: FieldApi) {
  if (state.bound) {
    return state
  }
  return {
    labels: [`${api.id}-label`],
    descriptions: [`${api.id}-description`],
    errors: errorShown(state, api, {}) ? [`${api.id}-error`] : [],
  }
}

// The control's own description, like a date picker's format hint, comes
// first, then the field's descriptions and errors.
function controlAttrs(
  state: FieldStore,
  api: FieldApi,
  props: { id?: string; describedBy?: string },
  fallback: string
) {
  const { invalid } = fieldState(state, api)
  const { labels, descriptions, errors } = references(state, api)
  const described = [props.describedBy, ...descriptions, ...errors].filter(
    Boolean
  )
  const id = props.id ?? fallback
  // A button's own text says what it does, like "Browse files", so it follows the label.
  const named = state.namedByContent && labels.length ? [...labels, id] : labels
  return {
    id,
    // Also set beside a native <label for>, so labels that aren't one, and
    // controls a <label> can't point at, are named too.
    "aria-labelledby": named.length ? named.join(" ") : undefined,
    "aria-describedby": described.length ? described.join(" ") : undefined,
    "aria-invalid": invalid ? "true" : undefined,
    disabled: state.disabled ? "" : undefined,
    ...dataAttrs(state, api),
  }
}

// Without a control part, like in custom elements or around a plain input, the
// field finds its control in `root` and writes its attributes itself. Returns a cleanup.
function bindFoundControl(
  root: HTMLElement,
  api: FieldApi,
  store: Store<FieldStore>
) {
  let current: HTMLElement | undefined
  // Only attributes the field wrote are its to remove. The rest are the control's own.
  let written = new Map<string, string>()
  // The ids the field last added to the control's description. The others are
  // the control's own, like a date picker's format hint, which its component
  // may write again at any time.
  let added = new Set<string>()
  // The element the field named and the name it gave, which follows the
  // field's own. Another element with that name chose it itself.
  let gave: { el: Element; name: string | undefined } | undefined
  const write = () => {
    const control = current
    // A control moved out, maybe into another field, is no longer this one's to write.
    if (!control || !root.contains(control) || api.internal.hasControlPart()) {
      return
    }
    const state = store.get()
    const describedBy = (control.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter((id) => id && !added.has(id))
      .join(" ")
    // The control keeps its own id, which `adopt` gave it if it had none.
    const { id: _id, ...attrs } = controlAttrs(
      state,
      api,
      { id: control.id, describedBy },
      fieldControlId(api.id)
    )
    const { descriptions, errors } = references(state, api)
    added = new Set([...descriptions, ...errors])
    const next = new Map<string, string>()
    for (const [name, value] of Object.entries(attrs)) {
      if (value === undefined) {
        if (written.has(name)) {
          control.removeAttribute(name)
        }
        continue
      }
      const current = control.getAttribute(name)
      // The author's own label reference names the control over the field's label.
      if (
        name === "aria-labelledby" &&
        current !== null &&
        current !== written.get(name) &&
        !madeLabel(current)
      ) {
        continue
      }
      next.set(name, value)
      if (current !== value) {
        control.setAttribute(name, value)
      }
    }
    written = next
    // The field's name goes to a control that has none, so it submits: the
    // form-associated element around the control when there is one, like a
    // number input around its text input. A control that doesn't submit, like
    // a radio group's container, gets none.
    const name = state.name
    const named = submitterOf(control, root)
    const own = named?.getAttribute("name")
    if (!named || (own != null && (gave?.el !== named || own !== gave.name))) {
      return
    }
    if (name) {
      named.setAttribute("name", name)
    } else if (own != null) {
      named.removeAttribute("name")
    }
    gave = { el: named, name }
  }
  // Labels point at the control's id, or one the field gives it when it has none.
  const adopt = (control: HTMLElement) => {
    if (!control.id) {
      control.id = fieldControlId(api.id)
    }
    api.internal.adopt(control)
  }
  // The control's component rewriting its own description drops the field's, so
  // the field adds them back.
  const described =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver((records) => {
          if (
            current &&
            records.some((record) => record.attributeName === "id")
          ) {
            adopt(current)
          }
          write()
        })
  const find = () => {
    // Vue binds the root before a control part inside it, which then wires
    // itself. Writing here too would name its inner input, which submits twice.
    if (api.internal.hasControlPart()) {
      return
    }
    const next = api.control()
    if (next === current || next === undefined) {
      return
    }
    current = next
    added = new Set()
    adopt(next)
    described?.disconnect()
    described?.observe(next, { attributeFilter: ["aria-describedby", "id"] })
    write()
  }
  queueMicrotask(find)
  const unsubscribe = store.subscribe(() => {
    find()
    write()
  })
  const observer =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(find)
  // A control can take its role after it arrives, like a select trigger's
  // button that its custom element binds a moment later.
  observer?.observe(root, {
    childList: true,
    subtree: true,
    attributeFilter: ["role", "data-slot"],
  })
  return () => {
    unsubscribe()
    observer?.disconnect()
    described?.disconnect()
  }
}

// The element that submits for a control: a form-associated element around
// it inside the field, or the control itself.
function submitterOf(control: HTMLElement, root: HTMLElement) {
  for (
    let node: HTMLElement | null = control;
    node && node !== root;
    node = node.parentElement
  ) {
    if (formInternals(node)) {
      return node
    }
  }
  return control.matches("input, select, textarea") ? control : undefined
}

// The first description takes `${id}-description`, which the control points
// at before binding, or stands for the author's id there. Each one after it
// takes its own.
function descriptionId(
  parts: Iterable<{ slot: string; key: string }>,
  id: string,
  key: string
) {
  const first = [...parts].find((part) => part.slot === "description")?.key
  return !key || first === key
    ? `${id}-description`
    : `${id}-description-${key}`
}

export {
  bindFoundControl,
  descriptionId,
  controlAttrs,
  dataAttrs,
  errorShown,
  errorState,
  fieldState,
  type FieldStore,
}
