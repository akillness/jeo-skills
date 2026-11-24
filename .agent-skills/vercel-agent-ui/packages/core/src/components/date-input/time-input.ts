// A time input: a time of day typed in segments, hours and minutes, with
// seconds and AM/PM when shown. It's Date Input with a time alone. Values are
// the strings `<input type="time">` submits, like `"14:30"`.
import {
  dateInputApi,
  initialDateInputState,
  optionKinds,
  syncDateInputState,
  type DateInputChangeOptions,
  type DateInputValueChangeReason,
} from "./date-input-api"
import { dateInputSlots } from "./date-input-parts"
import type { HourCycle } from "./date-input-model"
import { createController } from "../../foundation/kernel/controller"
import type { ChangeDetails } from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

/**
 * The smallest unit a time input shows.
 * @stable
 */
type TimeInputGranularity = "hour" | "minute" | "second"

/**
 * Why a time input's value wants to change.
 * @stable
 */
type TimeInputValueChangeReason = DateInputValueChangeReason

/**
 * Options for every write method on a controller.
 * @stable
 */
type TimeInputChangeOptions = DateInputChangeOptions

/**
 * Drives a time input from anywhere. Pass it as the `controller` option.
 * @stable
 */
function createTimeInputController() {
  return createController<{
    /** The value, or `null` while empty or partly filled. */
    getValue: () => string | null
    /** Sets the value. Returns false when it isn't a time, or when canceled. */
    setValue: (
      value: string | null,
      options?: TimeInputChangeOptions
    ) => boolean
    /** Empties every segment. */
    clear: (options?: TimeInputChangeOptions) => boolean
    /** Focuses a segment, like `"minute"`, or the first one. */
    focus: (segment?: string) => void
  }>()
}

/**
 * A controller from `createTimeInputController()`. Pass it as the `controller` option.
 * @stable
 */
type TimeInputController = ReturnType<typeof createTimeInputController>

/**
 * The options `timeInput` takes. A component takes them as props on its root.
 * @stable
 */
type TimeInputOptions = {
  /** The value: a time like `"14:30"`, or `"14:30:15"` with seconds, or `null`. Pass it to control the input. */
  value?: string | null
  /** The value it starts with, when uncontrolled, and goes back to when its form resets. */
  defaultValue?: string | null
  /**
   * Runs when the value wants to change: once every segment holds something,
   * and again with `null` when one is emptied. `details.cancel()` keeps the value.
   */
  onValueChange?: (
    value: string | null,
    details: ChangeDetails<TimeInputValueChangeReason>
  ) => void
  /**
   * The smallest unit it shows.
   * @defaultValue "minute"
   */
  granularity?: TimeInputGranularity
  /** A 12 or 24 hour clock. Defaults to the locale's. */
  hourCycle?: HourCycle
  /** The earliest time, like `"09:00"`. A time before it is invalid. */
  min?: string
  /** The latest time, like `"17:30"`. A time after it is invalid. */
  max?: string
  /** The language whose separators and clock it shows. Defaults to the page's. */
  locale?: string
  /** Whether it can't be used. */
  disabled?: boolean
  /** Whether the value can be seen but not changed. */
  readOnly?: boolean
  /** Whether a time must be entered before its form submits. */
  required?: boolean
  /** The name the value submits under. */
  name?: string
  /** The id of the form it belongs to, when it isn't inside it. */
  form?: string
  /** Drives it from anywhere. Create one with `createTimeInputController()`. */
  controller?: TimeInputController
} & PrimitiveOptions

const { unavailable: _, ...timeOptionKinds } = optionKinds

const timeInputPrimitive = /* @__PURE__ */ definePrimitive({
  name: "time-input",
  options: timeOptionKinds,
  state: (options: TimeInputOptions) => initialDateInputState("time", options),
  sync: (options) => syncDateInputState("time", options),
  api: dateInputApi,
  slots: (slot) => dateInputSlots(slot),
  agent: { actions: ["setValue", "clear"] },
})

/**
 * The type of `timeInput`.
 * @stable
 */
interface TimeInputPrimitive extends Named<typeof timeInputPrimitive> {}

/**
 * The time input primitive, with the slots `root`, `segment` and `hidden-input`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const timeInput: TimeInputPrimitive = timeInputPrimitive

export {
  createTimeInputController,
  timeInput,
  type TimeInputChangeOptions,
  type TimeInputController,
  type TimeInputGranularity,
  type TimeInputOptions,
  type TimeInputPrimitive,
  type TimeInputValueChangeReason,
}
export type { DateInputApi as TimeInputApi } from "./date-input-api"
export type {
  DateInputSegmentData as TimeInputSegmentData,
  DateInputSegmentType as TimeInputSegmentType,
  HourCycle,
} from "./date-input-model"
export type {
  DateInputSegmentProps as TimeInputSegmentProps,
  DateInputSegmentState as TimeInputSegmentState,
  DateInputState as TimeInputState,
} from "./date-input-parts"
