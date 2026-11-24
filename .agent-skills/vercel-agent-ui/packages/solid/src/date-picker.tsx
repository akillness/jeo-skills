import {
  datePicker as datePickerPrimitive,
  type DatePickerContentProps,
  type DatePickerContentState,
  type DatePickerHintState,
  type DatePickerInputProps,
  type DatePickerInputState,
  type DatePickerOptions,
  type DatePickerPresetState,
  type DatePickerState,
  type DatePickerValue,
} from "@ui-sdk/core/date-picker"
import {
  createContext,
  merge,
  omit,
  Repeat,
  Show,
  untrack,
  useContext,
  type ComponentProps,
} from "solid-js"
import {
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
} from "./calendar"
import {
  CalendarContext,
  monthCount,
  type CalendarHandle,
} from "./calendar-context"
import { joinField, useFieldControl } from "./field-context"
import {
  renderPopup,
  sheetViewport,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import { startingText } from "./text-control"
import {
  createParts,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(datePickerPrimitive, {
  trigger: "button",
  hint: "span",
  clear: "button",
})

type DatePickerContextValue = PrimitiveHandle<typeof datePickerPrimitive> & {
  field: ReturnType<typeof useFieldControl>
  // The root's `months`, which the content's default grids follow.
  months: () => number | undefined
}

const DatePickerContext = createContext<DatePickerContextValue | null>(null)
// Where the popup renders. Set on <DatePicker> or <DatePickerContent>.
const ContainerContext = createContext<() => PopupContainer>(() => undefined)

function useDatePicker(part: string) {
  const context = useContext(DatePickerContext)
  if (!context) {
    throw new Error(`${part} must be used inside <DatePicker>.`)
  }
  return context
}

type ButtonProps<State> = Omit<
  PartProps<"button", State>,
  "value" | "defaultValue" | "onChange"
>

/**
 * The root, and the hidden inputs that submit ISO dates. Without children it
 * renders an input, or two in range mode, the trigger and the popup.
 * @stable
 */
const DatePicker = /* @__PURE__ */ rootScope(function DatePicker(
  props: DatePickerOptions &
    Omit<
      PartProps<"div", DatePickerState>,
      "defaultValue" | "onChange" | "onSelect"
    >
) {
  const field = useFieldControl()
  const picker = usePrimitive(datePickerPrimitive, () => ({
    mode: props.mode,
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    month: props.month,
    defaultMonth: props.defaultMonth,
    onMonthChange: props.onMonthChange,
    open: props.open,
    defaultOpen: props.defaultOpen,
    onOpenChange: props.onOpenChange,
    onOpenChangeComplete: props.onOpenChangeComplete,
    closeOnSelect: props.closeOnSelect,
    presentation: props.presentation,
    dismissible: props.dismissible,
    onDismissAttempt: props.onDismissAttempt,
    min: props.min,
    max: props.max,
    unavailable: props.unavailable,
    disabled: props.disabled || field?.disabled(),
    readOnly: props.readOnly,
    months: props.months,
    pageBy: props.pageBy,
    locale: props.locale,
    weekStartsOn: props.weekStartsOn,
    weekdayFormat: props.weekdayFormat,
    monthFormat: props.monthFormat,
    fixedWeeks: props.fixedWeeks,
    showOutsideDays: props.showOutsideDays,
    today: props.today,
    timeZone: props.timeZone,
    minDays: props.minDays,
    maxDays: props.maxDays,
    allowUnavailable: props.allowUnavailable,
    name: props.name ?? field?.name(),
    startName: props.startName,
    endName: props.endName,
    form: props.form,
    required: props.required,
    controller: props.controller,
    debug: props.debug,
  }))
  const rest = omit(
    props,
    "mode",
    "value",
    "defaultValue",
    "onValueChange",
    "month",
    "defaultMonth",
    "onMonthChange",
    "open",
    "defaultOpen",
    "onOpenChange",
    "onOpenChangeComplete",
    "closeOnSelect",
    "presentation",
    "dismissible",
    "onDismissAttempt",
    "min",
    "max",
    "unavailable",
    "disabled",
    "readOnly",
    "months",
    "pageBy",
    "locale",
    "weekStartsOn",
    "weekdayFormat",
    "monthFormat",
    "fixedWeeks",
    "showOutsideDays",
    "today",
    "timeZone",
    "minDays",
    "maxDays",
    "allowUnavailable",
    "name",
    "startName",
    "endName",
    "form",
    "required",
    "container",
    "controller",
    "debug",
    "children"
  )
  // The handle with the field beside it. Its prototype keeps the handle's `state` getter live.
  const context: DatePickerContextValue = Object.assign(Object.create(picker), {
    field,
    months: () => props.months,
  })
  // Made in the body, as on the server, so hydration keys line up.
  const startInput = picker.slot("hidden-input", () => ({ id: "start" }))
  const endInput = picker.slot("hidden-input", () => ({ end: true, id: "end" }))
  // The content, then the hidden inputs after it. `props.children` is read
  // once: every read of a JSX children getter makes the parts again.
  const content = (current: DatePickerState) => {
    const range = () => current.mode === "range"
    // A hidden input renders only for an end that submits under a name.
    const submitsStart = () =>
      range()
        ? (props.startName ?? props.name ?? field?.name())
        : (props.name ?? field?.name())
    const submitsEnd = () =>
      range() && (props.endName ?? props.name ?? field?.name())
    const children = props.children
    return (
      <>
        {children === undefined ? (
          <>
            <DatePickerInput />
            <Show when={range()}>
              <DatePickerInput end />
            </Show>
            <DatePickerTrigger />
            <DatePickerContent />
          </>
        ) : typeof children === "function" ? (
          children(current)
        ) : (
          children
        )}
        <Show when={submitsStart()}>
          <input {...startInput} />
        </Show>
        <Show when={submitsEnd()}>
          <input {...endInput} />
        </Show>
      </>
    )
  }
  return (
    <DatePickerContext value={context}>
      {/* Every Calendar part works inside the content: the date picker's primitive has the same parts. */}
      <CalendarContext value={picker as unknown as CalendarHandle}>
        <ContainerContext value={() => props.container}>
          {usePart(
            picker,
            "root",
            undefined,
            merge(rest, { children: content }),
            "div"
          )}
        </ContainerContext>
      </CalendarContext>
    </DatePickerContext>
  )
})

/**
 * A text input that reads a date typed in the page's language on Enter or
 * blur. `end` makes it a range's end.
 * @stable
 */
function DatePickerInput(
  props: Omit<
    PartProps<"input", DatePickerInputState>,
    "value" | "defaultValue" | "children" | "readonly"
  > &
    DatePickerInputProps
) {
  const picker = useDatePicker("DatePickerInput")
  const part = () => ({ end: props.end, id: props.end ? "end" : "start" })
  const rest = startingText(omit(props, "end"))
  // Field names the first input.
  const field = untrack(() => props.end) ? null : picker.field
  return usePart(
    picker,
    "input",
    part,
    joinField(field, rest, "input"),
    "input"
  )
}

const calendarIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </svg>
)

/**
 * Opens the calendar. Named "Choose date" and the date chosen; pass `aria-label` in another language.
 * @stable
 */
function DatePickerTrigger(props: ComponentProps<typeof parts.Trigger>) {
  return (
    <parts.Trigger {...props}>{props.children ?? calendarIcon}</parts.Trigger>
  )
}

/**
 * The popup. Without children it renders Previous, the heading, Next and a
 * grid for each month; every Calendar part works inside it.
 * @stable
 */
function DatePickerContent(
  props: PartProps<"div", DatePickerContentState> & DatePickerContentProps
) {
  const picker = useDatePicker("DatePickerContent")
  const fromRoot = useContext(ContainerContext)
  const target = usePopupContainer(() => props.container ?? fromRoot())
  const content = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
    finalFocus: props.finalFocus,
    keepMounted: props.keepMounted,
  })
  const rest = omit(
    props,
    "side",
    "align",
    "sideOffset",
    "alignOffset",
    "collisionPadding",
    "arrowPadding",
    "anchor",
    "finalFocus",
    "keepMounted",
    "container"
  )
  const fallback = () => (
    <>
      <div>
        <CalendarPrevious />
        <CalendarHeading />
        <CalendarNext />
      </div>
      <Repeat count={monthCount(picker.months())}>
        {(offset) => <CalendarGrid offset={offset} />}
      </Repeat>
    </>
  )
  const body = merge(rest, {
    get children() {
      return props.children ?? fallback
    },
  })
  // Present, it renders into its container, in the viewport while it presents as a sheet.
  return (
    <Show when={picker.present("content", content)}>
      {renderPopup(
        () =>
          sheetViewport(picker, () =>
            usePart(picker, "content", content, body, "div")
          ),
        target
      )}
    </Show>
  )
}

/**
 * The format to type, like "MM/DD/YYYY". The inputs are described by it.
 * @stable
 */
function DatePickerHint(props: ComponentProps<typeof parts.Hint>) {
  return (
    <parts.Hint {...props}>
      {props.children ?? ((state: DatePickerHintState) => state.placeholder)}
    </parts.Hint>
  )
}

/**
 * Clears the value and focuses the input.
 * @stable
 */
const DatePickerClear = parts.Clear

/**
 * Selects the value it holds, like the last 7 days.
 * @stable
 */
function DatePickerPreset(
  props: ButtonProps<DatePickerPresetState> & {
    /** The value it selects: an ISO date, or `[start, end]` in range mode. */
    value: DatePickerValue
  }
) {
  // Keyed by its value, which may be a range.
  const part = () => ({ value: props.value, id: JSON.stringify(props.value) })
  return usePart(
    datePickerPrimitive,
    "preset",
    part,
    omit(props, "value"),
    "button"
  )
}

export {
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarMonthSelect,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  CalendarYearSelect,
} from "./calendar"
export { createDatePickerController } from "@ui-sdk/core/date-picker"
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
  DatePickerApi,
  DatePickerChangeOptions,
  DatePickerClearState,
  DatePickerContentProps,
  DatePickerContentState,
  DatePickerController,
  DatePickerDismissReason,
  DatePickerHintState,
  DatePickerInputProps,
  DatePickerInputState,
  DatePickerMode,
  DatePickerMonthChangeReason,
  DatePickerOpenChangeReason,
  DatePickerOptions,
  DatePickerPresetProps,
  DatePickerPresetState,
  DatePickerPrimitive,
  DatePickerState,
  DatePickerTriggerState,
  DatePickerValue,
  DatePickerValueChangeReason,
  ISOMonth,
} from "@ui-sdk/core/date-picker"

export {
  DatePicker,
  DatePickerClear,
  DatePickerContent,
  DatePickerHint,
  DatePickerInput,
  DatePickerPreset,
  DatePickerTrigger,
}
