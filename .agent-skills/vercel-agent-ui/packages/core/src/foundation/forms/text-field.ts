import { type TextControl, afterReset, watchValue, writeValue } from "./value"
import type { ChangeDetails, ChangeOptions } from "../kernel/details"
import { on } from "../kernel/events"
import type { PrimitiveContext } from "../kernel/primitive-types"

// What every native text field shares: Input, Textarea and the control of a
// composite like PasswordInput. It reports changes with reasons, follows
// writes, resets and controlled values, and marks whether it's filled.

/**
 * Why a text field's value changed.
 * @stable
 */
type InputValueChangeReason =
  "input-change" | "clear-press" | "reset" | "imperative"

/** The options every text field takes. */
type TextFieldOptions = {
  /** The value, for a controlled field. */
  value?: string
  /** The value it starts with. A form reset returns here. */
  defaultValue?: string
  /**
   * Called when the user changes the value: typing (`"input-change"`), a Clear
   * part (`"clear-press"`), a form reset (`"reset"`) or a controller
   * (`"imperative"`). `details.cancel()` keeps the value as it was.
   */
  onValueChange?: (
    value: string,
    details: ChangeDetails<InputValueChangeReason>
  ) => void
}

type TextState = {
  // Changes on every keystroke, and renders nothing. `filled` renders.
  value: string
  filled: boolean
}

// What a Clear part empties: a field of ours, which reports the reason "clear-press".
type ClearTarget = { internal: { clearPress: (event?: Event) => void } }

// The api of a bound text field, so a Clear part in its group reaches it.
const textFields = new WeakMap<TextControl, ClearTarget>()

const initialText = (options: TextFieldOptions) => {
  const value = options.value ?? options.defaultValue ?? ""
  return { value, filled: value !== "" }
}

const syncText = (options: TextFieldOptions) =>
  options.value === undefined
    ? {}
    : { value: options.value, filled: options.value !== "" }

// The value api of a text field whose element fills `slot`. A composite's own
// context fits, since its state and options extend the text field's.
function textFieldApi<Slot extends string>(
  {
    store,
    options,
    element,
  }: Pick<
    PrimitiveContext<TextFieldOptions, TextState, Slot>,
    "store" | "options" | "element"
  >,
  change: (
    key: "value",
    value: string,
    details: { reason: InputValueChangeReason; event?: Event }
  ) => boolean,
  slot: Slot
) {
  const control = () => element(slot) as TextControl | undefined
  const isControlled = () => options().value !== undefined
  // Set while this field writes its own value, so its `input` listener skips it.
  let writing = false

  const read = (value: string) => store.set({ value, filled: value !== "" })

  // A change the user or a controller asked for. The element follows unless
  // it was canceled. A controlled field waits for its new `value`.
  function write(value: string, reason: InputValueChangeReason, event?: Event) {
    if (!change("value", value, { reason, event })) {
      return false
    }
    if (!isControlled()) {
      read(value)
    }
    const el = control()
    if (!el || el.value === value) {
      return true
    }
    writing = true
    writeValue(el, value, { asUser: true })
    writing = false
    return true
  }

  // Typing, or an IME finishing its text. A canceled change puts the text back,
  // with the caret where it was, controlled or not, since not every framework
  // re-renders an unchanged value.
  function typed(el: TextControl, event: Event) {
    if (writing) {
      return
    }
    const previous = store.get().value
    const next = el.value
    if (next === previous) {
      return
    }
    if (change("value", next, { reason: "input-change", event })) {
      if (!isControlled()) {
        read(next)
      }
      return
    }
    // Mid-composition the IME owns the text. It goes back once composition ends.
    if ((event as InputEvent).isComposing) {
      return
    }
    const inserted = next.length - previous.length
    const caret = Math.max(0, (el.selectionStart ?? next.length) - inserted)
    el.value = previous
    el.setSelectionRange?.(caret, caret)
  }

  const api = {
    getValue: () => store.get().value,
    setValue: (
      value: string,
      {
        reason = "imperative",
        event,
      }: ChangeOptions<InputValueChangeReason> = {}
    ) => write(value, reason, event),
    clear: ({
      reason = "imperative",
      event,
    }: ChangeOptions<InputValueChangeReason> = {}) => write("", reason, event),
    focus: () => control()?.focus(),
    internal: {
      clearPress: (event?: Event) => write("", "clear-press", event),
      bind(el: TextControl) {
        textFields.set(el, api)
        // The server markup and a browser restoring the form may disagree with the
        // default. A field with no text, even in its markup, never had the default,
        // which the browser may change on the way in, like a number's letters.
        if (!isControlled()) {
          if (el.value === "" && el.defaultValue === "") {
            writeValue(el, store.get().value)
          }
          read(el.value)
        }
        const cleanups = [
          // Typing goes through `change` below, and resets through the reset listener.
          watchValue(el, (source) => {
            if (source === "write" && !isControlled()) {
              read(el.value)
            }
          }),
          // Bound on the element, so it runs before frameworks hear the event at their root.
          on(el, "input", (event) => typed(el, event)),
          // Browsers differ on whether an `input` follows the end of a composition.
          on(el, "compositionend", (event) => typed(el, event)),
          // A reset puts the default back, unless the change is canceled. The
          // browser restores the element's own default, which React moves with
          // a controlled input's value, so `defaultValue` wins when it's set.
          on(
            el.ownerDocument,
            "reset",
            (event) => {
              if (event.target !== el.form) {
                return
              }
              afterReset(event, () => {
                const target = options().defaultValue ?? el.value
                const show = (value: string) => {
                  if (el.value !== value) {
                    el.value = value
                  }
                }
                if (target === store.get().value) {
                  show(target)
                  return
                }
                if (!change("value", target, { reason: "reset" })) {
                  show(store.get().value)
                } else if (!isControlled()) {
                  show(target)
                  read(target)
                }
              })
            },
            { capture: true }
          ),
        ]
        return () => {
          textFields.delete(el)
          cleanups.forEach((cleanup) => cleanup())
        }
      },
    },
  }
  return api
}

// A press on a field's surroundings, like its group's text and icons, focuses
// the field the way a label would. Presses on anything interactive keep their own behavior.
function focusFromSurroundings(
  event: Event | undefined,
  container: HTMLElement | undefined,
  field: TextControl | undefined
) {
  const target = event?.target
  if (!(target instanceof Element) || !container || !field) {
    return
  }
  const interactive = target.closest(
    "button, a[href], input, textarea, select, label, [tabindex]"
  )
  if (interactive && container.contains(interactive)) {
    return
  }
  field.focus()
}

export {
  focusFromSurroundings,
  initialText,
  type InputValueChangeReason,
  syncText,
  type TextFieldOptions,
  textFields,
  textFieldApi,
  type TextState,
}
