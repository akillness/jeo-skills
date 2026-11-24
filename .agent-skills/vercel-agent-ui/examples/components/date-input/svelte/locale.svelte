<script lang="ts">
  import { DateInput } from "@ui-sdk/svelte/date-input"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
</script>

<div data-slot="stack">
  <Field>
    <FieldLabel>Date (en-GB)</FieldLabel>
    <DateInput locale="en-GB" defaultValue="2026-11-02" />
  </Field>
  <Field>
    <FieldLabel>Datum (de-DE)</FieldLabel>
    <DateInput locale="de-DE" defaultValue="2026-11-02" />
  </Field>
  <Field>
    <FieldLabel>日付 (ja-JP)</FieldLabel>
    <DateInput locale="ja-JP" defaultValue="2026-11-02" />
  </Field>
</div>
