<script lang="ts">
  import {
    CalendarDay,
    CalendarGrid,
    CalendarHeading,
    CalendarNext,
    CalendarPrevious,
    CalendarWeekday,
    CalendarWeekdays,
    CalendarWeeks,
    DatePicker,
    DatePickerContent,
    DatePickerInput,
    DatePickerTrigger,
  } from "@ui-sdk/svelte/date-picker"
  import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
  } from "@ui-sdk/svelte/field"
  import {
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
  } from "@lucide/svelte"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  function submit(event: SubmitEvent) {
    event.preventDefault()
    log(
      `Submitted due=${new FormData(event.currentTarget as HTMLFormElement).get("due")}`
    )
  }
</script>

<form data-slot="stack" onsubmit={submit}>
  <Field name="due">
    <FieldLabel>Due date</FieldLabel>
    <DatePicker required>
      <div data-slot="row">
        <DatePickerInput />
        <DatePickerTrigger data-variant="ghost">
          <CalendarIcon aria-hidden="true" />
        </DatePickerTrigger>
      </div>
      <DatePickerContent>
        <div data-slot="row">
          <CalendarPrevious data-variant="ghost">
            <ChevronLeftIcon aria-hidden="true" />
          </CalendarPrevious>
          <CalendarHeading />
          <CalendarNext data-variant="ghost">
            <ChevronRightIcon aria-hidden="true" />
          </CalendarNext>
        </div>
        <CalendarGrid>
          <CalendarWeekdays>
            {#snippet children(index)}
              <CalendarWeekday {index} />
            {/snippet}
          </CalendarWeekdays>
          <CalendarWeeks>
            {#snippet children(cell)}
              <CalendarDay value={cell.date} />
            {/snippet}
          </CalendarWeeks>
        </CalendarGrid>
      </DatePickerContent>
    </DatePicker>
    <FieldDescription>When the invoice is due.</FieldDescription>
    <div>
      <FieldError match="valueMissing">Choose a due date.</FieldError>
    </div>
  </Field>
  <button type="submit">Submit</button>
</form>
