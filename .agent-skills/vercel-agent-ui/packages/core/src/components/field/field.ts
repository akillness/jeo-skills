import { afterBind } from "../../foundation/kernel/after-bind"
import {
  claimInvalidFocus,
  componentFlagOf,
  fieldControlId,
  formInternals,
  invalidFocusClaimed,
  isLabelable,
  onValidityChange,
  watchFieldsets,
} from "../../foundation/forms/form"
import { afterReset } from "../../foundation/forms/value"
import { activateControl, findControl } from "../../foundation/forms/control"
import {
  controlsIn,
  isRequired,
  valid,
  validityKeys,
  validityOf,
  type Validity,
  type ValidityKey,
} from "./field-control"
import {
  bindFoundControl,
  controlAttrs,
  dataAttrs,
  descriptionId,
  errorShown,
  errorState,
  fieldState,
  type FieldStore,
} from "./field-attrs"
import { registerById, type FieldSetState } from "./field-set"
import { held } from "../../foundation/kernel/part"
import { on } from "../../foundation/kernel/events"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveContext,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

// Field ties a control to its label, description and errors. It shows the
// browser's own validation once a submit finds the control invalid, or the
// invalid state your code passes. Values, custom rules and submitting stay
// with the control and whatever owns the form.

/**
 * The options `field` takes. A component takes them as props on its root.
 * @stable
 */
type FieldOptions = {
  /** The name the control submits under, when the control doesn't set its own. */
  name?: string
  /** Disables the control, and marks every part. */
  disabled?: boolean
  /**
   * Whether the field shows as invalid, when your code decides, like a form
   * library or an error from the server. `true` shows its errors now, `false`
   * shows none whatever the browser thinks. Leave it out to show the browser's
   * own validation once a submit finds the field invalid.
   */
  invalid?: boolean
} & PrimitiveOptions

/**
 * The props the `error` slot of `field` takes.
 * @stable
 */
type FieldErrorProps = {
  /**
   * When this error shows. `true` shows it always and `false` never. A
   * validity flag, like `"valueMissing"`, shows it only for that problem of
   * the browser's own validation. Without it, any problem shows it.
   */
  match?: boolean | ValidityKey
}

// Reads an error's `match` attribute: present or "true" shows it always,
// "false" never, and a validity flag shows it for that problem.
const matchAttribute = (attribute: string | null) =>
  attribute === null
    ? undefined
    : attribute === "" || attribute === "true"
      ? true
      : attribute === "false"
        ? false
        : attribute

// Adapters pass the control's own `aria-describedby`, which the field keeps ahead of its own.
type FieldControlProps = { describedBy?: string }

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type FieldState = {
  /** Whether the field is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the control is required, read from its `required` or `aria-required`. */
  required: boolean
  /** Whether focus is inside the control. */
  focused: boolean
  /** Whether the field shows as invalid: `invalid` when you pass it, else the browser's validation once shown. */
  invalid: boolean
  /** Whether the browser's validation passes, once shown. Always false while you pass `invalid`. */
  valid: boolean
}
/**
 * What a FieldDescription's `render` and class name functions receive: its
 * Field's state, or only `disabled` when it describes a FieldSet.
 * @stable
 */
type FieldDescriptionState = FieldSetState & Partial<FieldState>

/**
 * The state the `error` slot of `field` hands `render` functions and
 * state-based class names.
 * @stable
 */
type FieldErrorState = FieldState & {
  /** The browser's message for the current problem. Children you pass show instead. */
  message: string
}

// A control inside a nested field belongs to that field.
const ownControl = (root: HTMLElement) => (el: HTMLElement) =>
  el.closest('[data-slot="field"]') === root

function fieldApiBody(
  context: PrimitiveContext<FieldOptions, FieldStore, string>
) {
  const { id, store, element, parts } = context
  let root: HTMLElement | undefined

  // Whether errors show: what you pass, or the browser's once a submit found the field invalid.
  const shown = () => store.get().external ?? store.get().revealed
  const disabled = () => store.get().disabled || store.get().formDisabled
  const invalid = () => store.get().external ?? !store.get().validity.valid

  // Whether an error part in the page shows now, with its current `match`, in
  // place of the browser's message. Only parts something holds count, so an
  // error that just unmounted, or one a discarded render made, never does. A
  // custom element lets go a microtask after it leaves, in case it moved, so
  // a bound error must also still be in the page.
  const errorInPage = () => {
    const state = store.get()
    for (const part of parts()) {
      if (
        part.slot !== "error" ||
        !held(part) ||
        part.el?.isConnected === false
      ) {
        continue
      }
      if (errorShown(state, api, part.props as FieldErrorProps)) {
        return true
      }
    }
    return false
  }

  // The first error that shows takes `${id}-error`, which the control points
  // at before binding; parts are made in render order, so server and
  // hydration agree. An error in the page keeps it until it leaves.
  let holder: string | undefined
  const errorId = (state: FieldStore, key: string) => {
    const first =
      holder ??
      [...parts()].find(
        (part) =>
          part.slot === "error" &&
          (part.props as { id?: string }).id === undefined &&
          errorShown(state, api, part.props as FieldErrorProps)
      )?.key
    return !key || first === key ? `${id}-error` : `${id}-error-${key}`
  }

  // The controls the field last read, so one leaving the page reads them again.
  let wired: HTMLElement[] = []

  // Errors in the first render, or revealed by a submit, aren't announced:
  // the page loading or focus moving to the invalid control reads them.
  let quiet = true
  let quietTimer: ReturnType<typeof setTimeout> | undefined
  function hush() {
    quiet = true
    clearTimeout(quietTimer)
    quietTimer = setTimeout(() => (quiet = false))
  }

  function readValidity(controls: HTMLElement[]) {
    wired = controls
    let next = valid
    for (const el of controls) {
      const { willValidate, validity, message } = validityOf(el)
      if (!willValidate || validity.valid) {
        continue
      }
      const flags: Validity["flags"] = {}
      for (const key of validityKeys) {
        if (validity[key]) {
          flags[key] = true
        }
      }
      const flag = componentFlagOf(el)
      if (flag && flags.customError) {
        delete flags.customError
        flags[flag as ValidityKey] = true
      }
      next = { valid: false, flags, message }
      break
    }
    const required = controls.some(isRequired)
    if (required !== store.get().required) {
      store.set({ required })
    }
    const current = store.get().validity
    if (
      current.valid !== next.valid ||
      current.message !== next.message ||
      validityKeys.some((key) => !!current.flags[key] !== !!next.flags[key])
    ) {
      store.set({ validity: next })
    }
  }

  const api = {
    id,
    shown,
    disabled,
    invalid,
    // The element labels and messages are wired to.
    control: () =>
      element("control") ??
      (root ? findControl(root, ownControl(root)) : undefined),
    activate(event?: Event) {
      const control = api.control()
      if (control && !disabled()) {
        activateControl(control, event)
      }
    },
    internal: {
      errorId,
      descriptionId: (key: string) => descriptionId(parts(), id, key),
      bindRoot(el: HTMLElement) {
        root = el
        return bindRoot(el)
      },
      // A microtask after binding, since Vue binds mid-hydration. Each takes out
      // only its own entry, so two parts sharing an id don't drop each other.
      register(list: "labels" | "descriptions" | "errors", partId: string) {
        let active = true
        let added = false
        afterBind(() => {
          if (active) {
            added = true
            store.set({ [list]: [...store.get()[list], partId] })
          }
        })
        return () => {
          active = false
          afterBind(() => {
            const items = store.get()[list]
            const index = items.indexOf(partId)
            if (added && index !== -1) {
              store.set({ [list]: items.filter((_, at) => at !== index) })
            }
          })
        }
      },
      holdError(el: HTMLElement, key: string) {
        if (el.id !== `${id}-error`) {
          return () => {}
        }
        holder = key
        // A hidden error, like one in React's `<Activity>`, keeps its element
        // and its id, so it lets go only once that element leaves the page.
        return () =>
          queueMicrotask(() => {
            if (holder === key && !el.isConnected) {
              holder = undefined
            }
          })
      },
      // The browser's message for the current problem, which an empty error shows.
      message: () => store.get().validity.message,
      // Controls rendered by a framework bind before their field's root.
      hasControlPart: () => !!element("control"),
      // Screen readers don't read an error that appears or changes while the
      // person stays where they are, so its text goes to the shared announcer.
      announce(el: HTMLElement) {
        if (typeof MutationObserver === "undefined") {
          return () => {}
        }
        const textOf = () => el.textContent?.replace(/\s+/g, " ").trim() ?? ""
        let silent = quiet
        let said = ""
        const say = () => {
          const text = textOf()
          if (!text || text === said) {
            return
          }
          said = text
          if (silent) {
            return
          }
          import("../../foundation/platform/announce").then(
            ({ announce }) =>
              el.isConnected && announce(text, { doc: el.ownerDocument }),
            () => {}
          )
        }
        // A framework may fill the text after the part binds.
        const timer = setTimeout(() => {
          if (silent) {
            said = textOf()
          }
          silent = false
          say()
        })
        const observer = new MutationObserver(say)
        observer.observe(el, {
          childList: true,
          characterData: true,
          subtree: true,
        })
        return () => {
          clearTimeout(timer)
          observer.disconnect()
        }
      },
      adopt(el: HTMLElement) {
        // A plain button, like a FileInputTrigger's, is named by the label and its
        // own text through aria-labelledby. Some name computations stop at a
        // <label for> and drop the button's text, so the label activates it itself.
        const namedByContent =
          el instanceof HTMLButtonElement && !el.hasAttribute("role")
        afterBind(() =>
          store.set({
            controlId: el.id || null,
            labelable: isLabelable(el) && !namedByContent,
            namedByContent,
          })
        )
      },
    },
  }

  let queued = false
  const check = () => {
    if (queued) {
      return
    }
    queued = true
    queueMicrotask(() => {
      queued = false
      if (root) {
        readValidity(controlsIn(root))
      }
    })
  }

  function bindRoot(el: HTMLElement) {
    check()
    hush()
    // The control points at the parts that registered from now on, a
    // microtask later like their registering.
    afterBind(() => store.set({ bound: true }))
    const form = () => {
      const control = controlsIn(el)[0]
      return (formInternals(control)?.form ??
        (control as HTMLInputElement | undefined)?.form ??
        el.closest("form")) as HTMLFormElement | null
    }
    const cleanups = [
      watchFieldsets(el, (formDisabled) => store.set({ formDisabled })),
      on(el, "focusin", () => store.set({ focused: true })),
      on(el, "focusout", (event) => {
        if (
          event.relatedTarget instanceof Node &&
          el.contains(event.relatedTarget)
        ) {
          return
        }
        store.set({ focused: false })
      }),
    ]

    // React applies a controlled input's onChange in a microtask it queues from
    // its root listener. Rendering the field before that would put the input
    // back and lose the keystroke, so the field listens on the document, after
    // React's root, and reads validity a microtask after React updates.
    const onChange = (event: Event) => {
      if (event.target instanceof Node && el.contains(event.target)) {
        check()
      }
    }
    for (const type of ["input", "change"]) {
      el.ownerDocument.addEventListener(type, onChange)
      cleanups.push(() => el.ownerDocument.removeEventListener(type, onChange))
    }

    // A submit, or reportValidity(), found the field invalid. It doesn't bubble.
    const onInvalid = (event: Event) => {
      const target = event.target as HTMLElement
      hush()
      store.set({ revealed: true })
      readValidity(controlsIn(el))
      // An error shown in the page replaces the browser's own message, and the
      // first invalid field of the submission takes focus. Without one, the
      // browser keeps its message, and a later field doesn't take focus from the first.
      if (!errorInPage()) {
        if (invalidFocusClaimed(target, form())) {
          event.preventDefault()
        }
        return
      }
      event.preventDefault()
      claimInvalidFocus(target, form())
    }
    el.addEventListener("invalid", onInvalid, true)
    cleanups.push(() => el.removeEventListener("invalid", onInvalid, true))

    // A form reset hides the browser's validation again.
    const onReset = (event: Event) => {
      if (event.target !== form()) {
        return
      }
      afterReset(event, () => {
        store.set({ revealed: false })
        readValidity(controlsIn(el))
      })
    }
    el.ownerDocument.addEventListener("reset", onReset, true)
    cleanups.push(() =>
      el.ownerDocument.removeEventListener("reset", onReset, true)
    )

    // Passing `invalid`, or no longer passing it, starts the browser's validation over.
    let external = store.get().external
    cleanups.push(
      store.subscribe(() => {
        const next = store.get().external
        if ((next === undefined) === (external === undefined)) {
          external = next
          return
        }
        external = next
        store.set({ revealed: false })
        check()
      })
    )

    // A component's own check, like a date picker's text that isn't a date,
    // changes its control's validity without an event.
    cleanups.push(
      onValidityChange((control) => {
        if (el.contains(control)) {
          check()
        }
      })
    )

    // Controls that become required, disabled or enabled, or change their
    // pattern like an OTP input does, change validity without an event. So
    // does a control that leaves, which frameworks may remove before its
    // component cleans up.
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver((records) => {
        const left = wired.some((control) => !el.contains(control))
        if (left || records.some((record) => record.type === "attributes")) {
          check()
        }
      })
      observer.observe(el, {
        subtree: true,
        childList: true,
        attributeFilter: ["required", "aria-required", "disabled", "pattern"],
      })
      cleanups.push(() => observer.disconnect())
    }

    return () => {
      clearTimeout(quietTimer)
      cleanups.forEach((cleanup) => cleanup())
    }
  }

  return api
}

const fieldApi: (...args: Parameters<typeof fieldApiBody>) => FieldApi =
  fieldApiBody

/**
 * `field`'s api, which its slots call. Adapters expose it as `api`.
 * @stable
 */
interface FieldApi extends ReturnType<typeof fieldApiBody> {}

const fieldPrimitive = /* @__PURE__ */ definePrimitive({
  name: "field",
  options: {
    name: "string",
    disabled: "boolean",
    invalid: "boolean",
  },
  state: (options: FieldOptions): FieldStore => ({
    disabled: !!options.disabled,
    name: options.name,
    external: options.invalid,
    focused: false,
    revealed: false,
    formDisabled: false,
    validity: valid,
    labels: [],
    descriptions: [],
    errors: [],
    bound: false,
    controlId: null,
    labelable: true,
    namedByContent: false,
    required: false,
  }),
  sync: (options) => ({
    disabled: !!options.disabled,
    name: options.name,
    external: options.invalid,
  }),
  api: (context) => fieldApi(context),
  slots: (slot) => ({
    root: slot<{}, FieldState>({
      state: (state, { api }) => fieldState(state, api),
      attrs: (state, { api }) => dataAttrs(state, api),
      bind: (el, { api, store }) => {
        const cleanups = [api.internal.bindRoot(el)]
        // Without a control part, like custom elements or a plain input, the
        // field finds its control and writes its attributes itself.
        if (!api.internal.hasControlPart()) {
          cleanups.push(bindFoundControl(el, api, store))
        }
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),

    label: slot<{}, FieldState>({
      props: { id: "string" },
      state: (state, { api }) => fieldState(state, api),
      attrs: (state, { id, props, api }) => ({
        id: props.id ?? `${id}-label`,
        for: state.labelable
          ? (state.controlId ?? fieldControlId(id))
          : undefined,
        ...dataAttrs(state, api),
      }),
      // A label that isn't a native one for the control activates it all the same.
      press({ api, el }, event) {
        if (el instanceof HTMLLabelElement && el.control) {
          return
        }
        api.activate(event)
      },
      bind: (el, { api }) =>
        registerById(el, (id) => api.internal.register("labels", id)),
    }),

    description: slot<{ value?: string }, FieldState>({
      // Renderers key each description by a made value, like errors.
      props: { id: "string", value: { kind: "string", from: "field" } },
      state: (state, { api }) => fieldState(state, api),
      attrs: (state, { key, props, api }) => ({
        id: props.id ?? api.internal.descriptionId(key),
        ...dataAttrs(state, api),
      }),
      bind: (el, { api }) =>
        registerById(el, (id) => api.internal.register("descriptions", id)),
    }),

    error: slot<FieldErrorProps & { value?: string }, FieldErrorState>({
      props: {
        id: "id",
        match: matchAttribute,
        // Internal: renderers key each error by a made value, so an invalid
        // submit reads every error's own `match`. Field has no `field` slot,
        // so no element attribute either.
        value: { kind: "string", from: "field" },
      },
      present: (state, { props, api }) => errorShown(state, api, props),
      state: (state, { api }) => errorState(state, api),
      attrs: (state, { id, key, props, api }) => ({
        id: props.id ?? api.internal.errorId(state, key),
        ...dataAttrs(state, api),
      }),
      bind: (el, { api, key }) => {
        const unregister = registerById(el, (id) =>
          api.internal.register("errors", id)
        )
        const unhold = api.internal.holdError(el, key)
        const unannounce = api.internal.announce(el)
        return () => {
          unregister()
          unhold()
          unannounce()
        }
      },
    }),

    // The control, when a framework renders it: a control of this package, or
    // a native input through the field's own control part.
    control: slot<FieldControlProps, FieldState>({
      props: { id: "string", describedBy: "string" },
      state: (state, { api }) => fieldState(state, api),
      attrs: (state, { id, props, api }) =>
        controlAttrs(state, api, props, fieldControlId(id)),
      bind: (el, { api }) => {
        api.internal.adopt(el)
        return () => {}
      },
    }),
  }),
  agent: { shown: (state) => !!state.errors.length },
})

/**
 * The type of `field`.
 * @stable
 */
interface FieldPrimitive extends Named<typeof fieldPrimitive> {}

/**
 * The field primitive, with the slots `root`, `label`, `description`, `error`,
 * `control`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const field: FieldPrimitive = fieldPrimitive

export {
  field,
  type FieldApi,
  type FieldDescriptionState,
  type FieldErrorProps,
  type FieldErrorState,
  type FieldOptions,
  type FieldPrimitive,
  type FieldState,
}
export {
  fieldGroup,
  type FieldGroupPrimitive,
  fieldSet,
  type FieldSetOptions,
  type FieldSetPrimitive,
  type FieldSetState,
} from "./field-set"
export type { ValidityKey } from "./field-control"
