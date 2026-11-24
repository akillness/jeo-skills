<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Checkbox,
    CheckboxGroup,
    CheckboxIndicator,
    createCheckboxGroupController,
  } from "@ui-sdk/svelte/checkbox"
  import { useLog } from "../../../shared/svelte/log"

  const days = [
    { value: "mon", label: "Monday" },
    { value: "tue", label: "Tuesday" },
    { value: "wed", label: "Wednesday" },
    { value: "thu", label: "Thursday" },
    { value: "fri", label: "Friday" },
    { value: "sat", label: "Saturday" },
    { value: "sun", label: "Sunday" },
  ]

  const weekdays = ["mon", "tue", "wed", "thu", "fri"]

  const log = useLog()
  const schedule = createCheckboxGroupController()
  let value = $state(["mon", "tue"])
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => schedule.setValue(weekdays)}
      >Select Weekdays</button
    >
    <button type="button" onclick={() => schedule.setValue([])}>Clear</button>
  </div>
  <h3 id="controlled-days">Working days</h3>
  <CheckboxGroup
    bind:value
    aria-labelledby="controlled-days"
    controller={schedule}
    onValueChange={(next, details) => {
      const names = days
        .filter((day) => next.includes(day.value))
        .map((day) => day.label)
      log(`${names.join(", ") || "No days"} (${details.reason})`)
    }}
  >
    {#each days as day (day.value)}
      <label data-slot="label">
        <Checkbox value={day.value}>
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        {day.label}
      </label>
    {/each}
  </CheckboxGroup>
</div>
