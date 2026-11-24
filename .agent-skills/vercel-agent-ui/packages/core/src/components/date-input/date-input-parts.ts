// Date Input's and Time Input's parts: the group, a segment and the hidden
// input a value submits with, and the validity they report to a form.
import {
  isPartial,
  problemOf,
  segmentFor,
  segmentsFor,
  type DateInputApi,
  type State,
} from "./date-input-api"
import type { DateInputSegmentData, EditableType } from "./date-input-model"
import {
  bindInternals,
  bindSegmentSubmit,
  bindValueInput,
  formInternals,
  isDisabled,
  setComponentValidity,
  valueMissingMessage,
} from "../../foundation/forms/form"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"

/**
 * What `render` functions and state-based class names of the root receive.
 * @stable
 */
type DateInputState = {
  /** The value, or `null` while empty or partly filled. */
  value: string | null
  /** The segments in the order the locale shows them, with the text between them. Render one part for each. */
  segments: DateInputSegmentData[]
  /** Whether it can't be used, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the value can be seen but not changed. */
  readOnly: boolean
  /** Whether the value is before `min`, after `max` or an unavailable date. */
  invalid: boolean
}

/**
 * What `render` functions and state-based class names of a segment receive: the segment, and the input's state.
 * @stable
 */
type DateInputSegmentState = DateInputSegmentData & {
  /** Whether it can't be used. */
  disabled: boolean
  /** Whether its value can't be changed. */
  readOnly: boolean
  /** Whether the value is before `min`, after `max` or an unavailable date. */
  invalid: boolean
}

/**
 * The props the `segment` slot takes.
 * @stable
 */
type DateInputSegmentProps = {
  /** The segment it shows, from the root's `segments`. */
  segment: DateInputSegmentData
}

const empty: DateInputSegmentData = {
  key: "",
  type: "literal",
  text: "",
  value: null,
  min: 0,
  max: 0,
  empty: true,
  editable: false,
  label: "",
}

// A segment as it stands now, so a part rendered from an older list stays current.
const currentSegment = (state: State, props: Partial<DateInputSegmentProps>) =>
  (props.segment && segmentFor(state, props.segment.key)) ??
  props.segment ??
  empty

// English, like Date Picker's, for what the browser has no message of its own.
const badInputMessage = (state: State) =>
  state.kind === "time" ? "Enter a valid time." : "Enter a valid date."
const unavailableMessage = "This date isn't available."

const nativeMessages = new Map<string, string>()

// The browser's own message for a value before `min` or after `max`, in the
// user's language, read from a detached native input of the same kind.
function rangeMessage(
  state: State,
  problem: "rangeUnderflow" | "rangeOverflow"
) {
  const bound = (problem === "rangeUnderflow" ? state.min : state.max) ?? ""
  const fallback =
    problem === "rangeUnderflow"
      ? `Value must be ${bound} or later.`
      : `Value must be ${bound} or earlier.`
  if (typeof document === "undefined") {
    return fallback
  }
  const type =
    state.kind === "time"
      ? "time"
      : state.granularity === "day"
        ? "date"
        : "datetime-local"
  const key = `${type}|${problem}|${bound}`
  let message = nativeMessages.get(key)
  if (message === undefined) {
    const input = Object.assign(document.createElement("input"), { type })
    const native =
      type === "datetime-local" && !bound.includes("T")
        ? `${bound}T${problem === "rangeUnderflow" ? "00:00" : "23:59"}`
        : bound
    if (problem === "rangeUnderflow") {
      input.min = native
      input.value =
        type === "time"
          ? "00:00"
          : type === "date"
            ? "0001-01-01"
            : "0001-01-01T00:00"
    } else {
      input.max = native
      input.value =
        type === "time"
          ? "23:59"
          : type === "date"
            ? "9999-12-31"
            : "9999-12-31T23:59"
    }
    message = input.validationMessage || fallback
    nativeMessages.set(key, message)
  }
  return message
}

// The validity flag for the value's problem. A read-only control is barred
// from validation, like a native one.
function problemFlag(state: State) {
  const problem = state.readOnly
    ? undefined
    : isPartial(state)
      ? "badInput"
      : problemOf(state)
  return problem === "unavailable" ? "customError" : problem
}

function problemMessage(state: State) {
  if (isPartial(state)) {
    return badInputMessage(state)
  }
  const problem = problemOf(state)
  if (problem === "unavailable") {
    return unavailableMessage
  }
  return problem ? rangeMessage(state, problem) : ""
}

const disabledAttrs = (state: State) => ({
  "data-disabled": isDisabled(state) ? "" : undefined,
  "data-readonly": state.readOnly ? "" : undefined,
  "data-required": state.required ? "" : undefined,
  "data-invalid": problemOf(state) ? "" : undefined,
})

const dateInputSlots = (slot: SlotFactory<State, DateInputApi>) => ({
  root: slot<{}, DateInputState>({
    role: "group",
    state: (state) => ({
      value: state.value,
      segments: segmentsFor(state),
      disabled: isDisabled(state),
      readOnly: state.readOnly,
      invalid: !!problemOf(state),
    }),
    attrs: (state) => ({
      ...disabledAttrs(state),
      "data-empty": state.value === null && !isPartial(state) ? "" : undefined,
    }),
    on: {
      // Keeps focus in the field until the click below picks a segment.
      mousedown(event, { api }) {
        if (api.internal.nearestSegment(event)) {
          event.preventDefault()
        }
      },
      click: (event, { api }) =>
        api.internal.nearestSegment(event)?.focus({ preventScroll: true }),
    },
    bind(el, { api, store }) {
      // A native segment carries the input's problems, unless the root reports them itself.
      let carrier: HTMLInputElement | undefined
      const validate = () => {
        if (formInternals(el)) {
          return
        }
        const first = api.internal.firstSegment()
        if (carrier && carrier !== first) {
          setComponentValidity(carrier, "")
        }
        carrier = first
        if (first) {
          const state = store.get()
          setComponentValidity(first, problemMessage(state), problemFlag(state))
        }
      }
      queueMicrotask(validate)
      const cleanups = [
        api.internal.bindRoot(el),
        store.subscribe(validate),
        () =>
          carrier?.isConnected === false && setComponentValidity(carrier, ""),
        bindInternals(el, {
          value: () => store.get().value ?? "",
          state: () => store.get().value ?? "",
          restore: api.internal.restore,
          valueMissing: () => {
            const state = store.get()
            return (
              state.required &&
              !state.readOnly &&
              state.value === null &&
              !isPartial(state)
            )
          },
          message: () => valueMissingMessage("text"),
          invalid: () => {
            const state = store.get()
            const flag = problemFlag(state)
            if (!flag) {
              return undefined
            }
            return {
              flags: { [flag]: true },
              message: problemMessage(state),
              anchor: api.internal.firstSegment(),
            }
          },
          focus: () => api.focus(),
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
          subscribe: store.subscribe,
        }),
      ]
      return () => cleanups.forEach((cleanup) => cleanup?.())
    },
  }),

  // A segment you type in is a real input, so typing works before the page
  // runs and phones show a number pad. The text between segments is hidden
  // from assistive technology, which hears each segment's name instead.
  segment: slot<DateInputSegmentProps, DateInputSegmentState>({
    props: { segment: "value" },
    role: (state, { props }) =>
      currentSegment(state, props).editable ? "spinbutton" : undefined,
    roles: ["spinbutton"],
    focus: (state, { props }) =>
      currentSegment(state, props).editable
        ? "native"
        : { none: "The text between segments is hidden and never focused." },
    keys: [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ],
    state: (state, { props }) => ({
      ...currentSegment(state, props),
      disabled: isDisabled(state),
      readOnly: state.readOnly,
      invalid: !!problemOf(state),
    }),
    attrs: (state, { props }) => {
      const segment = currentSegment(state, props)
      if (!segment.editable) {
        return {
          "aria-hidden": "true",
          "data-type": "literal",
          ...disabledAttrs(state),
        }
      }
      const invalid = !!problemOf(state)
      return {
        type: "text",
        value: segment.text,
        inputmode: segment.type === "dayPeriod" ? "text" : "numeric",
        "aria-label": segment.label,
        "aria-valuenow":
          segment.value === null ? undefined : String(segment.value),
        "aria-valuemin": String(segment.min),
        "aria-valuemax": String(segment.max),
        "aria-valuetext": segment.empty ? "Empty" : segment.text,
        "aria-invalid": invalid ? "true" : undefined,
        placeholder: segment.type === "year" ? "––––" : "––",
        size: String(segment.type === "year" ? 4 : 2),
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        spellcheck: "false",
        required: state.required ? "" : undefined,
        form: state.form,
        disabled: isDisabled(state) ? "" : undefined,
        readonly: state.readOnly ? "" : undefined,
        "data-type": segment.type,
        "data-empty": segment.empty ? "" : undefined,
        ...disabledAttrs(state),
      }
    },
    on: {
      keydown(event, { api, el, props, store }) {
        const segment = currentSegment(store.get(), props)
        if (el && segment.editable) {
          api.internal.keydown(event, segment.type as EditableType, el)
        }
      },
      paste(event, { api, props, store }) {
        if (currentSegment(store.get(), props).editable) {
          api.internal.paste(event)
        }
      },
      focusout: (event, { api }) => api.internal.blur(event),
    },
    bind(el, { api, store, props }) {
      const segment = currentSegment(store.get(), props)
      if (!segment.editable || !(el instanceof HTMLInputElement)) {
        return
      }
      const type = segment.type as EditableType
      const input = el
      // iOS scrolls the page to the top when a segment selects its text while
      // it handles a key, so the selection waits a frame.
      let frame = 0
      const select = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(
          () => input.matches(":focus") && input.select()
        )
      }
      // The text is written here, so the framework never fights the caret.
      const write = () => {
        const text = segmentFor(store.get(), type)?.text ?? ""
        if (input.value !== text) {
          input.value = text
        }
        if (input.matches(":focus")) {
          select()
        }
      }
      // Digits typed before the page ran fill the segment.
      api.internal.adopt(type, input, input.value)
      write()
      // React's beforeinput isn't the native event, so the segment listens itself.
      const onBeforeInput = (event: InputEvent) => {
        if (!event.defaultPrevented) {
          api.internal.beforeinput(event, type, input)
        }
      }
      const onInput = (event: Event) => {
        if ((event as InputEvent).isComposing) {
          return
        }
        api.internal.adopt(type, input, input.value, event)
        write()
      }
      input.addEventListener("beforeinput", onBeforeInput)
      input.addEventListener("input", onInput)
      // Browsers differ on whether an `input` follows the end of a composition.
      input.addEventListener("compositionend", onInput)
      input.addEventListener("focus", select)
      const unsubscribe = store.subscribe(write)
      const unbindSubmit = bindSegmentSubmit(input)
      return () => {
        unsubscribe()
        unbindSubmit()
        cancelAnimationFrame(frame)
        input.removeEventListener("beforeinput", onBeforeInput)
        input.removeEventListener("input", onInput)
        input.removeEventListener("compositionend", onInput)
        input.removeEventListener("focus", select)
      }
    },
  }),

  // React, Vue, Solid and Svelte: the hidden input the value submits with.
  "hidden-input": slot({
    attrs: (state) => ({
      type: "hidden",
      name: state.name,
      value: state.value ?? "",
      form: state.form,
      disabled: isDisabled(state) ? "" : undefined,
    }),
    bind: (el, { api, store }) =>
      bindValueInput(el as HTMLInputElement, {
        value: () => store.get().value ?? "",
        subscribe: store.subscribe,
        focus: () => api.focus(),
        reset: api.internal.reset,
        disabled: api.internal.setFormDisabled,
      }),
  }),
})

export {
  dateInputSlots,
  type DateInputSegmentProps,
  type DateInputSegmentState,
  type DateInputState,
}
