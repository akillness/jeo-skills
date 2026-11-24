// OTP Input's state and behavior. One real <input> holds the whole code, so
// the browser's own typing, deleting, undo, paste, autofill, password
// managers and SMS codes on phones all work on it. It sits invisible over the
// slots, which render from the value and the input's selection.
import { isRTL } from "../../foundation/platform/env"
import { isDisabled, watchFieldsets } from "../../foundation/forms/form"
import { afterReset, keepsValueOnReset } from "../../foundation/forms/value"
import {
  fitsPattern,
  focusSelection,
  insertCode,
  isValidCode,
  keySelection,
  pastedCode,
  pressSelection,
  slotSelection,
  type OTPInputPattern,
  type Selection,
} from "./otp-input-model"
import {
  type ChangeDetails,
  type ChangeOptions,
  type CommitDetails,
} from "../../foundation/kernel/details"
import { isComposing, on } from "../../foundation/kernel/events"
import type {
  PrimitiveContext,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import {
  createChange,
  createCommit,
} from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"
import type { OTPInputSlotProps } from "./otp-input"

/**
 * Why the code changed.
 * @stable
 */
type OTPInputValueChangeReason =
  | "input-change"
  | "paste"
  | "undo"
  | "redo"
  | "reset"
  | "restore"
  | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type OTPInputChangeOptions = ChangeOptions<OTPInputValueChangeReason>

/** The options the one-time code model takes, before the `controller` option. */
type OTPInputOptions = {
  /** The code, for a controlled input. */
  value?: string
  /**
   * The code it starts with, when uncontrolled. A form reset returns here.
   * @defaultValue ""
   */
  defaultValue?: string
  /**
   * Runs when the code changes: typing or deleting (`"input-change"`), a
   * paste (`"paste"`), the browser's undo and redo, a form reset, or a
   * controller. Autofill and codes from the keyboard's suggestions are
   * `"input-change"`. `details.cancel()` keeps the code as it was.
   */
  onValueChange?: (
    value: string,
    details: ChangeDetails<OTPInputValueChangeReason>
  ) => void
  /**
   * Runs when a change fills every slot, with the whole code, like to verify
   * it. A controller filling it counts, so does a code that changes while full.
   */
  onValueCommit?: (
    value: string,
    details: CommitDetails<OTPInputValueChangeReason>
  ) => void
  /**
   * How many characters the code has, one slot each.
   * @defaultValue 6
   */
  maxLength?: number
  /**
   * Which characters it accepts: `"digits"`, `"letters"`, `"alphanumeric"`,
   * or a regular expression each character must match, like `/[A-F0-9]/i`.
   * Anything else typed, pasted or dropped is ignored.
   * @defaultValue "digits"
   */
  pattern?: OTPInputPattern
  /**
   * The keyboard touch screens show.
   * @defaultValue "numeric" for digits, "text" otherwise
   */
  inputMode?: "numeric" | "text" | "decimal" | "tel" | "none"
  /**
   * Where the invisible input keeps its text and caret. It decides where the
   * browser puts its own popups, like the paste menu on phones.
   * `"start"` and `"end"` follow the reading direction.
   * @defaultValue "start"
   */
  textAlign?: "start" | "center" | "end"
  /**
   * The input's `autocomplete`. `"one-time-code"` lets phones offer a code
   * from a message, and password managers fill it.
   * @defaultValue "one-time-code"
   */
  autoComplete?: string
  /** Disables it like a native input: it can't be focused, and isn't submitted. */
  disabled?: boolean
  /** Makes it read-only: focusable and submitted, but the code can't change. */
  readOnly?: boolean
  /** Requires a code before the form submits. A partial code is too short either way. */
  required?: boolean
  /** The name it submits the code under. */
  name?: string
  /** The id of a form to belong to, when it isn't inside that form. */
  form?: string
  /** Reads and writes the code from anywhere. Create one with `createOTPInputController()`. */
  controller?: unknown
} & PrimitiveOptions

type State = {
  value: string
  // What a form reset returns to.
  initial: string
  maxLength: number
  pattern: OTPInputPattern
  inputMode: NonNullable<OTPInputOptions["inputMode"]> | undefined
  textAlign: NonNullable<OTPInputOptions["textAlign"]>
  autoComplete: string
  disabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  // A disabled <fieldset> around it.
  formDisabled: boolean
  // The browser flags the code as too short, which it does only for a partial
  // code the user typed. The pattern then leaves the length to `minlength`.
  tooShort: boolean
  focused: boolean
  selection: Selection
  // A password manager put its badge over the input, so the input widens past
  // the last slot and the badge lands beside the slots instead of over them.
  pushBadge: boolean
}

const finiteLength = (maxLength: number | undefined) =>
  maxLength !== undefined && Number.isInteger(maxLength) && maxLength > 0
    ? maxLength
    : 6

function settings(options: OTPInputOptions) {
  return {
    maxLength: finiteLength(options.maxLength),
    pattern: options.pattern ?? ("digits" as const),
    inputMode: options.inputMode,
    textAlign: options.textAlign ?? ("start" as const),
    autoComplete: options.autoComplete ?? "one-time-code",
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
  }
}

// A value from outside, kept to what the code can hold.
function cleanCode(value: string, pattern: OTPInputPattern, maxLength: number) {
  return Array.from(value)
    .filter((char) => fitsPattern(char, pattern))
    .join("")
    .slice(0, maxLength)
}

// Password managers' own elements, which they put over inputs they can fill.
const badges =
  "[data-lastpass-icon-root], com-1password-button, [data-dashlanecreated]"
// How much room a badge takes beside the input.
const badgeSpace = 40

const hiddenSelection = new WeakSet<Document | ShadowRoot>()

// The input's text is transparent, but its selection and autofill colors are
// drawn by the browser over the slots. Only a stylesheet reaches those.
function hideNativeHighlights(root: Node) {
  if (
    !(root instanceof Document || root instanceof ShadowRoot) ||
    hiddenSelection.has(root)
  ) {
    return
  }
  if (typeof CSSStyleSheet === "undefined" || !("adoptedStyleSheets" in root)) {
    return
  }
  hiddenSelection.add(root)
  const input = '[data-slot="otp-input-control"]'
  const transparent =
    "background:transparent!important;color:transparent!important;-webkit-text-fill-color:transparent!important;box-shadow:none!important"
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(
    [
      `${input}::selection{${transparent}}`,
      `${input}:autofill{${transparent}}`,
    ].join("\n")
  )
  // Engines without `:autofill` skip only that rule, not the sheet.
  try {
    sheet.insertRule(`${input}:-webkit-autofill{${transparent}}`)
  } catch {}
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
}

function otpInputApiBody(
  context: PrimitiveContext<
    OTPInputOptions,
    State,
    "root" | "control" | "slot" | "group" | "separator"
  >
) {
  const { store, options, element } = context
  const change = createChange(context)
  const commit = createCommit(context)
  const input = () => element("control") as HTMLInputElement | undefined
  const isControlled = () => options().value !== undefined
  // The paste or multi-character insert being written, so its change reports it.
  let inserting: { reason: OTPInputValueChangeReason; event: Event } | undefined
  // Set while the core writes the element's value, so its listeners skip it.
  let writing = false
  // Set from a controlled change until its owner has had a chance to pass it back.
  let awaitingOwner = false
  // Whether the last edit deleted, until the caret moves some other way.
  let afterDelete = false
  // What pressed last, since only a mouse press is taken over.
  let pointerType = ""

  // A reset or a restored page puts a code back; nobody just entered it.
  function complete(
    value: string,
    reason: OTPInputValueChangeReason,
    event?: Event
  ) {
    if (
      value.length !== store.get().maxLength ||
      reason === "reset" ||
      reason === "restore"
    ) {
      return
    }
    commit("value", value, { reason, event })
  }

  // A change asked for from outside the input: a controller, a reset. The
  // input follows unless it was canceled.
  function write(
    value: string,
    reason: OTPInputValueChangeReason,
    event?: Event
  ) {
    const { pattern, maxLength } = store.get()
    const code = cleanCode(value, pattern, maxLength)
    const previous = store.get().value
    if (!change("value", code, { reason, event })) {
      return false
    }
    if (!isControlled()) {
      store.set({ value: code })
    }
    syncElement()
    // A reset may leave the element's value as it was, so the browser's flag is read either way.
    checkLength()
    if (code !== previous) {
      complete(code, reason, event)
    }
    return true
  }

  // Follows whether the browser flags the code as too short. One read per change.
  function checkLength() {
    const el = input()
    if (el) {
      store.set({ tooShort: el.validity.tooShort })
    }
  }

  // Puts the state's value in the element, and the selection where it belongs.
  function syncElement() {
    const el = input()
    const { value, maxLength } = store.get()
    if (!el || el.value === value || awaitingOwner) {
      return
    }
    writing = true
    el.value = value
    writing = false
    // A value written from code is never flagged as too short.
    store.set({ tooShort: false })
    if (isFocused(el)) {
      select(el, focusSelection(value.length, maxLength))
    }
  }

  function select(
    el: HTMLInputElement,
    selection: Selection,
    direction?: "forward" | "backward"
  ) {
    el.setSelectionRange(selection.start, selection.end, direction)
    store.set({ selection: { start: selection.start, end: selection.end } })
  }

  // Mirrors the input's selection into state, first moving a collapsed caret
  // onto the character under it, so that slot is the one typing replaces.
  // After a deletion the caret stays where the character was, so typing puts
  // one back there and the characters after it keep their slots.
  function syncSelection(el: HTMLInputElement) {
    if (!isFocused(el)) {
      return
    }
    const current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
    const deleted = afterDelete && current.start === current.end
    const next = deleted
      ? null
      : slotSelection(
          current,
          store.get().selection,
          el.value.length,
          store.get().maxLength
        )
    if (next) {
      select(el, next, next.direction)
    } else {
      store.set({ selection: current })
    }
  }

  // The input changed: typing, deleting, undo, a paste or autofill. Anything
  // that isn't a code goes back, and so does a canceled change.
  function typed(el: HTMLInputElement, event: Event) {
    if (writing) {
      return
    }
    afterDelete = !!(event as InputEvent).inputType?.startsWith("delete")
    const { pattern, maxLength, value: previous } = store.get()
    let next = el.value
    if (next !== previous && !isValidCode(next, pattern, maxLength)) {
      // An input method owns its text until it commits; it goes back then.
      if ((event as InputEvent).isComposing) {
        return
      }
      const cleaned = pastedCode(next, pattern)
      next = cleaned && cleaned.length <= maxLength ? cleaned : previous
      restore(el, next)
    }
    if (next !== previous) {
      const { reason, event: cause } = inserting ?? {
        reason: reasonOf(event),
        event,
      }
      if (change("value", next, { reason, event: cause })) {
        if (!isControlled()) {
          store.set({ value: next })
        }
        // A controlled input shows what its owner passes back, once the owner
        // has rendered. Until then it keeps the typed code and its caret,
        // rather than the value the owner held before.
        else {
          awaitingOwner = true
          queueMicrotask(() => {
            awaitingOwner = false
            syncElement()
          })
        }
        complete(next, reason, cause)
      } else {
        restore(el, previous)
      }
    }
    checkLength()
    syncSelection(el)
  }

  // Puts a value back, keeping the caret where the rejected text began.
  function restore(el: HTMLInputElement, value: string) {
    const inserted = el.value.length - value.length
    const caret = Math.max(
      0,
      (el.selectionStart ?? el.value.length) - Math.max(0, inserted)
    )
    writing = true
    el.value = value
    writing = false
    el.setSelectionRange(caret, caret)
  }

  // Replaces the whole value the way typing would, so the browser can undo it.
  // `insertText` is the only way to edit an input that keeps its undo history;
  // where it's missing, the value is set and `input` sent instead.
  function insert(
    el: HTMLInputElement,
    value: string,
    reason: OTPInputValueChangeReason,
    event: Event
  ) {
    inserting = { reason, event }
    try {
      el.setSelectionRange(0, el.value.length)
      const inserted = el.ownerDocument.execCommand?.(
        "insertText",
        false,
        value
      )
      if (!inserted || el.value !== value) {
        el.value = value
        el.dispatchEvent(new Event("input", { bubbles: true }))
      }
    } finally {
      inserting = undefined
    }
  }

  // Several characters at once, from a paste, a drop, autofill or a code the
  // keyboard suggests: spaces and dashes go, and a whole code replaces the value.
  function insertMany(
    el: HTMLInputElement,
    text: string,
    reason: OTPInputValueChangeReason,
    event: Event
  ) {
    const { pattern, maxLength, value } = store.get()
    const code = pastedCode(text, pattern)
    if (!code) {
      return
    }
    const selection = {
      start: el.selectionStart ?? value.length,
      end: el.selectionEnd ?? value.length,
    }
    const next = insertCode(value, selection, code, maxLength)
    if (next !== value) {
      insert(el, next, reason, event)
    }
  }

  const editable = () => !isDisabled(store.get()) && !store.get().readOnly

  // The slot a press landed on. The input covers the slots, so the slot is
  // found under the point.
  function slotAt(el: HTMLInputElement, event: MouseEvent) {
    const hit =
      el.ownerDocument.elementsFromPoint?.(event.clientX, event.clientY) ?? []
    return elements<OTPInputSlotProps>(context, "slot").find((entry) =>
      hit.includes(entry.el)
    )
  }

  // A mouse press selects the slot under it. The browser would put the caret
  // where the squeezed text is, and Safari does so after `click`, so the
  // press is taken over: focus, then the slot. Touch keeps the browser's
  // handling, which phones need for their paste menu, and selects on `click`.
  function pressSlot(el: HTMLInputElement, event: MouseEvent) {
    afterDelete = false
    const slot = slotAt(el, event)
    if (!slot || isDisabled(store.get())) {
      return
    }
    if (event.type === "mousedown") {
      event.preventDefault()
      el.focus()
    }
    select(
      el,
      pressSelection(
        slot.props?.index ?? 0,
        el.value.length,
        store.get().maxLength
      )
    )
  }

  // Password managers add their badge on focus. When one is on the page and
  // there's room, the input widens past the last slot to push it aside.
  function checkBadge(el: HTMLInputElement) {
    const root = element("root")
    if (!root || !el.ownerDocument.querySelector(badges)) {
      return
    }
    const view = el.ownerDocument.defaultView
    const room =
      !view ||
      root.getBoundingClientRect().right + badgeSpace <= view.innerWidth
    store.set({ pushBadge: room })
  }

  function bind(el: HTMLInputElement) {
    const { value, pattern, maxLength } = store.get()
    // The browser restores what was typed when going back to a page.
    const restored =
      !isControlled() &&
      el.value &&
      el.value !== value &&
      isValidCode(el.value, pattern, maxLength)
    if (restored) {
      write(el.value, "restore")
    } else {
      syncElement()
    }
    hideNativeHighlights(el.getRootNode())
    const doc = el.ownerDocument
    const cleanups = [
      store.subscribe(syncElement),
      // Typing that fits is left to the browser, so the undo history stays its
      // own. Anything else, like several characters at once or a full-width
      // digit, goes through `insertMany`, which cleans it up or drops it.
      on(el, "beforeinput", (event) => {
        const type = event.inputType
        if (inserting || !type.startsWith("insert")) {
          return
        }
        if (type === "insertCompositionText" || type === "insertFromPaste") {
          return
        }
        const text =
          event.data ?? event.dataTransfer?.getData("text/plain") ?? ""
        // One fitting character is typing, which the browser does itself.
        if (text.length <= 1 && fitsPattern(text, store.get().pattern)) {
          return
        }
        event.preventDefault()
        insertMany(el, text, "input-change", event)
      }),
      on(el, "paste", (event) => {
        const text = event.clipboardData?.getData("text/plain")
        if (!editable() || !text) {
          return
        }
        event.preventDefault()
        insertMany(el, text, "paste", event)
      }),
      on(el, "input", (event) => typed(el, event)),
      // Browsers differ on whether an `input` follows the end of a composition.
      on(el, "compositionend", (event) => typed(el, event)),
      on(el, "focus", () => {
        store.set({ focused: true })
        select(el, focusSelection(el.value.length, store.get().maxLength))
        requestAnimationFrame(() => checkBadge(el))
      }),
      on(el, "blur", () => store.set({ focused: false })),
      // Arrow keys, Home and End move a slot at a time, here rather than after
      // the browser moves the caret, whose `selectionchange` comes too late for
      // a key typed right after. With a modifier, they extend the selection natively.
      on(el, "keydown", (event) => {
        if (event.key !== "Backspace" && event.key !== "Delete") {
          afterDelete = false
        }
        // An input method owns the keys while it composes, like arrows choosing a candidate.
        if (isComposing(event)) {
          return
        }
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
          return
        }
        const { selection, maxLength } = store.get()
        const next = keySelection(
          event.key,
          selection,
          el.value.length,
          maxLength,
          isRTL(el)
        )
        if (!next) {
          return
        }
        event.preventDefault()
        select(el, next)
      }),
      on(el, "pointerdown", (event) => (pointerType = event.pointerType)),
      on(el, "mousedown", (event) => {
        if (pointerType === "mouse" && event.button === 0) {
          pressSlot(el, event)
        }
      }),
      on(el, "click", (event) => {
        if (pointerType !== "mouse") {
          pressSlot(el, event)
        }
      }),
      on(el, "select", () => syncSelection(el)),
      // Selection changes fire on the input in newer engines, and on the document in all.
      on(el, "selectionchange", () => syncSelection(el)),
      on(doc, "selectionchange", () => syncSelection(el)),
      on(
        doc,
        "reset",
        (event) => {
          if (
            event.target !== el.form ||
            keepsValueOnReset(options().value, options().defaultValue)
          ) {
            return
          }
          afterReset(event, () => write(store.get().initial, "reset"))
        },
        { capture: true }
      ),
      watchFieldsets(el, (disabled) => store.set({ formDisabled: disabled })),
    ]
    if (isFocused(el)) {
      store.set({ focused: true })
    }
    return () => cleanups.forEach((cleanup) => cleanup())
  }

  return {
    /** The code. */
    getValue: () => store.get().value,
    /** Sets the code, as typing it would. Characters that don't fit the pattern are dropped. */
    setValue: (
      value: string,
      { reason = "imperative", event }: OTPInputChangeOptions = {}
    ) => write(value, reason, event),
    /** Empties the code. */
    clear: ({ reason = "imperative", event }: OTPInputChangeOptions = {}) =>
      write("", reason, event),
    /** Moves focus to the input. */
    focus: () => input()?.focus(),
    internal: {
      bind,
    },
  }
}

const otpInputApi: (
  ...args: Parameters<typeof otpInputApiBody>
) => OTPInputApi = otpInputApiBody

/**
 * `otpInput`'s api, which its slots and controller call. Adapters expose it as `api`.
 * @stable
 */
interface OTPInputApi extends ReturnType<typeof otpInputApiBody> {}

function isFocused(el: HTMLElement) {
  const root = el.getRootNode() as Document | ShadowRoot
  return root.activeElement === el
}

// The browser's own history moves are reported as undo and redo.
function reasonOf(event: Event) {
  const type = (event as InputEvent).inputType
  if (type === "historyUndo") {
    return "undo"
  }
  if (type === "historyRedo") {
    return "redo"
  }
  return "input-change"
}

export {
  badgeSpace,
  cleanCode,
  isDisabled,
  type OTPInputApi,
  type OTPInputChangeOptions,
  type OTPInputOptions,
  otpInputApi,
  type OTPInputValueChangeReason,
  settings,
  type State,
}
