// A number input's state and what it does: typing, keys, buttons, the wheel,
// scrubs and commits. The parts and their attributes are in number-input.ts.
import {
  createDragSession,
  isDrag,
  type PointerSample,
} from "../../foundation/drag-and-drop/pointer"
import { bindRepeatPresses } from "../../foundation/direct-manipulation/repeat"
import { isBrowser, isIOS } from "../../foundation/platform/env"
import {
  dispatchChange,
  formInternals,
  isDisabled,
} from "../../foundation/forms/form"
import {
  displayOptions,
  formatNumber,
  numberFormatter,
} from "../../foundation/number/format"
import { stepFromKey } from "../../foundation/number/keys"
import {
  clamp,
  decimalsOf,
  maxOnGrid,
  roundTo,
  snapToStep,
  stepValue,
} from "../../foundation/number/steps"
import { localeOf } from "../../foundation/text/locale"
import { isPartialNumber, parseNumber } from "../../foundation/number/parse"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { sameValue } from "../../foundation/kernel/store"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import type {
  NumberInputChangeOptions,
  NumberInputOptions,
  NumberInputScrubAreaProps,
  NumberInputValueChangeReason,
} from "./number-input"
import {
  createChange,
  createCommit,
} from "../../foundation/kernel/input-source"
import { keepsValueOnReset } from "../../foundation/forms/value"

type State = {
  value: number | null
  initial: number | null
  // What the input shows. Typing changes it before the value.
  text: string
  min: number
  max: number
  step: number
  largeStep: number
  smallStep: number
  format: Intl.NumberFormatOptions | undefined
  locale: string | undefined
  // The page's language, read once the root binds.
  pageLocale: string | null
  wheel: boolean
  disabled: boolean
  formDisabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  controlId: string | null
  scrubbing: boolean
  // The device's keyboard, known once bound. The server renders "other".
  platform: "ios" | "android" | "other"
  // Where the scrub cursor is drawn, while the pointer is locked.
  cursor: { x: number; y: number } | null
}

function settings(options: NumberInputOptions) {
  // A percent's value is a fraction, so a step of 1 would snap 25% to 0%,
  // and each fraction digit it shows is two more places in the value.
  const { style, maximumFractionDigits, minimumFractionDigits } =
    options.format ?? {}
  const fallback =
    style === "percent"
      ? 10 ** -(2 + (maximumFractionDigits ?? minimumFractionDigits ?? 0))
      : 1
  const step = options.step && options.step > 0 ? options.step : fallback
  return {
    min: options.min ?? -Infinity,
    max: options.max ?? Infinity,
    step,
    largeStep:
      options.largeStep && options.largeStep > 0
        ? options.largeStep
        : step * 10,
    smallStep:
      options.smallStep && options.smallStep > 0
        ? options.smallStep
        : roundTo(step / 10, decimalsOf(step) + 1),
    format: options.format,
    locale: options.locale,
    wheel: !!options.wheel,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
  }
}

const rangeOf = (state: { min: number; max: number; step: number }) => ({
  min: state.min,
  max: state.max,
  step: state.step,
})

// The text is read with the options it shows with, whose decimals can change
// the plural of a unit or currency name, like "1,5 японской иены".
const readFormat = (state: Pick<State, "format" | "step">) =>
  displayOptions(state.format, state.step)

const display = (
  value: number | null,
  state: Pick<State, "locale" | "pageLocale" | "format" | "step">
) => formatNumber(value, localeOf(state), readFormat(state))

const isLocked = (state: State) => isDisabled(state) || state.readOnly

// The keyboard a phone shows. iPhones have no minus key on their number pads,
// so a field that takes negatives gets the text keyboard there. Android's
// numeric pad has both the minus and the decimal keys.
function inputMode(state: State) {
  const negative = state.min < 0
  const decimal =
    decimalsOf(state.step) > 0 ||
    (state.format !== undefined &&
      (numberFormatter(localeOf(state), state.format).resolvedOptions()
        .maximumFractionDigits ?? 0) > 0)
  if (state.platform === "ios" && negative) {
    return "text"
  }
  if (state.platform === "android" && negative) {
    return "numeric"
  }
  return decimal ? "decimal" : "numeric"
}

function canStep(state: State, direction: number, step = state.step) {
  return !isLocked(state) && !atBound(state, direction, step)
}

// Whether the value is at the bound a step in this direction moves toward.
function atBound(state: State, direction: number, step = state.step) {
  if (state.value === null) {
    return false
  }
  return direction > 0
    ? state.value >= maxOnGrid({ ...rangeOf(state), step })
    : state.value <= state.min
}

// Which step a gesture moves by: Shift picks the large one, and Alt the small one.
type StepSize = "step" | "large" | "small"

function stepSize(event: { shiftKey: boolean; altKey: boolean }) {
  return event.shiftKey ? "large" : event.altKey ? "small" : "step"
}

type Pending = { reason: NumberInputValueChangeReason; event?: Event }

function isAndroid() {
  return isBrowser && /Android/i.test(navigator.userAgent)
}

function numberInputApiBody(
  context: PrimitiveContext<NumberInputOptions, State, string>
) {
  const { store, element, options } = context
  const drags = createDragSession(context.onDestroy)
  const change = createChange(context)
  const commitValue = createCommit(context)
  // The value when the current interaction began, so a commit only reports a
  // real change. A controlled value or a controller can move it in between.
  let startValue = store.get().value
  // What changed the value since, reported at the next commit.
  let pending: Pending | undefined
  let wheelTimer: ReturnType<typeof setTimeout> | undefined
  // Whether the text was typed since the last commit. Untouched text keeps the
  // exact value, even when it shows fewer decimals.
  let edited = false

  const input = () => element("control") as HTMLInputElement | undefined
  const formElement = () => {
    const root = element("root")
    return formInternals(root) ? root : element("hidden-input")
  }

  // The value typed so far, or the value when nothing is typed.
  const current = () => {
    const state = store.get()
    if (state.text.trim() === "") {
      return null
    }
    return (
      parseNumber(state.text, localeOf(state), readFormat(state)) ?? state.value
    )
  }

  // The text shows the value, formatted.
  const showValue = () =>
    store.set({ text: display(store.get().value, store.get()) })

  function setValue(
    value: number | null,
    reason: NumberInputValueChangeReason,
    event?: Event
  ) {
    const before = store.get().value
    const done = change("value", value, { reason, event })
    if (done) {
      if (!pending) {
        startValue = before
      }
      pending = { reason, event }
      // `change` waits for the commit, like a native input's.
      dispatchChange(formElement(), ["input"])
    }
    return done
  }

  // Reports the value once an interaction ends, with the event that ended it
  // when it's the same kind as the one behind the change, so `details.event`
  // stays the type its reason lists, like a keyup for a key's step.
  function commit(end?: Event, value = store.get().value) {
    clearTimeout(wheelTimer)
    const last = pending
    pending = undefined
    if (sameValue(startValue, value) || !last) {
      return
    }
    const event =
      end && end.constructor === last.event?.constructor ? end : last.event
    commitValue("value", value, { reason: last.reason, event })
    dispatchChange(formElement(), ["change"])
  }

  // Steps from what's typed, or from 0 when empty, kept within the bounds.
  // `steps` is signed, like -2 for two steps down. A small step snaps to its
  // own grid, so a fine change isn't rounded away by `step`.
  function stepBy(
    steps: number,
    size: StepSize,
    reason: NumberInputValueChangeReason,
    event?: Event
  ) {
    const state = store.get()
    if (
      !canStep(state, steps, size === "small" ? state.smallStep : state.step)
    ) {
      return false
    }
    const range = rangeOf(state)
    const from = current()
    const next =
      from === null
        ? stepValue(0, steps, range)
        : size === "large"
          ? snapToStep(
              clamp(from + steps * state.largeStep, state.min, state.max),
              range
            )
          : size === "small"
            ? stepValue(from, steps, { ...range, step: state.smallStep })
            : stepValue(from, steps, range)
    const done = setValue(next, reason, event)
    // The text follows a step, even one that lands on the same value.
    edited = false
    showValue()
    return done
  }

  // A step from code isn't an interaction, so like `setValue` it commits
  // nothing, and leaves an interaction in progress to commit as it would.
  function stepFromCode(
    steps: number,
    size: StepSize,
    reason: NumberInputValueChangeReason,
    event?: Event
  ) {
    const interaction = pending
    const done = stepBy(steps, size, reason, event)
    pending = interaction
    return done
  }

  const api = {
    getValue: () => store.get().value,
    setValue(
      value: number | null,
      { reason = "imperative", event }: NumberInputChangeOptions = {}
    ) {
      const state = store.get()
      const next =
        value === null
          ? null
          : snapToStep(clamp(value, state.min, state.max), rangeOf(state))
      return change("value", next, { reason, event })
    },
    increment: ({
      reason = "imperative",
      event,
      large = false,
    }: NumberInputChangeOptions & { large?: boolean } = {}) =>
      stepFromCode(1, large ? "large" : "step", reason, event),
    decrement: ({
      reason = "imperative",
      event,
      large = false,
    }: NumberInputChangeOptions & { large?: boolean } = {}) =>
      stepFromCode(-1, large ? "large" : "step", reason, event),
    focus: () => input()?.focus(),
    internal: {
      // Refuses an edit that couldn't become a number, like a letter. Deleting is always allowed.
      beforeinput(event: InputEvent, el: HTMLInputElement) {
        if (
          event.isComposing ||
          !event.inputType.startsWith("insert") ||
          event.data === null
        ) {
          return
        }
        const state = store.get()
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? start
        const next = el.value.slice(0, start) + event.data + el.value.slice(end)
        if (
          !isPartialNumber(next, localeOf(state), readFormat(state), {
            allowNegative: state.min < 0,
          })
        ) {
          event.preventDefault()
        }
      },
      // The value follows the text while it's a number within the bounds.
      // Committing clamps and snaps it.
      type(text: string, event?: Event) {
        const state = store.get()
        edited = true
        store.set({ text })
        if (text.trim() === "") {
          return setValue(null, "input-change", event)
        }
        const parsed = parseNumber(text, localeOf(state), readFormat(state))
        if (parsed !== null && parsed >= state.min && parsed <= state.max) {
          setValue(parsed, "input-change", event)
        }
      },
      // Enter or leaving the field: parse, clamp, snap and format what's typed.
      // Text that isn't a number goes back to the last value.
      commitText(event?: FocusEvent | KeyboardEvent) {
        const state = store.get()
        if (isLocked(state)) {
          return
        }
        if (!edited) {
          store.set({ text: display(state.value, state) })
          return commit(event)
        }
        edited = false
        // A controlled value arrives after this event, so its commit reports
        // the value just asked for.
        let asked = state.value
        const isEmpty = state.text.trim() === ""
        const parsed = isEmpty
          ? null
          : parseNumber(state.text, localeOf(state), readFormat(state))
        const next =
          parsed !== null
            ? snapToStep(clamp(parsed, state.min, state.max), rangeOf(state))
            : isEmpty
              ? null
              : asked
        // Asking for the value it has would stand over a change in progress,
        // like a step whose `onValueChange` moved focus away.
        if (!sameValue(next, asked) && setValue(next, "input-commit", event)) {
          asked = next
        }
        showValue()
        commit(event, options().value === undefined ? undefined : asked)
      },
      keydown(event: KeyboardEvent) {
        const state = store.get()
        if (event.key === "Enter") {
          return api.internal.commitText(event)
        }
        if (event.ctrlKey || event.metaKey) {
          return
        }
        // Left and Right move the caret, and Alt leaves Page Up, Page Down, Home and End to it too.
        const move = stepFromKey(event, { arrows: "vertical" })
        if (!move || (event.altKey && !event.key.startsWith("Arrow"))) {
          return
        }
        if (!("bound" in move)) {
          event.preventDefault()
          return stepBy(move.direction, move.size, "step-key", event)
        }
        // Home and End go to a bound only when there is one. Otherwise they move the caret.
        const bound =
          move.bound === "min" ? state.min : maxOnGrid(rangeOf(state))
        if (!Number.isFinite(bound) || isLocked(state)) {
          return
        }
        event.preventDefault()
        setValue(bound, "step-key", event)
        showValue()
      },
      keyup: (event: KeyboardEvent) => {
        if (pending?.reason === "step-key") {
          commit(event)
        }
      },
      wheel(event: WheelEvent, el: HTMLInputElement) {
        const state = store.get()
        // Only a focused field takes the wheel, so the page still scrolls past it.
        // Pinch zoom and sideways scrolls are left alone.
        if (
          !state.wheel ||
          el.ownerDocument.activeElement !== el ||
          event.ctrlKey
        ) {
          return
        }
        if (
          Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
          event.deltaY === 0
        ) {
          return
        }
        event.preventDefault()
        stepBy(event.deltaY < 0 ? 1 : -1, stepSize(event), "wheel", event)
        // A wheel has no release, so a pause commits.
        clearTimeout(wheelTimer)
        wheelTimer = setTimeout(() => commit(event), 300)
      },
      bindButton(el: HTMLElement, direction: number, disabled: () => boolean) {
        const reason = direction > 0 ? "increment-press" : "decrement-press"
        return bindRepeatPresses(el, {
          keys: [],
          disabled: () => disabled() || el.hasAttribute("disabled"),
          onPress: (press) => {
            const event = press.event as PointerEvent
            if (!drags.accepts(event) || !canStep(store.get(), direction)) {
              return false
            }
            // Keeps focus where it is, so a phone's keyboard stays as it was.
            event.preventDefault()
            if (press.input === "mouse") {
              input()?.focus({ preventScroll: true })
            }
          },
          onStep: ({ event }) =>
            stepBy(
              direction,
              event.shiftKey ? "large" : "step",
              reason,
              event
            ) && canStep(store.get(), direction),
          onEnd: ({ event }) => commit(event),
        })
      },
      // Keyboard and screen reader presses, which carry no pointer.
      clickButton(event: MouseEvent, direction: number) {
        if (event.detail !== 0) {
          return
        }
        stepBy(
          direction,
          event.shiftKey ? "large" : "step",
          direction > 0 ? "increment-press" : "decrement-press",
          event
        )
        commit(event)
      },
      scrub(
        event: PointerEvent,
        el: HTMLElement,
        props: Omit<NumberInputScrubAreaProps, "controller">
      ) {
        if (!drags.accepts(event) || isLocked(store.get())) {
          return
        }
        // No focus moves and no text is selected while dragging. Focus waits
        // for a press that turns out to be a click.
        event.preventDefault()
        const doc = el.ownerDocument
        const size =
          props.pixelsPerStep && props.pixelsPerStep > 0
            ? props.pixelsPerStep
            : 2
        const vertical = props.orientation === "vertical"
        // Distance adds up across moves, so slow drags step as far as fast ones.
        let distance = 0
        let dragged = false
        const view = doc.defaultView ?? window
        const cursor = { x: event.clientX, y: event.clientY }
        const blockSelection = (select: Event) => select.preventDefault()
        doc.addEventListener("selectstart", blockSelection)
        store.set({ scrubbing: true })
        drags.start(el, event, {
          lock: true,
          onMove: (sample: PointerSample) => {
            dragged ||=
              isDrag(sample.x - event.clientX, sample.y - event.clientY) ||
              sample.locked
            if (sample.locked) {
              // The real cursor is hidden and still, so draw one that wraps at the edges.
              cursor.x = wrap(cursor.x + sample.movementX, view.innerWidth)
              cursor.y = wrap(cursor.y + sample.movementY, view.innerHeight)
              store.set({ cursor: { ...cursor } })
            } else {
              cursor.x = sample.x
              cursor.y = sample.y
            }
            distance += vertical ? -sample.movementY : sample.movementX
            // Every step this frame's distance covers, as one change.
            const steps = Math.trunc(distance / size)
            if (steps === 0) {
              return
            }
            distance -= steps * size
            stepBy(steps, stepSize(sample.event), "scrub", sample.event)
          },
          onEnd: (end, canceled) => {
            doc.removeEventListener("selectstart", blockSelection)
            store.set({ scrubbing: false, cursor: null })
            commit(end)
            // A click focuses the input with its text selected, ready to type.
            if (!dragged && !canceled) {
              api.internal.focusAndSelect()
            }
          },
        })
      },
      focusAndSelect() {
        const el = input()
        if (!el) {
          return
        }
        el.focus({ preventScroll: true })
        el.select()
      },
      reset() {
        if (keepsValueOnReset(options().value, options().defaultValue)) {
          return
        }
        edited = false
        pending = undefined
        change("value", store.get().initial, { reason: "reset" })
        showValue()
      },
      restore(saved: string) {
        const value = saved === "" ? null : Number(saved)
        if (value === null || Number.isFinite(value)) {
          api.setValue(value, { reason: "restore" })
        }
      },
      setFormDisabled(formDisabled: boolean) {
        store.set({ formDisabled })
      },
      // Read from the browser once bound, since the server renders "other".
      readPlatform() {
        store.set({
          platform: isIOS() ? "ios" : isAndroid() ? "android" : "other",
        })
      },
      submitted: () => {
        // Empty submits an empty value, like a native input.
        const { value, name } = store.get()
        return name === undefined ? null : value === null ? "" : String(value)
      },
    },
  }

  // A value from outside, like a controlled one, shows unless it's what's
  // typed. A new format, locale or step shows the value again, unless the
  // user is typing. Formats compare by content, so a new object each render
  // changes nothing.
  const formatKey = (state: State) =>
    JSON.stringify([state.format, localeOf(state), state.step])
  // A value from options shows in the same pass, unless the text typed so far already reads as it.
  deriveFromOptions(context, ["text"], (synced, state) => {
    if (!("value" in synced) || sameValue(synced.value, state.value)) {
      return
    }
    const next = { ...state, ...synced }
    const typed =
      next.text.trim() === ""
        ? null
        : parseNumber(next.text, localeOf(next), readFormat(next))
    if (!sameValue(typed, next.value)) {
      return { text: display(next.value, next) }
    }
  })
  let shown = store.get().value
  let shownState = store.get()
  let shownFormat = formatKey(shownState)
  store.subscribe(() => {
    const state = store.get()
    // Only a new format object, locale or step is compared by content, so
    // typing and scrubbing don't serialize the format on every change.
    const settingsChanged =
      state.format !== shownState.format ||
      localeOf(state) !== localeOf(shownState) ||
      state.step !== shownState.step
    shownState = state
    const format = settingsChanged ? formatKey(state) : shownFormat
    if (format !== shownFormat) {
      shownFormat = format
      if (!edited) {
        return showValue()
      }
    }
    if (sameValue(state.value, shown)) {
      return
    }
    shown = state.value
    const typed =
      state.text.trim() === ""
        ? null
        : parseNumber(state.text, localeOf(state), readFormat(state))
    if (!sameValue(typed, state.value)) {
      store.set({ text: display(state.value, state) })
    }
  })
  context.onDestroy(() => clearTimeout(wheelTimer))

  return api
}

const numberInputApi: (
  ...args: Parameters<typeof numberInputApiBody>
) => NumberInputApi = numberInputApiBody

function wrap(position: number, size: number) {
  return ((position % size) + size) % size
}

/**
 * `numberInput`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface NumberInputApi extends ReturnType<typeof numberInputApiBody> {}

export {
  atBound,
  canStep,
  display,
  inputMode,
  isDisabled,
  isLocked,
  type NumberInputApi,
  numberInputApi,
  rangeOf,
  settings,
  type State,
}
