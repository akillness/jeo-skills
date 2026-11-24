<script lang="ts">
  import { DateInput } from "@ui-sdk/svelte/date-input"
  import { Field, FieldError, FieldLabel } from "@ui-sdk/svelte/field"
  import { TimeInput } from "@ui-sdk/svelte/time-input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  function onsubmit(event: SubmitEvent) {
    event.preventDefault()
    const data = [...new FormData(event.currentTarget as HTMLFormElement)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(`Submitted ${data.join(", ")}`)
  }
</script>

<form data-slot="stack" {onsubmit}>
  <Field>
    <FieldLabel>Date</FieldLabel>
    <DateInput name="date" defaultValue="2026-11-02" required />
    <FieldError />
  </Field>
  <Field>
    <FieldLabel>Time</FieldLabel>
    <TimeInput name="time" defaultValue="09:30" required />
    <FieldError />
  </Field>
  <div data-slot="row">
    <button type="reset">Reset</button>
    <button type="submit" data-variant="solid">Book</button>
  </div>
</form>
