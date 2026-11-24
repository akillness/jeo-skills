<script lang="ts">
  import {
    Field,
    FieldError,
    FieldLabel,
    FieldLegend,
    FieldSet,
  } from "../../src/field"
  import { Input } from "../../src/input"
  import { Textarea } from "../../src/textarea"

  let {
    which,
  }: {
    which:
      | "input"
      | "textarea"
      | "errors"
      | "fieldset"
      | "readonly-input"
      | "readonly-textarea"
  } = $props()
</script>

{#if which === "input"}
  <Input name="email" defaultValue="ada@example.com" required />
{:else if which === "textarea"}
  <Textarea defaultValue="Hello" autoResize />
{:else if which === "errors"}
  <Field name="email" invalid>
    <FieldLabel>Email</FieldLabel>
    <Input />
    <FieldError>This email bounced.</FieldError>
  </Field>
{:else if which === "fieldset"}
  <FieldSet disabled>
    <FieldLegend>Contact</FieldLegend>
    <Input />
  </FieldSet>
{:else if which === "readonly-input"}
  <Input readonly defaultValue="Hi" />
{:else}
  <Textarea readonly defaultValue="Hi" />
{/if}
