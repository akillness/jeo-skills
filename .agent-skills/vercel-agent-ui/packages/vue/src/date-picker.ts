import type {
  Anchor,
  ChangeDetails,
  DismissAttemptDetails,
  Side,
} from "@ui-sdk/core"
import type { DateMatchers, ISOMonth } from "@ui-sdk/core/calendar"
import {
  datePicker as datePickerPrimitive,
  type DatePickerContentProps,
  type DatePickerController,
  type DatePickerDismissReason,
  type DatePickerMode,
  type DatePickerMonthChangeReason,
  type DatePickerOpenChangeReason,
  type DatePickerValue,
  type DatePickerValueChangeReason,
} from "@ui-sdk/core/date-picker"
import {
  defineComponent,
  Fragment,
  h,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import {
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
} from "./calendar"
import { CalendarKey, type CalendarHandle } from "./calendar-context"
import { slotContent } from "./children"
import { useFieldControl } from "./field-context"
import {
  containerProp,
  renderPopup,
  sheetViewport,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  useHandle,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"
import { readOnlyOf } from "./text-control"

// Where the popup renders. Set on <DatePicker> or <DatePickerContent>.
const ContainerKey: InjectionKey<() => PopupContainer> = Symbol(
  "date-picker-container"
)

const useDatePicker = () => useHandle(datePickerPrimitive)

const parts = createParts(datePickerPrimitive, { clear: "button" })

const datePickerValue = {
  type: null as unknown as PropType<DatePickerValue>,
  default: undefined,
}

/**
 * The root, and the hidden inputs that submit ISO dates. Without content it
 * renders an input, or two in range mode, the trigger and the popup.
 * @stable
 */
const DatePicker = withElement(
  "div",
  defineComponent({
    name: "DatePicker",
    inheritAttrs: false,
    props: {
      mode: String as PropType<DatePickerMode>,
      value: datePickerValue,
      modelValue: datePickerValue,
      defaultValue: datePickerValue,
      month: String as PropType<ISOMonth>,
      defaultMonth: String as PropType<ISOMonth>,
      open: optionalBoolean,
      defaultOpen: optionalBoolean,
      closeOnSelect: optionalBoolean,
      presentation: String as PropType<"auto" | "popover" | "sheet">,
      dismissible: optionalBoolean,
      min: String,
      max: String,
      unavailable: null as unknown as PropType<DateMatchers>,
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      months: Number,
      pageBy: String as PropType<"month" | "page">,
      locale: String,
      weekStartsOn: Number,
      weekdayFormat: String as PropType<"narrow" | "short" | "long">,
      monthFormat: String as PropType<"narrow" | "short" | "long">,
      fixedWeeks: optionalBoolean,
      showOutsideDays: optionalBoolean,
      today: String,
      timeZone: String,
      minDays: Number,
      maxDays: Number,
      allowUnavailable: optionalBoolean,
      name: String,
      startName: String,
      endName: String,
      form: String,
      required: optionalBoolean,
      // Renders the popup into this element instead of in place.
      container: containerProp,
      controller: Object as PropType<DatePickerController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: DatePickerValue) => true,
      "update:modelValue": (_value: DatePickerValue) => true,
      valueChange: (
        _value: DatePickerValue,
        _details: ChangeDetails<DatePickerValueChangeReason>
      ) => true,
      "update:month": (_month: ISOMonth) => true,
      monthChange: (
        _month: ISOMonth,
        _details: ChangeDetails<DatePickerMonthChangeReason>
      ) => true,
      "update:open": (_open: boolean) => true,
      openChange: (
        _open: boolean,
        _details: ChangeDetails<DatePickerOpenChangeReason>
      ) => true,
      openChangeComplete: (_open: boolean) => true,
      dismissAttempt: (
        _details: DismissAttemptDetails<DatePickerDismissReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof datePickerPrimitive, "root">,
    setup(props, { slots, attrs, emit }) {
      const field = useFieldControl()
      const picker = usePrimitive(datePickerPrimitive, () => ({
        mode: props.mode,
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        month: props.month,
        defaultMonth: props.defaultMonth,
        open: props.open,
        defaultOpen: props.defaultOpen,
        closeOnSelect: props.closeOnSelect,
        presentation: props.presentation,
        dismissible: props.dismissible,
        min: props.min,
        max: props.max,
        unavailable: props.unavailable,
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
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
        // The change events run first, so canceling one also keeps v-model as it was.
        onValueChange: (
          value: DatePickerValue,
          details: ChangeDetails<DatePickerValueChangeReason>
        ) => {
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onMonthChange: (
          month: ISOMonth,
          details: ChangeDetails<DatePickerMonthChangeReason>
        ) => {
          emit("monthChange", month, details)
          if (!details.canceled) {
            emit("update:month", month)
          }
        },
        onOpenChange: (
          open: boolean,
          details: ChangeDetails<DatePickerOpenChangeReason>
        ) => {
          emit("openChange", open, details)
          if (!details.canceled) {
            emit("update:open", open)
          }
        },
        onOpenChangeComplete: (open: boolean) =>
          emit("openChangeComplete", open),
        onDismissAttempt: (
          details: DismissAttemptDetails<DatePickerDismissReason>
        ) => emit("dismissAttempt", details),
      }))
      // Every Calendar part works inside the content, on the date picker's calendar.
      provide(CalendarKey, picker as unknown as CalendarHandle)
      provide(ContainerKey, () => props.container)
      const defaultContent = () => [
        h(DatePickerInput),
        root.state.mode === "range" ? h(DatePickerInput, { end: true }) : null,
        h(DatePickerTrigger),
        h(DatePickerContent),
      ]
      // A hidden input for each date that has a name to submit under.
      const hiddenInputs = () => {
        const fieldName = field?.name()
        const range = root.state.mode === "range"
        const submitsStart = range
          ? (props.startName ?? props.name ?? fieldName)
          : (props.name ?? fieldName)
        const submitsEnd = range && (props.endName ?? props.name ?? fieldName)
        return h(Fragment, [
          submitsStart
            ? h("input", picker.slot("hidden-input", { id: "start" }))
            : null,
          submitsEnd
            ? h("input", picker.slot("hidden-input", { end: true, id: "end" }))
            : null,
        ])
      }
      // Typed ahead, since its default content and hidden inputs read its state.
      const root: ReturnType<
        typeof usePart<typeof datePickerPrimitive, "root">
      > = usePart(picker, "root", undefined, undefined, {
        tag: "div",
        children: (state) =>
          slotContent(slots.default, { state }) ?? defaultContent(),
        hidden: hiddenInputs,
      })
      return root
    },
  })
)

/**
 * A text input that reads a date typed in the page's language on Enter or
 * blur. `end` makes it a range's end.
 * @stable
 */
const DatePickerInput = withElement(
  "input",
  defineComponent({
    name: "DatePickerInput",
    inheritAttrs: false,
    props: { end: optionalBoolean },
    slots: Object as PartSlots<typeof datePickerPrimitive, "input">,
    setup(props) {
      const field = useFieldControl()
      const part = () => ({ end: props.end, id: props.end ? "end" : "start" })
      // The core writes the text as it changes. Vue sets the same text, which the server renders.
      return usePart(datePickerPrimitive, "input", part, undefined, {
        tag: "input",
        // A field names and describes the start input.
        extend: (input) => (field && !props.end ? field.props(input) : input),
      })
    },
  })
)

const calendarIcon = () =>
  h(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "aria-hidden": "true",
    },
    [
      h("rect", { x: "2", y: "3", width: "12", height: "11", rx: "1.5" }),
      h("path", { d: "M2 6.5h12M5.5 1.5v3M10.5 1.5v3" }),
    ]
  )

/**
 * Opens the calendar. Named "Choose date" and the date chosen; pass `aria-label` in another language.
 * @stable
 */
const DatePickerTrigger = withElement(
  "button",
  defineComponent({
    name: "DatePickerTrigger",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof datePickerPrimitive, "trigger">,
    setup(_, { slots }) {
      return usePart(datePickerPrimitive, "trigger", undefined, undefined, {
        tag: "button",
        children: (state) =>
          slotContent(slots.default, { state }) ?? calendarIcon(),
      })
    },
  })
)

/**
 * The popup. Without content it renders Previous, the heading, Next and a
 * grid for each month; every Calendar part works inside it.
 * @stable
 */
const DatePickerContent = withElement(
  "div",
  defineComponent({
    name: "DatePickerContent",
    inheritAttrs: false,
    props: {
      side: String as PropType<Side>,
      align: String as PropType<"start" | "center" | "end">,
      sideOffset: Number,
      alignOffset: Number,
      collisionPadding: Number,
      arrowPadding: Number,
      anchor: [Object, String] as PropType<Anchor | string | null>,
      finalFocus: [String, Object, Function] as PropType<
        DatePickerContentProps["finalFocus"]
      >,
      keepMounted: optionalBoolean,
      // Renders the popup into this element instead of in place.
      container: containerProp,
    },
    slots: Object as PartSlots<typeof datePickerPrimitive, "content">,
    setup(props, { slots }) {
      const picker = useDatePicker()
      const fromRoot = inject(ContainerKey, () => undefined)
      const target = usePopupContainer(() => props.container ?? fromRoot())
      const content = () => {
        const { container, ...content } = props
        return content
      }
      const defaultContent = () => [
        h("div", [h(CalendarPrevious), h(CalendarHeading), h(CalendarNext)]),
        ...Array.from({ length: picker.state.months }, (_, offset) =>
          h(CalendarGrid, { key: offset, offset })
        ),
      ]
      const part = usePart(picker, "content", content, undefined, {
        tag: "div",
        children: (state) =>
          slotContent(slots.default, { state }) ?? defaultContent(),
      })
      return () => {
        const element = part()
        if (!element) {
          return null
        }
        return renderPopup(sheetViewport(picker, element), target())
      }
    },
  })
)

/**
 * The format to type, like "MM/DD/YYYY". The inputs are described by it.
 * @stable
 */
const DatePickerHint = withElement(
  "span",
  defineComponent({
    name: "DatePickerHint",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof datePickerPrimitive, "hint">,
    setup(_, { slots }) {
      return usePart(datePickerPrimitive, "hint", undefined, undefined, {
        tag: "span",
        children: (state) =>
          slotContent(slots.default, { state }) ?? state.placeholder,
      })
    },
  })
)

/**
 * Clears the value and focuses the input.
 * @stable
 */
const DatePickerClear = parts.Clear

/**
 * Selects the value it holds, like the last 7 days.
 * @stable
 */
const DatePickerPreset = withElement(
  "button",
  defineComponent({
    name: "DatePickerPreset",
    inheritAttrs: false,
    props: {
      value: {
        type: null as unknown as PropType<DatePickerValue>,
        required: true,
      },
    },
    slots: Object as PartSlots<typeof datePickerPrimitive, "preset">,
    setup(props) {
      // Keyed by its value, which may be a range.
      const part = () => ({
        value: props.value,
        id: JSON.stringify(props.value),
      })
      return usePart(datePickerPrimitive, "preset", part, undefined, "button")
    },
  })
)

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
