import {
  buttonElement,
  buttonElementAttrs,
  buttonKeydown,
  buttonKeyup,
  buttonRole,
  type ButtonElement,
} from "../../foundation/platform/button"
import { watchFieldsets } from "../../foundation/forms/form"
import { afterReset } from "../../foundation/forms/value"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { on } from "../../foundation/kernel/events"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import {
  focusFromSurroundings,
  initialText,
  syncText,
  textFieldApi,
  type InputValueChangeReason,
  type TextFieldOptions,
  type TextState,
} from "../../foundation/forms/text-field"
import { createChange } from "../../foundation/kernel/input-source"

/**
 * Why a password input's password wants to be shown or hidden.
 * @stable
 */
type PasswordInputVisibleChangeReason =
  "toggle-press" | "form-submit" | "reset" | "page-hide" | "imperative"

/**
 * Reads, writes, shows and hides a password input from anywhere. Pass it as the `controller` option.
 * @stable
 */
function createPasswordInputController() {
  return createController<{
    /** The current value. */
    getValue: () => string
    /**
     * Sets the value as if the user typed it, so `input` fires.
     * Returns false when the change was canceled or nothing changed.
     */
    setValue: (
      value: string,
      options?: ChangeOptions<InputValueChangeReason>
    ) => boolean
    /**
     * Empties the field, as if the user deleted the text, so `input` fires.
     * Returns false when the change was canceled or nothing changed.
     */
    clear: (options?: ChangeOptions<InputValueChangeReason>) => boolean
    /** Whether the password is shown. */
    isVisible: () => boolean
    /** Shows or hides the password. Returns false when canceled. */
    setVisible: (
      visible: boolean,
      options?: ChangeOptions<PasswordInputVisibleChangeReason>
    ) => boolean
    /** Shows the password if it's hidden, and hides it if it's shown. Returns false when canceled. */
    toggleVisible: (
      options?: ChangeOptions<PasswordInputVisibleChangeReason>
    ) => boolean
    /** Moves focus to the field. */
    focus: () => void
  }>()
}

/**
 * A controller from `createPasswordInputController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type PasswordInputController = ReturnType<typeof createPasswordInputController>

/**
 * The options `passwordInput` takes. A component takes them as props on its
 * root.
 * @stable
 */
type PasswordInputOptions = TextFieldOptions & {
  /** Whether the password is shown. Pass it to control it. */
  visible?: boolean
  /**
   * Whether the password is shown at first, when uncontrolled.
   * @defaultValue false
   */
  defaultVisible?: boolean
  /**
   * Runs when the password wants to be shown or hidden: the toggle
   * (`"toggle-press"`), submitting or resetting its form (`"form-submit"`,
   * `"reset"`), the page being hidden (`"page-hide"`) or a controller
   * (`"imperative"`). `details.cancel()` keeps it as it was; the field is a
   * password field while the browser reads a submitted form either way.
   */
  onVisibleChange?: (
    visible: boolean,
    details: ChangeDetails<PasswordInputVisibleChangeReason>
  ) => void
  /**
   * What the browser and password managers fill in: `"current-password"` for
   * signing in, `"new-password"` for signing up or changing it.
   * @defaultValue "current-password"
   */
  autoComplete?: "current-password" | "new-password" | "off" | (string & {})
  /** The name the password submits under. Inside a Field, the Field's name. */
  name?: string
  /** The id of the form the field belongs to, when it isn't inside it. */
  form?: string
  /** Whether a password is required to submit the form. */
  required?: boolean
  /** Disables the field and the toggle. Inside a Field or a disabled `<fieldset>`, they follow it. */
  disabled?: boolean
  /** Makes the field read-only. The toggle still shows and hides it. */
  readOnly?: boolean
  /** Reads, writes, shows and hides it from anywhere. Create one with `createPasswordInputController()`. */
  controller?: PasswordInputController
} & PrimitiveOptions

/** What adapters pass on top: the id the field already has, like in web component markup. */
type PasswordInputInternalOptions = PasswordInputOptions & {
  controlId?: string
}

/**
 * What `render` functions and state-based class names of every Password Input part receive.
 * @stable
 */
type PasswordInputState = {
  /** Whether the password is shown. */
  visible: boolean
  /** Whether Caps Lock is on while the field has focus. */
  capsLock: boolean
  /** Whether the field holds any text. */
  filled: boolean
  /** Whether the field is disabled, by itself, its Field or a `<fieldset>`. */
  disabled: boolean
  /** Whether the field is read-only. */
  readOnly: boolean
  /** Whether a form won't submit while the field is empty. */
  required: boolean
}

type State = TextState & {
  visible: boolean
  capsLock: boolean
  disabled: boolean
  // Disabled from outside the options: a `<fieldset>`, or a Field that writes the field's own attribute.
  formDisabled: boolean
  controlDisabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  autoComplete: string
  controlId: string | null
  toggleElement: ButtonElement
}

const settings = (options: PasswordInputInternalOptions) => ({
  disabled: !!options.disabled,
  readOnly: !!options.readOnly,
  required: !!options.required,
  name: options.name,
  form: options.form,
  autoComplete: options.autoComplete ?? "current-password",
})

const isDisabled = (state: State) =>
  state.disabled || state.formDisabled || state.controlDisabled

function publicState(state: State) {
  return {
    visible: state.visible,
    capsLock: state.capsLock,
    filled: state.filled,
    disabled: isDisabled(state),
    readOnly: state.readOnly,
    required: state.required,
  }
}

function dataAttrs(state: State) {
  return {
    "data-visible": state.visible ? "" : undefined,
    "data-capslock": state.capsLock ? "" : undefined,
    "data-filled": state.filled ? "" : undefined,
    "data-disabled": isDisabled(state) ? "" : undefined,
    "data-readonly": state.readOnly ? "" : undefined,
    "data-required": state.required ? "" : undefined,
  }
}

const controlIdOf = (state: State, id: string) =>
  state.controlId ?? `${id}-control`

const typeOf = (visible: boolean) => (visible ? "text" : "password")

// Switches the field between text and password, keeping the caret and the
// selection of a focused field. Engines keep them through the switch itself,
// whoever writes the type, but Chromium and WebKit move the caret to the start
// after a mouse press that switched it, so they go back once more a frame
// later, unless the user has typed since. Pinned by "showing and hiding the
// password keeps the selection".
function showText(el: HTMLInputElement, visible: boolean) {
  const type = typeOf(visible)
  const focused = el.ownerDocument.activeElement === el
  const {
    selectionStart: start,
    selectionEnd: end,
    selectionDirection: direction,
    value,
  } = el
  if (el.type !== type) {
    el.type = type
  }
  if (!focused || start === null || end === null) {
    return
  }
  const restore = () => {
    if (
      el.ownerDocument.activeElement === el &&
      el.value === value &&
      el.type === type
    ) {
      el.setSelectionRange(start, end, direction ?? undefined)
    }
  }
  restore()
  requestAnimationFrame(restore)
}

// Reports the field's own `disabled` attribute, now and as it changes, like
// when a web component Field writes it. Returns a cleanup.
function watchDisabled(
  el: HTMLInputElement,
  onChange: (disabled: boolean) => void
) {
  onChange(el.disabled)
  const observer = new MutationObserver(() => onChange(el.disabled))
  observer.observe(el, { attributeFilter: ["disabled"] })
  return () => observer.disconnect()
}

const passwordInputPrimitive = /* @__PURE__ */ definePrimitive({
  name: "password-input",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    visible: "boolean",
    defaultVisible: "boolean",
    onVisibleChange: "callback",
    autoComplete: "string",
    name: "string",
    form: "string",
    required: "boolean",
    disabled: "boolean",
    readOnly: "boolean",
    controller: "value",
    // Internal: passed by renderers.
    controlId: "string",
  },
  state: (options: PasswordInputInternalOptions): State => ({
    ...initialText(options),
    visible: options.visible ?? options.defaultVisible ?? false,
    capsLock: false,
    formDisabled: false,
    controlDisabled: false,
    controlId: options.controlId ?? null,
    toggleElement: "unknown",
    ...settings(options),
  }),
  live: ["value"],
  controlled: ["value", "visible"],
  sync: (options) => ({
    ...syncText(options),
    ...(options.visible === undefined ? {} : { visible: options.visible }),
    ...(options.controlId === undefined
      ? {}
      : { controlId: options.controlId }),
    ...settings(options),
  }),
  api: (context) => {
    const { store, element } = context
    const change = createChange(context)
    const text = textFieldApi(context, change, "control")
    const control = () => element("control") as HTMLInputElement | undefined
    // Where the caret was when the field last lost focus, for a toggle press that brings focus back.
    let selection: [number, number, "forward" | "backward" | "none"] | undefined

    function setVisible(
      visible: boolean,
      {
        reason = "imperative",
        event,
      }: ChangeOptions<PasswordInputVisibleChangeReason> = {}
    ) {
      return change("visible", visible, { reason, event })
    }

    // Hides the password before the browser reads the form or keeps the page.
    // The field changes at once, before any framework renders, and follows the
    // state again a task later, in case the change was canceled or is controlled.
    function hide(reason: PasswordInputVisibleChangeReason, event?: Event) {
      const el = control()
      if (!store.get().visible || !el) {
        return
      }
      showText(el, false)
      setVisible(false, { reason, event })
      setTimeout(() => {
        if (el.type !== typeOf(store.get().visible)) {
          showText(el, store.get().visible)
        }
      })
    }

    return {
      ...text,
      isVisible: () => store.get().visible,
      setVisible: (
        visible: boolean,
        { reason, event }: ChangeOptions<PasswordInputVisibleChangeReason> = {}
      ) => setVisible(visible, { reason, event }),
      toggleVisible: ({
        reason,
        event,
      }: ChangeOptions<PasswordInputVisibleChangeReason> = {}) =>
        setVisible(!store.get().visible, { reason, event }),
      internal: {
        ...text.internal,
        control,
        // A press from a pointer brings focus back to the field, with its caret,
        // so typing goes on. Keys and screen readers keep focus on the toggle,
        // which says whether it's pressed.
        togglePress(event: Event | undefined) {
          if (isDisabled(store.get())) {
            return
          }
          setVisible(!store.get().visible, { reason: "toggle-press", event })
          const el = control()
          // A press without an event, like one a test sends through `press`, has no pointer behind it.
          const pointer =
            !!event && event instanceof MouseEvent && event.detail > 0
          if (!pointer || !el || el.ownerDocument.activeElement === el) {
            return
          }
          el.focus({ preventScroll: true })
          if (selection) {
            el.setSelectionRange(...selection)
          }
        },
        // Mouse events carry modifier state too, so a click into the field
        // shows the warning before any key.
        capsLock(event: KeyboardEvent | MouseEvent) {
          store.set({ capsLock: !!event.getModifierState?.("CapsLock") })
        },
        // A field removed or hidden while it has focus blurs after its part let go
        // of it, so this takes the event's target.
        blurred(el: HTMLInputElement | null) {
          store.set({ capsLock: false })
          if (el && el.selectionStart !== null && el.selectionEnd !== null) {
            selection = [
              el.selectionStart,
              el.selectionEnd,
              el.selectionDirection ?? "none",
            ]
          }
        },
        bindControl(el: HTMLInputElement) {
          let shown = store.get().visible
          if (el.type !== typeOf(shown)) {
            showText(el, shown)
          }
          const view = el.ownerDocument.defaultView
          // Browsers keep a text field's value in session history and the
          // back-forward cache, but never a password's.
          const onPageHide = (event: PageTransitionEvent) =>
            hide("page-hide", event)
          view?.addEventListener("pagehide", onPageHide)
          const cleanups = [
            text.internal.bind(el),
            // Only a change of visibility, not every keystroke, which also reaches subscribers.
            store.subscribe(() => {
              if (store.get().visible === shown) {
                return
              }
              shown = store.get().visible
              showText(el, shown)
            }),
            watchFieldsets(el, (formDisabled) => store.set({ formDisabled })),
            watchDisabled(el, (controlDisabled) =>
              store.set({ controlDisabled })
            ),
            // Captured, so the field is a password field before the page's own
            // submit handlers run, and before the browser decides whether to offer to save it.
            on(
              el.ownerDocument,
              "submit",
              (event) => {
                if (event.target === el.form) {
                  hide("form-submit", event)
                }
              },
              { capture: true }
            ),
            on(
              el.ownerDocument,
              "reset",
              (event) => {
                if (event.target === el.form) {
                  afterReset(event, () => hide("reset"))
                }
              },
              { capture: true }
            ),
            () => view?.removeEventListener("pagehide", onPageHide),
          ]
          return () => cleanups.forEach((cleanup) => cleanup())
        },
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, PasswordInputState>({
      state: publicState,
      attrs: dataAttrs,
      // Presses on the root's own text and icons focus the field, like a label would.
      press: ({ api, el }, event) =>
        focusFromSurroundings(event, el, api.internal.control()),
    }),
    control: slot<{}, PasswordInputState>({
      props: { id: "string" },
      state: publicState,
      attrs: (state, { id, props }) => ({
        type: typeOf(state.visible),
        id: props.id ?? controlIdOf(state, id),
        name: state.name,
        form: state.form,
        autocomplete: state.autoComplete,
        // A shown password is plain text: never send it to a spellchecking
        // service, and never let the keyboard correct or capitalize it.
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
        required: state.required ? "" : undefined,
        disabled: state.disabled ? "" : undefined,
        readonly: state.readOnly ? "" : undefined,
        ...dataAttrs(state),
      }),
      on: {
        keydown: (event, { api }) => api.internal.capsLock(event),
        keyup: (event, { api }) => api.internal.capsLock(event),
        mousedown: (event, { api }) => api.internal.capsLock(event),
        focusout: (event, { api }) =>
          api.internal.blurred(event.target as HTMLInputElement | null),
      },
      bind: (el, { api }) => api.internal.bindControl(el as HTMLInputElement),
    }),
    toggle: slot<{}, PasswordInputState>({
      ...buttonRole((state: State) => state.toggleElement),
      focus: "tab-stop",
      state: publicState,
      attrs: (state, { id }) => ({
        // Never "submit": Enter in the field submits the form, it doesn't press the toggle.
        ...buttonElementAttrs(state.toggleElement, {
          type: "button",
          disabled: isDisabled(state),
          focusable: false,
        }),
        "aria-pressed": String(state.visible),
        "aria-controls": controlIdOf(state, id),
        ...dataAttrs(state),
      }),
      on: {
        // Focus stays in the field, so the caret, the selection and the
        // on-screen keyboard stay where they are.
        mousedown: (event) => {
          if (event.button === 0) {
            event.preventDefault()
          }
        },
        keydown: (event, { el }) => buttonKeydown(event, el!),
        keyup: (event, { el }) => buttonKeyup(event, el!),
      },
      press: ({ api }, event) => api.internal.togglePress(event),
      bind: (el, { store }) => {
        store.set({ toggleElement: buttonElement(el) })
      },
    }),
  }),
  agent: {
    actions: ["setValue", "clear", "setVisible", "toggleVisible"],
    secret: true,
  },
})

/**
 * The type of `passwordInput`.
 * @stable
 */
interface PasswordInputPrimitive extends Named<typeof passwordInputPrimitive> {}

/**
 * The password input primitive, with the slots `root`, `control`, `toggle`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const passwordInput: PasswordInputPrimitive = passwordInputPrimitive

export {
  createPasswordInputController,
  passwordInput,
  type PasswordInputController,
  type PasswordInputOptions,
  type PasswordInputPrimitive,
  type PasswordInputState,
  type PasswordInputVisibleChangeReason,
}
export type { InputValueChangeReason } from "../../foundation/forms/text-field"
