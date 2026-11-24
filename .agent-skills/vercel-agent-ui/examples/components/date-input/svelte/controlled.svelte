<script lang="ts">
  import { DateInput } from "@ui-sdk/svelte/date-input"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let value = $state<string | null>("2026-11-02")
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => (value = null)}>Clear</button>
  </div>
  <Field>
    <FieldLabel>Due date</FieldLabel>
    <DateInput
      bind:value
      onValueChange={(next) => log(`Due date ${next ?? "empty"}`)}
    />
  </Field>
</div>
