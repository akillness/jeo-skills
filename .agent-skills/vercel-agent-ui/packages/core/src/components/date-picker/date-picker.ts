// A date picker: a text input that reads a date typed in the page's language,
// and a button that opens a calendar in a popup. The grid is Calendar's, with
// its keys and range picking, and the popup is the one Popover uses. Values
// are ISO strings, as in Calendar. This module is the public API and assembles
// the primitive. State and the API live in date-picker-api.ts, and parts and
// attributes in date-picker-parts.ts.
import type { ISOMonth } from "../calendar/calendar-model"
import type {
  CalendarMonthChangeReason,
  CalendarOptions,
} from "../calendar/calendar"
import { type ISODate } from "../../foundation/date/plain-date"
import {
  type PortalProps,
  type PositionProps,
} from "../../foundation/platform/position"
import {
  type PopupFocusTarget,
  type PopupResult,
} from "../../foundation/popups/popup"
import { type DismissOptions } from "../../foundation/popups/dismissal"
import { type PresentationSetting } from "../../foundation/popups/presentation"
import type {
  ChangeDetails,
  ChangeOptions,
  DismissAttemptReason,
} from "../../foundation/kernel/details"
import { createController } from "../../foundation/kernel/controller"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type { Named } from "../../foundation/kernel/primitive-types"
import {
  datePickerApi,
  initialDatePickerState,
  syncDatePickerState,
} from "./date-picker-api"
import { datePickerSlots } from "./date-picker-parts"

/**
 * How many dates a date picker selects: one, or a range from a start to an end.
 * @stable
 */
type DatePickerMode = "single" | "range"

/**
 * A date picker's value: an ISO date, a `[start, end]` range, or `null`.
 * @stable
 */
type DatePickerValue = ISODate | [ISODate, ISODate] | null

/**
 * Why a date picker's value wants to change.
 * @stable
 */
type DatePickerValueChangeReason =
  | "item-press"
  | "input-commit"
  | "preset-press"
  | "clear-press"
  | "reset"
  | "restore"
  | "imperative"

/**
 * Why the months a date picker's calendar shows want to change.
 * @stable
 */
type DatePickerMonthChangeReason =
  CalendarMonthChangeReason | "input-commit" | "preset-press"

/**
 * Why a date picker's popup opened or closed.
 * @stable
 */
type DatePickerOpenChangeReason =
  | "trigger-press"
  | "item-press"
  | "preset-press"
  | "outside-press"
  | "escape-key"
  | "focus-out"
  | "window-blur"
  | "close-press"
  | "back"
  | "swipe"
  | "imperative"

/**
 * The dismissals `dismissible` refuses that `onDismissAttempt` hears about.
 * @stable
 */
type DatePickerDismissReason = Extract<
  DatePickerOpenChangeReason,
  DismissAttemptReason
>

/**
 * Options for every write method on a controller.
 * @stable
 */
type DatePickerChangeOptions<Reason extends string = string> =
  ChangeOptions<Reason>

/**
 * Drives a date picker from anywhere. Pass it as the `controller` option.
 * @stable
 */
function createDatePickerController() {
  return createController<{
    /** The selected value: an ISO date, a `[start, end]` range, or `null`. */
    getValue: () => DatePickerValue
    /** Selects a value. Returns false when canceled, unchanged, disabled, read-only, or holding a date people can't pick, like one past `max`. */
    setValue: (
      value: DatePickerValue,
      options?: DatePickerChangeOptions<DatePickerValueChangeReason>
    ) => boolean
    /** Selects nothing, as the Clear part does. Returns false when canceled or unchanged. */
    clear: (
      options?: DatePickerChangeOptions<DatePickerValueChangeReason>
    ) => boolean
    /** The first month the calendar shows, like `"2026-10"`. */
    getMonth: () => ISOMonth
    /** Shows a month first. Returns false when canceled or unchanged. */
    setMonth: (
      month: ISOMonth,
      options?: DatePickerChangeOptions<DatePickerMonthChangeReason>
    ) => boolean
    /** Shows the months before, as the Previous part does. */
    previous: (
      options?: DatePickerChangeOptions<DatePickerMonthChangeReason>
    ) => boolean
    /** Shows the months after, as the Next part does. */
    next: (
      options?: DatePickerChangeOptions<DatePickerMonthChangeReason>
    ) => boolean
    /** Focuses a date in the open calendar, turning the months to show it, or the date with the tab stop. */
    focus: (date?: ISODate) => void
    /** Whether the popup is open. */
    isOpen: () => boolean
    /**
     * Opens or closes the popup.
     * Returns false when the change was canceled or it was already open or closed.
     */
    setOpen: (
      open: boolean,
      options?: DatePickerChangeOptions<DatePickerOpenChangeReason>
    ) => boolean
    /**
     * Opens the popup, and resolves once it closes, with why and how. Resolves exactly once and never
     * rejects: on the next close from any source, when `signal` aborts, or with reason `"unmount"`
     * when the date picker leaves the page.
     */
    open: (
      options?: DatePickerChangeOptions<DatePickerOpenChangeReason> & {
        /** Closes the popup, with reason `"imperative"`, when it aborts. An already aborted signal never opens it. */
        signal?: AbortSignal
      }
    ) => Promise<PopupResult<DatePickerOpenChangeReason, never>>
    /** Closes the popup. Returns false when the close was canceled or it was already closed. */
    close: (
      options?: DatePickerChangeOptions<DatePickerOpenChangeReason>
    ) => boolean
    /**
     * Opens the popup if it's closed, and closes it if it's open.
     * Returns false when the change was canceled.
     */
    toggle: (
      options?: DatePickerChangeOptions<DatePickerOpenChangeReason>
    ) => boolean
  }>()
}

/**
 * A controller from `createDatePickerController()`. Pass it as the `controller` option.
 * @stable
 */
type DatePickerController = ReturnType<typeof createDatePickerController>

/**
 * The options `datePicker` takes. A component takes them as props on its root.
 * @stable
 */
type DatePickerOptions = Omit<
  CalendarOptions,
  | "mode"
  | "value"
  | "defaultValue"
  | "onValueChange"
  | "onMonthChange"
  | "controller"
  | "deselectable"
  | "onFocusedChange"
  | "onAnchorChange"
> &
  PortalProps & {
    /**
     * How many dates it selects: one, or a range from a start to an end, with an input for each.
     * @defaultValue "single"
     */
    mode?: DatePickerMode
    /** The selected value: an ISO date, `[start, end]` in range mode, or `null`. Pass it to control the date picker. */
    value?: DatePickerValue
    /** The value it starts with, when uncontrolled, and goes back to when its form resets. */
    defaultValue?: DatePickerValue
    /**
     * Runs when a date is picked in the calendar (`"item-press"`), a typed date
     * is committed on Enter or blur (`"input-commit"`), a preset or Clear is
     * pressed, the form resets, or a controller sets it. A range changes once
     * both ends are set. `details.cancel()` keeps the value.
     */
    onValueChange?: (
      value: DatePickerValue,
      details: ChangeDetails<DatePickerValueChangeReason>
    ) => void
    /** Runs when the months the calendar shows want to change, as in Calendar, or a typed date or a preset turns them. */
    onMonthChange?: (
      month: ISOMonth,
      details: ChangeDetails<DatePickerMonthChangeReason>
    ) => void
    /** Whether the popup is open. Pass it to control the popup. */
    open?: boolean
    /**
     * Whether the popup starts open, when uncontrolled.
     * @defaultValue false
     */
    defaultOpen?: boolean
    /** Runs when the popup wants to open or close. `details.reason` says why, and `details.cancel()` stops it. */
    onOpenChange?: (
      open: boolean,
      details: ChangeDetails<DatePickerOpenChangeReason>
    ) => void
    /** Runs once the popup has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /**
     * Whether picking a date, or a range's end, or pressing a preset closes the popup.
     * @defaultValue true
     */
    closeOnSelect?: boolean
    /**
     * How the popup presents. `"sheet"` slides it up from the bottom of the screen, and `"auto"` does that on small touch screens.
     * @defaultValue "popover"
     */
    presentation?: PresentationSetting<"popover">
    /** The name the date submits under, as an ISO date. In range mode, both ends submit under it unless `startName` and `endName` are set. */
    name?: string
    /** The name a range's start submits under. */
    startName?: string
    /** The name a range's end submits under. */
    endName?: string
    /** The id of the form it belongs to, when it isn't inside it. */
    form?: string
    /** Whether a date must be entered before its form submits. */
    required?: boolean
    /** Drives it from anywhere. Create one with `createDatePickerController()`. */
    controller?: DatePickerController
  } & DismissOptions<DatePickerOpenChangeReason>

/**
 * What `render` functions and state-based class names of the root receive.
 * @stable
 */
type DatePickerState = {
  /** The selected value. */
  value: DatePickerValue
  /** How it selects. */
  mode: DatePickerMode
  /** Whether the popup is open. */
  open: boolean
  /** Whether it can't be used. */
  disabled: boolean
  /** Whether dates can be seen but not changed. */
  readOnly: boolean
  /** Whether an input holds text that isn't a date that can be picked. */
  invalid: boolean
}

/**
 * What `render` functions and state-based class names of an input receive.
 * @stable
 */
type DatePickerInputState = {
  /** Whether its text isn't a date that can be picked, after Enter or blur. */
  invalid: boolean
  /** Whether it can't be used. */
  disabled: boolean
  /** Whether its text can't be changed. */
  readOnly: boolean
}

/**
 * What `render` functions and state-based class names of the trigger receive.
 * @stable
 */
type DatePickerTriggerState = {
  /** Whether the popup is open. */
  open: boolean
  /** Whether it can't be pressed. */
  disabled: boolean
}

/**
 * What `render` functions and state-based class names of the content receive.
 * @stable
 */
type DatePickerContentState = {
  /** Whether the popup is open. False while it animates out. */
  open: boolean
  /** How it presents this time it's open. */
  presentation: "popover" | "sheet"
}

/**
 * What `render` functions and state-based class names of the format hint receive.
 * @stable
 */
type DatePickerHintState = {
  /** The format, with a letter for each digit, like "MM/DD/YYYY", "TT.MM.JJJJ" in German. */
  placeholder: string
  /** December 31 of this year in the format, like "12/31/2026". */
  example: string
}

/**
 * What `render` functions and state-based class names of a preset receive.
 * @stable
 */
type DatePickerPresetState = {
  /** Whether its value is the one selected. */
  selected: boolean
  /** Whether it can't be pressed. */
  disabled: boolean
}

/**
 * What `render` functions and state-based class names of Clear receive.
 * @stable
 */
type DatePickerClearState = {
  /** Whether there's nothing to clear. */
  empty: boolean
  /** Whether it can't be pressed. */
  disabled: boolean
}

/**
 * The props the `input` and `hidden-input` slots take.
 * @stable
 */
type DatePickerInputProps = {
  /**
   * Whether it's a range's end. The input without it holds the start, or the date.
   * @defaultValue false
   */
  end?: boolean
}

/**
 * The props the `content` slot takes.
 * @stable
 */
type DatePickerContentProps = PositionProps &
  PortalProps & {
    /**
     * Which side of the input the popup opens on.
     * @defaultValue "bottom"
     */
    side?: PositionProps["side"]
    /**
     * How the popup lines up with the input along that side.
     * @defaultValue "start"
     */
    align?: PositionProps["align"]
    /**
     * Gap between the input and the popup, in pixels.
     * @defaultValue 4
     */
    sideOffset?: number
    /**
     * Shift along the input, in pixels.
     * @defaultValue 0
     */
    alignOffset?: number
    /**
     * Where focus goes when the popup closes while focus is inside it.
     * @defaultValue "trigger"
     */
    finalFocus?: PopupFocusTarget
    /**
     * Whether the popup stays in the page, hidden, while closed. Its content keeps its state between opens.
     * @defaultValue false
     */
    keepMounted?: boolean
  }

/**
 * The props the `preset` slot takes.
 * @stable
 */
type DatePickerPresetProps = {
  /** The value it selects: an ISO date, or `[start, end]` in range mode. */
  value: DatePickerValue
}

const datePickerPrimitive = /* @__PURE__ */ definePrimitive({
  name: "date-picker",
  options: {
    month: "string",
    defaultMonth: "string",
    min: "string",
    max: "string",
    unavailable: "list",
    disabled: "boolean",
    readOnly: "boolean",
    months: "number",
    pageBy: "string",
    locale: "string",
    weekStartsOn: "number",
    weekdayFormat: "string",
    monthFormat: "string",
    fixedWeeks: "boolean",
    showOutsideDays: "boolean",
    today: "string",
    timeZone: "string",
    minDays: "number",
    maxDays: "number",
    allowUnavailable: "boolean",
    container: "value",
    mode: "string",
    value: "list",
    defaultValue: "list",
    onValueChange: "callback",
    onMonthChange: "callback",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onOpenChangeComplete: "callback",
    closeOnSelect: "boolean",
    presentation: "string",
    name: "string",
    startName: "string",
    endName: "string",
    form: "string",
    required: "boolean",
    controller: "value",
    dismissible: "boolean",
    onDismissAttempt: "callback",
  },
  state: initialDatePickerState,
  controlled: ["value", "month", "open"],
  sync: syncDatePickerState,
  api: datePickerApi,
  // An arrow function, so TypeScript infers the slot names before it checks the parts.
  slots: (slot) => datePickerSlots(slot),
  agent: {
    actions: ["setOpen", "setValue", "clear", "setMonth", "previous", "next"],
    // Its value is a date, not an item, so a step never opens the calendar to look for one.
    items: () => [],
  },
})

/**
 * The type of `datePicker`.
 * @stable
 */
interface DatePickerPrimitive extends Named<typeof datePickerPrimitive> {}

/**
 * The date picker primitive, with the slots `root`, `input`, `hidden-input`,
 * `trigger`, `content`, `viewport`, `hint`, `clear` and `preset`, and every
 * part of Calendar but its root, which go inside the content.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const datePicker: DatePickerPrimitive = datePickerPrimitive

export {
  createDatePickerController,
  datePicker,
  type DatePickerChangeOptions,
  type DatePickerClearState,
  type DatePickerContentProps,
  type DatePickerContentState,
  type DatePickerController,
  type DatePickerDismissReason,
  type DatePickerHintState,
  type DatePickerInputProps,
  type DatePickerInputState,
  type DatePickerMode,
  type DatePickerMonthChangeReason,
  type DatePickerOpenChangeReason,
  type DatePickerOptions,
  type DatePickerPresetProps,
  type DatePickerPresetState,
  type DatePickerPrimitive,
  type DatePickerState,
  type DatePickerTriggerState,
  type DatePickerValue,
  type DatePickerValueChangeReason,
}
// Calendar's types that its options and the calendar parts in its popup use.
export type {
  CalendarDayState,
  CalendarGridCell,
  CalendarGridState,
  CalendarHeadingState,
  CalendarSelectOption,
  CalendarSelectState,
  CalendarStepState,
  CalendarWeekdayState,
  DateMatcher,
  DateMatchers,
  ISOMonth,
} from "../calendar/calendar"
export type { DatePickerApi } from "./date-picker-api"
