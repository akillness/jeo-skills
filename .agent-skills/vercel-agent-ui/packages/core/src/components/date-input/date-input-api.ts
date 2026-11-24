// Date Input's and Time Input's state and API: the fields the segments hold,
// typing, stepping and clearing them, and what the form asks of the input.
import {
  boundsOf,
  clampDay,
  compareTo,
  dateOf,
  emptyFields,
  fieldsOf,
  hourCycleOf,
  normalizeValue,
  pageStepOf,
  segmentsOf,
  stepField,
  stepToEnd,
  typeDigit,
  typePeriod,
  typesOf,
  valueOf,
  type DateInputGranularity,
  type DateInputSegmentData,
  type EditableType,
  type Fields,
  type HourCycle,
  type Kind,
} from "./date-input-model"
import { matchesDate, type DateMatchers } from "../calendar/calendar-model"
import { parseDate } from "../../foundation/date/parse"
import { isDisabled, watchFieldsets } from "../../foundation/forms/form"
import { isRTL } from "../../foundation/platform/env"
import { bindPageLocale, localeOf } from "../../foundation/text/locale"
import { elements } from "../../foundation/kernel/elements"
import { createChange } from "../../foundation/kernel/input-source"
import type { ChangeOptions } from "../../foundation/kernel/details"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { keepsValueOnReset } from "../../foundation/forms/value"

/**
 * Why a date or time input's value wants to change.
 * @stable
 */
type DateInputValueChangeReason =
  "input-change" | "step-key" | "paste" | "reset" | "restore" | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type DateInputChangeOptions = ChangeOptions<DateInputValueChangeReason>

type SharedOptions = {
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null, details: any) => void
  granularity?: DateInputGranularity
  hourCycle?: HourCycle
  min?: string
  max?: string
  unavailable?: DateMatchers
  locale?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  name?: string
  form?: string
}

type State = {
  kind: Kind
  value: string | null
  initial: string | null
  // What the segments hold while they differ from the value, like a date
  // typed halfway. `fieldsFor` names the value they were typed over; a new
  // value from anywhere else leaves them behind.
  fields: Fields
  fieldsFor: string
  // The digits typed into a segment that may take another.
  buffer: { type: EditableType; text: string } | null
  granularity: DateInputGranularity
  hourCycle: HourCycle | null
  locale: string | null
  pageLocale: string | null
  min: string | null
  max: string | null
  unavailable: DateMatchers | null
  disabled: boolean
  readOnly: boolean
  formDisabled: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
}

const keyOf = (value: string | null) => String(value)

const formatOf = (state: State) => {
  const locale = localeOf(state)
  return {
    kind: state.kind,
    granularity: state.granularity,
    hourCycle: state.hourCycle ?? hourCycleOf(locale),
    locale,
  }
}

const editing = (state: State) => state.fieldsFor === keyOf(state.value)

// What the segments hold: what was typed over the value, else the value's own fields.
const shownFields = (state: State) =>
  editing(state) ? state.fields : fieldsOf(state.value, formatOf(state))

const segmentCache = new WeakMap<State, DateInputSegmentData[]>()

function segmentsFor(state: State) {
  let segments = segmentCache.get(state)
  if (!segments) {
    segments = segmentsOf(
      formatOf(state),
      shownFields(state),
      editing(state) ? state.buffer : null
    )
    segmentCache.set(state, segments)
  }
  return segments
}

const segmentFor = (state: State, key: string) =>
  segmentsFor(state).find((segment) => segment.key === key)

function isPartial(state: State) {
  if (state.value !== null) {
    return false
  }
  const fields = shownFields(state)
  return typesOf(formatOf(state)).some((type) => fields[type] !== null)
}

/**
 * What's wrong with a whole value: before `min`, after `max`, or an
 * unavailable date. Undefined when it's fine or there's no value.
 */
function problemOf(state: State) {
  const { value, min, max } = state
  if (value === null) {
    return undefined
  }
  if (min !== null && compareTo(value, min) < 0) {
    return "rangeUnderflow" as const
  }
  if (max !== null && compareTo(value, max) > 0) {
    return "rangeOverflow" as const
  }
  const date = dateOf(value)
  if (date && matchesDate(date, state.unavailable)) {
    return "unavailable" as const
  }
}

const settings = (kind: Kind, options: SharedOptions) => {
  const granularity =
    options.granularity ?? (kind === "date" ? "day" : "minute")
  const format = { kind, granularity, hourCycle: 24 as HourCycle }
  return {
    kind,
    granularity,
    hourCycle:
      options.hourCycle === 12 || options.hourCycle === 24
        ? options.hourCycle
        : null,
    locale: options.locale ?? null,
    min: normalizeBound(options.min, format),
    max: normalizeBound(options.max, format),
    unavailable: kind === "date" ? (options.unavailable ?? null) : null,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
  }
}

// A bound keeps a date alone, so a date-and-time input's `max` can take a whole day.
function normalizeBound(
  bound: string | undefined,
  format: {
    kind: Kind
    granularity: DateInputGranularity
    hourCycle: HourCycle
  }
) {
  if (typeof bound !== "string") {
    return null
  }
  const dateAlone = format.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(bound)
  return normalizeValue(bound, {
    ...format,
    granularity: dateAlone ? "day" : "second",
  })
}

const valueFor = (kind: Kind, options: SharedOptions, value: unknown) =>
  normalizeValue(value, {
    kind,
    granularity: options.granularity ?? (kind === "date" ? "day" : "minute"),
    hourCycle: 24,
  })

function initialDateInputState(kind: Kind, options: SharedOptions): State {
  return {
    ...settings(kind, options),
    value: valueFor(
      kind,
      options,
      options.value ?? options.defaultValue ?? null
    ),
    initial: valueFor(kind, options, options.defaultValue ?? null),
    fields: emptyFields(),
    fieldsFor: "",
    buffer: null,
    pageLocale: null,
    formDisabled: false,
  }
}

const syncDateInputState = (kind: Kind, options: SharedOptions) => ({
  ...settings(kind, options),
  ...(options.defaultValue === undefined
    ? {}
    : { initial: valueFor(kind, options, options.defaultValue) }),
  ...(options.value === undefined
    ? {}
    : { value: valueFor(kind, options, options.value) }),
})

const optionKinds = {
  value: "string",
  defaultValue: "string",
  onValueChange: "callback",
  granularity: "string",
  hourCycle: "number",
  min: "string",
  max: "string",
  unavailable: "list",
  locale: "string",
  disabled: "boolean",
  readOnly: "boolean",
  required: "boolean",
  name: "string",
  form: "string",
  controller: "value",
} as const

const separators = /[\s/.,:\-–]/

function dateInputApiBody(
  context: PrimitiveContext<SharedOptions, State, string>
) {
  const { store, element } = context
  const change = createChange(context)
  const format = () => formatOf(store.get())

  const segmentElements = () =>
    elements<{ segment?: Pick<DateInputSegmentData, "key"> }>(
      context,
      "segment"
    )
      .map(({ el, props }) => ({
        el,
        type: segmentFor(store.get(), props.segment?.key ?? "")?.type,
      }))
      .filter(
        (item): item is { el: HTMLElement; type: EditableType } =>
          !!item.type && item.type !== "literal"
      )
  const segmentElement = (type: string) =>
    segmentElements().find((item) => item.type === type)?.el
  // The segment focus moved to once the last one was done, so the separator
  // typed next, as in 12/25, doesn't skip it.
  let advancedTo: HTMLElement | null = null

  // The fields after an edit, and the value they make when all are filled.
  // A segment that may take another digit holds its value back, so typing a
  // year reports 2026 once, not 2, 20 and 202 on the way.
  function edit(
    fields: Fields,
    buffer: State["buffer"],
    reason: DateInputValueChangeReason,
    event?: Event
  ) {
    const current = store.get().value
    if (buffer) {
      return store.set({ fields, buffer, fieldsFor: keyOf(current) })
    }
    const next = valueOf(fields, format())
    if (next !== current) {
      change("value", next, { reason, event })
    }
    store.set({ fields, buffer, fieldsFor: keyOf(next) })
  }

  function finish(event?: Event) {
    const state = store.get()
    if (!state.buffer) {
      return
    }
    if (!editing(state)) {
      return store.set({ buffer: null })
    }
    edit(clampDay(state.fields), null, "input-change", event)
  }

  function setValue(
    value: string | null,
    reason: DateInputValueChangeReason,
    event?: Event
  ) {
    const next = value === null ? null : normalizeValue(value, format())
    if (value !== null && next === null) {
      return false
    }
    const changed =
      next === store.get().value || change("value", next, { reason, event })
    store.set({ fields: emptyFields(), fieldsFor: "", buffer: null })
    return changed
  }

  const editable = () => {
    const state = store.get()
    return !isDisabled(state) && !state.readOnly
  }

  function moveFocus(from: HTMLElement, offset: number) {
    const list = segmentElements().map(({ el }) => el)
    const target = list[list.indexOf(from) + offset]
    // The next segment sits beside this one, and iOS would scroll the page on every move.
    target?.focus({ preventScroll: true })
    return !!target
  }

  // Where an empty segment starts when an arrow key steps it: today's date,
  // or the start of the day.
  function startOf(type: EditableType, direction: 1 | -1, fields: Fields) {
    const now = new Date()
    if (type === "year") {
      return now.getFullYear()
    }
    if (type === "month") {
      return now.getMonth() + 1
    }
    const [min, max] = boundsOf(type, fields, format().hourCycle)
    if (type === "day") {
      return Math.min(now.getDate(), max)
    }
    return direction === 1 ? min : max
  }

  function step(type: EditableType, key: string, event: KeyboardEvent) {
    const fields = shownFields(store.get())
    const { hourCycle } = format()
    let next: Fields
    if (key === "Home" || key === "End") {
      next = stepToEnd(fields, type, key === "Home" ? "min" : "max", hourCycle)
    } else {
      const direction = key === "ArrowUp" || key === "PageUp" ? 1 : -1
      const size = key.startsWith("Page") ? pageStepOf(type) : 1
      next = stepField(
        fields,
        type,
        direction * size,
        hourCycle,
        startOf(type, direction, fields)
      )
    }
    edit(next, null, "step-key", event)
  }

  // Characters typed into a segment. Digits fill it, a letter picks AM or PM,
  // and a separator moves on. Once a segment is done the rest go to the next.
  function insert(
    type: EditableType,
    el: HTMLElement,
    text: string,
    event: Event
  ) {
    const { hourCycle, locale } = format()
    let target = el
    let current = type
    for (const char of text) {
      const state = store.get()
      const fields = shownFields(state)
      const buffer = editing(state) ? state.buffer : null
      const advanced = advancedTo === target
      advancedTo = null
      if (/\d/.test(char) && current !== "dayPeriod") {
        const typed = typeDigit(fields, buffer, current, char, hourCycle)
        edit(typed.fields, typed.buffer, "input-change", event)
        if (typed.done && advance()) {
          advancedTo = target
        } else if (typed.done) {
          break
        }
      } else if (separators.test(char)) {
        if (
          advanced ||
          (buffer?.type !== current && fields[current] === null)
        ) {
          continue
        }
        finish(event)
        if (!advance()) {
          break
        }
      } else if (/\p{L}/u.test(char)) {
        const period = typePeriod(fields, char, locale)
        if (period && (current === "dayPeriod" || hourCycle === 12)) {
          edit(period, null, "input-change", event)
          if (current === "dayPeriod" && !advance()) {
            break
          }
        }
      }
    }

    function advance() {
      const next = segmentElements()
      const index = next.findIndex((item) => item.el === target)
      const following = next[index + 1]
      if (!following) {
        finish(event)
        return false
      }
      following.el.focus({ preventScroll: true })
      target = following.el
      current = following.type
      return true
    }
  }

  // Backspace removes the last digit typed, then empties the segment, then
  // moves back. Delete empties it.
  function remove(
    type: EditableType,
    el: HTMLElement,
    backward: boolean,
    event: Event
  ) {
    const state = store.get()
    const fields = shownFields(state)
    const buffer = editing(state) ? state.buffer : null
    if (backward && buffer?.type === type && buffer.text.length > 1) {
      const text = buffer.text.slice(0, -1)
      const typed = typeDigit(
        { ...fields, [type]: null },
        null,
        type,
        text,
        format().hourCycle
      )
      return edit(typed.fields, { type, text }, "input-change", event)
    }
    if (fields[type] !== null || buffer?.type === type) {
      return edit({ ...fields, [type]: null }, null, "input-change", event)
    }
    if (backward) {
      moveFocus(el, -1)
    }
  }

  function paste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData("text/plain")?.trim()
    event.preventDefault()
    if (!text || !editable()) {
      return
    }
    const state = store.get()
    let value = normalizeValue(text, format())
    if (value === null && state.kind === "date") {
      const date = parseDate(text, localeOf(state))
      if (date) {
        value = normalizeValue(date, format())
      }
    }
    if (value !== null) {
      setValue(value, "paste", event)
    }
  }

  function keydown(event: KeyboardEvent, type: EditableType, el: HTMLElement) {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
      return
    }
    const { key } = event
    if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault()
      moveFocus(el, (key === "ArrowRight") !== isRTL(el) ? 1 : -1)
    } else if (
      ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(
        key
      )
    ) {
      event.preventDefault()
      if (editable()) {
        step(type, key, event)
      }
    } else if (key === "Backspace" || key === "Delete") {
      // WebKit sends no beforeinput when a segment has nothing left to delete,
      // so a key from a keyboard is handled here, the same in every browser.
      event.preventDefault()
      if (editable()) {
        remove(type, el, key === "Backspace", event)
      }
    } else if (key === "Enter") {
      // WebKit sends no beforeinput for Enter either, and the form submits
      // right after this key, so the digits typed so far are kept first.
      finish(event)
    }
  }

  // Every edit goes through here, so the browser never writes the segment's text.
  // Enter keeps its default, so the form submits with what was typed.
  function beforeinput(event: InputEvent, type: EditableType, el: HTMLElement) {
    if (event.isComposing && !event.cancelable) {
      return
    }
    if (event.inputType === "insertLineBreak") {
      return finish(event)
    }
    event.preventDefault()
    if (!editable()) {
      return
    }
    const kind = event.inputType
    if (
      kind.startsWith("insert") &&
      kind !== "insertFromPaste" &&
      kind !== "insertFromDrop" &&
      event.data
    ) {
      insert(type, el, event.data, event)
    } else if (kind.startsWith("delete")) {
      remove(type, el, kind.includes("Backward"), event)
    }
  }

  // Text the browser wrote anyway, like an input method's or typing before
  // the page ran: the digits in it fill the segment.
  function adopt(
    type: EditableType,
    el: HTMLInputElement,
    typed: string,
    event?: Event
  ) {
    const shown = segmentFor(store.get(), type)?.text ?? ""
    if (typed === shown) {
      return
    }
    if (!editable()) {
      return
    }
    // East Asian input methods commit full-width digits and letters.
    const text = typed.normalize("NFKC")
    const digits = text.replace(/\D/g, "")
    if (type === "dayPeriod" || digits === "") {
      const letter = text.replace(/[^\p{L}]/gu, "").slice(-1)
      if (letter) {
        return insert(type, el, letter, event ?? new Event("input"))
      }
      return edit(
        { ...shownFields(store.get()), [type]: null },
        null,
        "input-change",
        event
      )
    }
    const added =
      shown && text.startsWith(shown)
        ? digits.slice(shown.replace(/\D/g, "").length)
        : digits
    insert(type, el, added || digits.slice(-1), event ?? new Event("input"))
  }

  function focusSegment(type?: string) {
    const list = segmentElements()
    const target = type ? list.find((item) => item.type === type) : list[0]
    target?.el.focus()
  }

  // A press on the box around the segments, or on the text between them, goes
  // to the nearest segment, so the whole field takes a tap like a native one.
  function nearestSegment(event: MouseEvent) {
    const list = segmentElements()
    if (
      !editable() ||
      list.some(({ el }) => el.contains(event.target as Node))
    ) {
      return
    }
    const distance = (el: HTMLElement) => {
      const { left, right } = el.getBoundingClientRect()
      return Math.max(left - event.clientX, event.clientX - right, 0)
    }
    return list.reduce<HTMLElement | undefined>(
      (best, { el }) => (!best || distance(el) < distance(best) ? el : best),
      undefined
    )
  }

  function blur(event?: Event) {
    advancedTo = null
    finish(event)
  }

  function reset() {
    const { value, defaultValue } = context.options()
    if (keepsValueOnReset(value, defaultValue)) {
      return
    }
    setValue(store.get().initial, "reset")
  }

  function restore(saved: string) {
    setValue(saved || null, "restore")
  }

  return {
    /** The value: an ISO date, date and time, or time, or `null` while empty or partly filled. */
    getValue: () => store.get().value,
    /** Sets the value. Returns false when it isn't one the input can show, or when canceled. */
    setValue: (
      value: string | null,
      { reason = "imperative", event }: DateInputChangeOptions = {}
    ) => setValue(value, reason, event),
    /** Empties every segment. */
    clear: ({ reason = "imperative", event }: DateInputChangeOptions = {}) =>
      setValue(null, reason, event),
    /** Focuses a segment, like `"month"`, or the first one. */
    focus: focusSegment,
    internal: {
      keydown,
      beforeinput,
      adopt,
      paste,
      blur,
      reset,
      restore,
      segmentElement,
      nearestSegment,
      firstSegment: () =>
        segmentElements()[0]?.el as HTMLInputElement | undefined,
      setFormDisabled: (formDisabled: boolean) => store.set({ formDisabled }),
      bindRoot(el: HTMLElement) {
        bindPageLocale(el, (pageLocale) => store.set({ pageLocale }))
        return watchFieldsets(el, (formDisabled) => store.set({ formDisabled }))
      },
      rootElement: () => element("root"),
    },
  }
}

const dateInputApi: (
  ...args: Parameters<typeof dateInputApiBody>
) => DateInputApi = dateInputApiBody

/**
 * The api of `dateInput` and `timeInput`, which their slots and controllers call. Adapters expose it as `api`.
 * @stable
 */
interface DateInputApi extends ReturnType<typeof dateInputApiBody> {}

export {
  dateInputApi,
  type DateInputApi,
  type DateInputChangeOptions,
  type DateInputValueChangeReason,
  formatOf,
  initialDateInputState,
  isPartial,
  optionKinds,
  problemOf,
  segmentFor,
  segmentsFor,
  type SharedOptions,
  shownFields,
  type State,
  syncDateInputState,
}
