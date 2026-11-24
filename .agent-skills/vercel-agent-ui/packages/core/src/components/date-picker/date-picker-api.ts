// Date Picker's state and API: the text typed in its inputs and the dates it
// reads, the popup, presets and clearing, and what the form asks of it.
import {
  blockedDate,
  calendarSettings,
  calendarApi,
  calendarState,
  calendarSync,
  isPickable,
  localeOf,
  preferredDate,
  rangeRules,
  type CalendarModelState,
} from "../calendar/calendar-api"
import {
  isAllowedRange,
  normalizeValue,
  selectedDates,
  type ISOMonth,
} from "../calendar/calendar-model"
import type { CalendarOptions } from "../calendar/calendar"
import { formatDate } from "../../foundation/date/format"
import { parseDate } from "../../foundation/date/parse"
import {
  clampDate,
  isISODate,
  type ISODate,
} from "../../foundation/date/plain-date"
import { formInternals } from "../../foundation/forms/form"
import { initialApple } from "../../foundation/platform/platform"
import { deriveOpen } from "../../foundation/popups/popup"
import {
  createPopup,
  popupState,
  type PopupState,
} from "../../foundation/popups/create-popup"
import { datePickerPreset } from "../../foundation/popups/popup-presets"
import { elements } from "../../foundation/kernel/elements"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import type {
  DatePickerChangeOptions,
  DatePickerContentProps,
  DatePickerInputProps,
  DatePickerMonthChangeReason,
  DatePickerOptions,
  DatePickerValue,
  DatePickerValueChangeReason,
} from "./date-picker"
import { keepsValueOnReset } from "../../foundation/forms/value"

type State = PopupState &
  CalendarModelState & {
    apple: boolean
    presentation: "popover" | "sheet"
    // Text typed in each input, start then end, while it differs from the value
    // it was typed over, which `draftFor` names. A new value from anywhere else
    // leaves the drafts behind.
    drafts: [string | null, string | null]
    draftFor: string
    invalid: [boolean, boolean]
    initial: DatePickerValue
    closeOnSelect: boolean
    name: string | undefined
    startName: string | undefined
    endName: string | undefined
    form: string | undefined
    required: boolean
    hinted: boolean
  }

const valueKey = (value: unknown) => JSON.stringify(value ?? null)
const shortDate = (date: ISODate, locale: string) =>
  formatDate(date, locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replace(/[‎‏]/g, "")

// The date an input holds: the value's date, or a range's end.
function dateAt(state: State, index: number) {
  if (state.mode !== "range") {
    return index ? null : (state.value as ISODate | null)
  }
  if (state.anchor !== null) {
    return index ? null : state.anchor
  }
  return (state.value as [ISODate, ISODate] | null)?.[index] ?? null
}

// What an input shows: what was typed over the current value, else the date it holds.
function textOf(state: State, index: number) {
  const draft =
    state.draftFor === valueKey(state.value) ? state.drafts[index] : null
  if (draft !== null) {
    return draft
  }
  const date = dateAt(state, index)
  return date ? shortDate(date, localeOf(state)) : ""
}

const invalidAt = (state: State, index: number) =>
  state.draftFor === valueKey(state.value) && state.invalid[index]

const settings = (options: DatePickerOptions) => ({
  closeOnSelect: options.closeOnSelect ?? true,
  name: options.name,
  startName: options.startName,
  endName: options.endName,
  form: options.form,
  required: !!options.required,
})

// What a range's ends submit under.
function nameAt(state: State, index: number) {
  if (state.mode !== "range") {
    return index ? undefined : state.name
  }
  return (index ? state.endName : state.startName) ?? state.name
}

function submitted(state: State) {
  const start = dateAt(state, 0)
  if (state.mode !== "range") {
    return start ?? ""
  }
  const data = new FormData()
  const value = state.value as [ISODate, ISODate] | null
  for (const index of [0, 1]) {
    const name = nameAt(state, index)
    if (name) {
      data.append(name, value?.[index] ?? "")
    }
  }
  return data
}

/**
 * `datePicker`'s api, which its slots and controller call. Adapters expose it as `api`.
 * @stable
 */
interface DatePickerApi extends ReturnType<typeof datePickerApiBody> {}

function datePickerApiBody(
  context: PrimitiveContext<DatePickerOptions, State, string>
) {
  const { store, element } = context
  // A controlled open starts focus from the selected date, in the same pass.
  deriveOpen(context, ["focused"], (open) =>
    open ? { focused: null } : undefined
  )

  const calendar = calendarApi<
    DatePickerOptions,
    State,
    DatePickerValueChangeReason,
    DatePickerMonthChangeReason
  >(context, {
    picked(event) {
      if (store.get().closeOnSelect) {
        control.hide({ reason: "item-press", event })
      }
    },
  })
  const { setValue, setMonth, reveal } = calendar.internal

  function showValue() {
    const [first] = selectedDates(store.get().value)
    if (first) {
      reveal(first, "imperative")
    }
  }

  let awaited = false
  let last = store.get().value
  let opened = store.get().open
  // With nothing selected, an open goes back to the month the picker started on, like `defaultMonth`.
  const firstMonth = store.get().month
  store.subscribe(() => {
    const state = store.get()
    // Each open shows the selected date, wherever browsing left the months.
    if (state.open !== opened) {
      opened = state.open
      const [date] = selectedDates(state.value)
      if (opened && date) {
        reveal(clampDate(date, state.min, state.max), "imperative")
      } else if (opened && state.month !== firstMonth) {
        setMonth(firstMonth, "imperative")
      }
    }
    if (state.value === last) {
      return
    }
    last = state.value
    if (awaited) {
      awaited = false
      showValue()
    }
  })

  // The trigger, or without one, the input that holds the start.
  const triggerElement = () =>
    element("trigger") ?? element("input", "start") ?? element("input")
  const inputElement = () => element("input", "start") ?? element("input")
  // The first input whose text isn't a date, the start before the end.
  const invalidInput = () => {
    const state = store.get()
    return elements<DatePickerInputProps>(context, "input").find(({ props }) =>
      invalidAt(state, props.end ? 1 : 0)
    )?.el
  }

  const kit = createPopup(context, {
    preset: datePickerPreset,
    rules: () => ({
      trigger: triggerElement,
      // Pressing the trigger toggles the popup, and pressing an input leaves it to focus.
      contains: (target) =>
        elements(context, "trigger").some(({ el }) => el.contains(target)),
      onOpenChange(open) {
        // Focus starts from the selected date, not where it was left.
        if (open) {
          store.set({ focused: null })
        }
      },
    }),
  })
  const { control, popup } = kit.internal
  const presentation = kit.internal.presentation
  const contentProps = () =>
    kit.internal.contentProps() as DatePickerContentProps

  function clearDrafts() {
    store.set({ drafts: [null, null], invalid: [false, false] })
  }

  function setText(index: number, text: string) {
    const state = store.get()
    const key = valueKey(state.value)
    const fresh = state.draftFor === key
    const drafts: State["drafts"] = fresh ? [...state.drafts] : [null, null]
    drafts[index] = text
    store.set({
      drafts,
      draftFor: key,
      invalid: fresh ? state.invalid : [false, false],
    })
  }

  function markInvalid(index: number) {
    const invalid: State["invalid"] = [...store.get().invalid]
    invalid[index] = true
    store.set({ invalid })
  }

  // Reads an input's text: a date, null when empty, undefined when it isn't a date.
  function read(text: string) {
    const state = store.get()
    if (text.trim() === "") {
      return null
    }
    return parseDate(text, localeOf(state), {
      referenceDate: state.today ?? undefined,
    })
  }

  // Enter or blur: a typed date becomes the value, or the input is marked invalid.
  function commit(index: number, event?: Event) {
    const state = store.get()
    if (state.draftFor !== valueKey(state.value)) {
      return
    }
    const text = state.drafts[index]
    if (text === null) {
      return
    }
    const parsed = read(text)
    if (
      parsed === undefined ||
      (parsed !== null && blockedDate(state, parsed))
    ) {
      return markInvalid(index)
    }

    if (state.mode !== "range") {
      setValue(parsed, "input-commit", event)
      clearDrafts()
      if (parsed) {
        reveal(parsed, "input-commit", event)
      }
      return
    }

    const ends = [0, 1].map((at) => {
      if (at === index) {
        return parsed
      }
      const draft = state.drafts[at]
      return draft === null ? dateAt(state, at) : read(draft)
    })
    const [start, end] = ends
    if (start && end) {
      if (start > end || !isAllowedRange(start, end, rangeRules(state))) {
        return markInvalid(index)
      }
      setValue([start, end], "input-commit", event)
      store.set({ anchor: null, hover: null })
      clearDrafts()
      if (parsed) {
        reveal(parsed, "input-commit", event)
      }
      return
    }
    if (start === null && end === null) {
      setValue(null, "input-commit", event)
      store.set({ anchor: null, hover: null })
      clearDrafts()
      return
    }
    // One end: no value yet. The other end waits in its input, and a start
    // waits in the calendar for its end too.
    setValue(null, "input-commit", event)
    const drafts = ends.map((date, at) =>
      date
        ? shortDate(date, localeOf(state))
        : date === null
          ? ""
          : state.drafts[at]
    ) as State["drafts"]
    const invalid: State["invalid"] = [false, false]
    invalid[1 - index] = state.invalid[1 - index]
    store.set({
      anchor: start ?? null,
      hover: start ?? null,
      drafts,
      draftFor: valueKey(store.get().value),
      invalid,
    })
    if (parsed) {
      reveal(parsed, "input-commit", event)
    }
  }

  function pickValue(
    value: DatePickerValue,
    reason: DatePickerValueChangeReason,
    event?: Event
  ) {
    const state = store.get()
    if (!isPickable(state, value)) {
      return false
    }
    const normalized = normalizeValue(state.mode, value) as DatePickerValue
    store.set({ anchor: null, hover: null })
    clearDrafts()
    const changed = setValue(normalized, reason, event)
    const first = Array.isArray(normalized) ? normalized[0] : normalized
    if (first && isISODate(first) && reason === "preset-press") {
      reveal(first, reason, event)
    }
    return changed
  }

  function reset() {
    const { value, defaultValue } = context.options()
    if (keepsValueOnReset(value, defaultValue)) {
      return
    }
    store.set({ anchor: null, hover: null })
    clearDrafts()
    setValue(store.get().initial, "reset")
  }

  // The browser puts a form back, like on going back to the page.
  function restore(saved: string) {
    try {
      setValue(
        normalizeValue(store.get().mode, JSON.parse(saved)) as DatePickerValue,
        "restore"
      )
    } catch {}
  }

  const api = {
    isOpen: kit.isOpen,
    setOpen: kit.setOpen,
    open: kit.open,
    close: kit.close,
    toggle: kit.toggle,
    getValue: () => store.get().value as DatePickerValue,
    setValue: (
      value: DatePickerValue,
      {
        reason = "imperative",
        event,
      }: DatePickerChangeOptions<DatePickerValueChangeReason> = {}
    ) => {
      if (!isPickable(store.get(), value)) {
        return false
      }
      store.set({ anchor: null, hover: null })
      const before = store.get().value
      const result = setValue(value, reason, event)
      // The calendar turns to a date set from code, as it does to a typed one:
      // to the value now held, or for a controlled one, to the value its
      // owner passes back.
      const held = store.get().value
      const asked = normalizeValue(store.get().mode, value)
      if (held !== before || valueKey(held) === valueKey(asked)) {
        showValue()
      } else if (result && context.options().value !== undefined) {
        awaited = true
      }
      return result
    },
    clear: ({
      reason = "imperative",
      event,
    }: DatePickerChangeOptions<DatePickerValueChangeReason> = {}) =>
      pickValue(null, reason, event),
    getMonth: calendar.getMonth,
    setMonth: (
      month: ISOMonth,
      {
        reason = "imperative",
        event,
      }: DatePickerChangeOptions<DatePickerMonthChangeReason> = {}
    ) => setMonth(month, reason, event),
    previous: (
      options?: DatePickerChangeOptions<DatePickerMonthChangeReason>
    ) => calendar.previous(options),
    next: (options?: DatePickerChangeOptions<DatePickerMonthChangeReason>) =>
      calendar.next(options),
    focus: calendar.focus,
    internal: {
      ...calendar.internal,
      show: control.show,
      hide: control.hide,
      popup,
      presentation,
      commit,
      setText,
      pickValue,
      reset,
      restore,
      submitted: () => submitted(store.get()),
      setFormDisabled: (formDisabled: boolean) => store.set({ formDisabled }),
      // The input whose text isn't a date, else the start's.
      focusInput: () => (invalidInput() ?? inputElement())?.focus(),
      invalidInput,
      // A form-associated root, like a custom element's, reports the inputs' problems itself.
      rootValidates: () => !!formInternals(element("root")),
      contentProps,
      // The popup lines up with the start input, or the trigger without one.
      anchorElement: () => inputElement() ?? element("trigger"),
      // Focus goes to the calendar's tab stop: the selected date, else today, else the first that can be picked.
      initialFocus() {
        const state = store.get()
        const content = popup.element()!
        return element("day", state.focused ?? preferredDate(state)) ?? content
      },
      inputKeydown(event: KeyboardEvent, index: number) {
        if (event.key === "Enter") {
          commit(index, event)
        } else if (
          event.key === "ArrowDown" &&
          event.altKey &&
          !store.get().open
        ) {
          event.preventDefault()
          control.show({ event, by: "keyboard" })
        }
      },
    },
  }
  return api
}

const datePickerApi: (
  ...args: Parameters<typeof datePickerApiBody>
) => DatePickerApi = datePickerApiBody

const initialDatePickerState = (options: DatePickerOptions): State => {
  const calendar = calendarState(options as CalendarOptions)
  return {
    ...calendar,
    ...settings(options),
    ...popupState(options),
    presentation: "popover",
    apple: initialApple(),
    drafts: [null, null],
    draftFor: "",
    invalid: [false, false],
    initial: normalizeValue(
      calendar.mode,
      options.defaultValue ?? null
    ) as DatePickerValue,
    hinted: false,
  }
}

const syncDatePickerState = (options: DatePickerOptions) => ({
  ...calendarSync(options as CalendarOptions),
  ...settings(options),
  ...(options.defaultValue === undefined
    ? {}
    : {
        initial: normalizeValue(
          calendarSettings(options as CalendarOptions).mode,
          options.defaultValue
        ) as DatePickerValue,
      }),
  ...(options.open === undefined ? {} : { open: options.open }),
})

export {
  datePickerApi,
  type DatePickerApi,
  dateAt,
  initialDatePickerState,
  invalidAt,
  nameAt,
  type State,
  syncDatePickerState,
  textOf,
  valueKey,
}
