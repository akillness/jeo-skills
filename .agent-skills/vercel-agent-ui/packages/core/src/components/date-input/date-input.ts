// A date, or a date and time, typed in segments the locale orders. Values are
// the ISO strings `<input type="date">` and `datetime-local` submit. Time
// Input, in time-input.ts, is the same input with a time alone.
import {
  dateInputApi,
  initialDateInputState,
  optionKinds,
  syncDateInputState,
  type DateInputChangeOptions,
  type DateInputValueChangeReason,
} from "./date-input-api"
import { dateInputSlots } from "./date-input-parts"
import type { DateInputGranularity, HourCycle } from "./date-input-model"
import type { DateMatchers } from "../calendar/calendar-model"
import { createController } from "../../foundation/kernel/controller"
import type { ChangeDetails } from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

/**
 * Drives a date or time input from anywhere. Pass it as the `controller` option.
 * @stable
 */
function createDateInputController() {
  return createController<{
    /** The value, or `null` while empty or partly filled. */
    getValue: () => string | null
    /** Sets the value. Returns false when it isn't a value the input can show, or when canceled. */
    setValue: (
      value: string | null,
      options?: DateInputChangeOptions
    ) => boolean
    /** Empties every segment. */
    clear: (options?: DateInputChangeOptions) => boolean
    /** Focuses a segment, like `"month"`, or the first one. */
    focus: (segment?: string) => void
  }>()
}

/**
 * A controller from `createDateInputController()`. Pass it as the `controller` option.
 * @stable
 */
type DateInputController = ReturnType<typeof createDateInputController>

/**
 * The options `dateInput` takes. A component takes them as props on its root.
 * @stable
 */
type DateInputOptions = {
  /**
   * The value: an ISO date like `"2026-11-02"`, with a time granularity a date and time like `"2026-11-02T14:30"`, or `null`. Pass it to control the input.
   */
  value?: string | null
  /** The value it starts with, when uncontrolled, and goes back to when its form resets. */
  defaultValue?: string | null
  /**
   * Runs when the value wants to change: once every segment holds something,
   * and again with `null` when one is emptied. `details.cancel()` keeps the value.
   */
  onValueChange?: (
    value: string | null,
    details: ChangeDetails<DateInputValueChangeReason>
  ) => void
  /**
   * The smallest unit it shows. `"day"` shows a date, and `"hour"`, `"minute"` or `"second"` add the time down to it.
   * @defaultValue "day"
   */
  granularity?: DateInputGranularity
  /** A 12 or 24 hour clock for the time. Defaults to the locale's. */
  hourCycle?: HourCycle
  /** The earliest value, as an ISO date or date and time. A value before it is invalid. */
  min?: string
  /** The latest value. A date alone takes any time that day. A value after it is invalid. */
  max?: string
  /** Dates that can't be chosen, as in Calendar: ISO dates, `{ from, to }` ranges, weekdays or a function. A value on one is invalid. */
  unavailable?: DateMatchers
  /** The language whose order, separators and clock it shows. Defaults to the page's. */
  locale?: string
  /** Whether it can't be used. */
  disabled?: boolean
  /** Whether the value can be seen but not changed. */
  readOnly?: boolean
  /** Whether a value must be entered before its form submits. */
  required?: boolean
  /** The name the value submits under. */
  name?: string
  /** The id of the form it belongs to, when it isn't inside it. */
  form?: string
  /** Drives it from anywhere. Create one with `createDateInputController()`. */
  controller?: DateInputController
} & PrimitiveOptions

const dateInputPrimitive = /* @__PURE__ */ definePrimitive({
  name: "date-input",
  options: optionKinds,
  state: (options: DateInputOptions) => initialDateInputState("date", options),
  sync: (options) => syncDateInputState("date", options),
  api: dateInputApi,
  slots: (slot) => dateInputSlots(slot),
  agent: { actions: ["setValue", "clear"] },
})

/**
 * The type of `dateInput`.
 * @stable
 */
interface DateInputPrimitive extends Named<typeof dateInputPrimitive> {}

/**
 * The date input primitive, with the slots `root`, `segment` and `hidden-input`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const dateInput: DateInputPrimitive = dateInputPrimitive

export {
  createDateInputController,
  dateInput,
  type DateInputController,
  type DateInputOptions,
  type DateInputPrimitive,
}
export type {
  DateInputApi,
  DateInputChangeOptions,
  DateInputValueChangeReason,
} from "./date-input-api"
export type {
  DateInputGranularity,
  DateInputSegmentData,
  DateInputSegmentType,
  HourCycle,
} from "./date-input-model"
export type {
  DateInputSegmentProps,
  DateInputSegmentState,
  DateInputState,
} from "./date-input-parts"
export type { DateMatcher, DateMatchers } from "../calendar/calendar"
