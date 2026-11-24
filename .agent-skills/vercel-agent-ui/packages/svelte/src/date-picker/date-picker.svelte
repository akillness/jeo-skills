<!--
@component
The root, and the hidden inputs that submit ISO dates. Without content it
renders an input, or two in range mode, the trigger and the popup.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import type { ISOMonth } from "@ui-sdk/core/calendar"
  import {
    datePicker as datePickerPrimitive,
    type DatePickerMonthChangeReason,
    type DatePickerOpenChangeReason,
    type DatePickerOptions,
    type DatePickerState,
    type DatePickerValue,
    type DatePickerValueChangeReason,
  } from "@ui-sdk/core/date-picker"
  import { setContext } from "svelte"
  import { CalendarKey, type CalendarContext } from "../calendar/context"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import type { PopupContainer } from "../popup.svelte"
  import { readOnlyOf } from "../text-control"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import {
    ContainerKey,
    DatePickerKey,
    type DatePickerContext,
  } from "./context"
  import DatePickerContent from "./date-picker-content.svelte"
  import DatePickerInput from "./date-picker-input.svelte"
  import DatePickerTrigger from "./date-picker-trigger.svelte"

  type ValueDetails = ChangeDetails<DatePickerValueChangeReason>
  type MonthDetails = ChangeDetails<DatePickerMonthChangeReason>
  type OpenDetails = ChangeDetails<DatePickerOpenChangeReason>

  let {
    mode,
    value = $bindable(),
    defaultValue,
    onValueChange,
    month = $bindable(),
    defaultMonth,
    onMonthChange,
    open = $bindable(),
    defaultOpen,
    onOpenChange,
    onOpenChangeComplete,
    closeOnSelect,
    presentation,
    dismissible,
    onDismissAttempt,
    min,
    max,
    unavailable,
    disabled,
    readOnly,
    months,
    pageBy,
    locale,
    weekStartsOn,
    weekdayFormat,
    monthFormat,
    fixedWeeks,
    showOutsideDays,
    today,
    timeZone,
    minDays,
    maxDays,
    allowUnavailable,
    name,
    startName,
    endName,
    form,
    required,
    container,
    controller,
    debug,
    children,
    ...rest
  }: PartProps<"div", DatePickerState> &
    Omit<DatePickerOptions, "value" | "month" | "open" | "container"> & {
      /** The selected value: an ISO date, `[start, end]` in range mode, or `null`. Bind it with `bind:value` to control the date picker. */
      value?: DatePickerValue
      /** The first month the calendar shows, like `"2026-10"`. Bind it with `bind:month` to control the calendar. */
      month?: ISOMonth
      /** Whether the popup is open. Bind it with `bind:open` to control the popup. */
      open?: boolean
      /** Renders the popup into this element instead of in place. */
      container?: PopupContainer
    } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const picker = usePrimitive(datePickerPrimitive, () => ({
    id,
    mode,
    get value() {
      return value
    },
    defaultValue,
    onValueChange: (next: DatePickerValue, details: ValueDetails) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    get month() {
      return month
    },
    defaultMonth,
    onMonthChange: (next: ISOMonth, details: MonthDetails) => {
      onMonthChange?.(next, details)
      if (!details.canceled) {
        month = next
      }
    },
    get open() {
      return open
    },
    defaultOpen,
    onOpenChange: (next: boolean, details: OpenDetails) => {
      onOpenChange?.(next, details)
      if (!details.canceled) {
        open = next
      }
    },
    onOpenChangeComplete,
    closeOnSelect,
    presentation,
    dismissible,
    onDismissAttempt,
    min,
    max,
    unavailable,
    disabled: disabled || field?.disabled(),
    readOnly: readOnlyOf(readOnly, rest),
    months,
    pageBy,
    locale,
    weekStartsOn,
    weekdayFormat,
    monthFormat,
    fixedWeeks,
    showOutsideDays,
    today,
    timeZone,
    minDays,
    maxDays,
    allowUnavailable,
    name: name ?? field?.name(),
    startName,
    endName,
    form,
    required,
    controller,
    debug,
  }))
  // The handle's prototype keeps its `state` getter live.
  const context: DatePickerContext = Object.assign(Object.create(picker), {
    field,
    months: () => months,
  })
  setContext(DatePickerKey, context)
  // Every Calendar part works inside the content: the date picker's primitive has the same parts.
  setContext(CalendarKey, picker as unknown as CalendarContext)
  setContext(ContainerKey, () => container)
  const root = useHandlePart(picker, "root")
  const startInput = useHandlePart(picker, "hidden-input", () => ({
    id: "start",
  }))
  const endInput = useHandlePart(picker, "hidden-input", () => ({
    end: true,
    id: "end",
  }))
  // A hidden input renders only for an end that submits under a name.
  const range = $derived(root.state.mode === "range")
  const submitsStart = $derived(
    range ? (startName ?? name ?? field?.name()) : (name ?? field?.name())
  )
  const submitsEnd = $derived(range && (endName ?? name ?? field?.name()))
</script>

{#snippet fallback()}
  <DatePickerInput />
  {#if range}<DatePickerInput end />{/if}
  <DatePickerTrigger />
  <DatePickerContent />
{/snippet}

{#snippet content(state: DatePickerState)}
  {#if children}{@render children(state)}{:else}{@render fallback()}{/if}
{/snippet}

<Part tag="div" part={root} props={{ ...rest, children: content }} />
<!-- Beside the root, so a `render` snippet keeps them. -->
{#if submitsStart}<input {...startInput.slot()} />{/if}
{#if submitsEnd}<input {...endInput.slot()} />{/if}
