<script lang="ts">
  import {
    createDateInputController,
    DateInput,
  } from "@ui-sdk/svelte/date-input"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"

  const publish = createDateInputController()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => publish.setValue("2026-12-25")}
      >Christmas</button
    >
    <button type="button" onclick={() => publish.focus("year")}
      >Edit Year</button
    >
    <button type="button" onclick={() => publish.clear()}>Clear</button>
  </div>
  <Field>
    <FieldLabel>Publish on</FieldLabel>
    <DateInput controller={publish} />
  </Field>
</div>
