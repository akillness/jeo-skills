<script lang="ts">
  import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
  } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
</script>

<FieldSet>
  <FieldLegend>Address</FieldLegend>
  <FieldDescription
    >We need your address to deliver your order.</FieldDescription
  >
  <FieldGroup>
    <Field name="street">
      <FieldLabel>Street address</FieldLabel>
      <Input autocomplete="street-address" />
    </Field>
    <div data-slot="grid">
      <Field name="city">
        <FieldLabel>City</FieldLabel>
        <Input autocomplete="address-level2" />
      </Field>
      <Field name="postal-code">
        <FieldLabel>Postal code</FieldLabel>
        <Input autocomplete="postal-code" />
      </Field>
    </div>
  </FieldGroup>
</FieldSet>
