<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
</script>

<Field>
  <Checkbox>
    <CheckboxIndicator>
      <CheckIcon aria-hidden="true" />
    </CheckboxIndicator>
  </Checkbox>
  <div data-slot="stack">
    <FieldLabel>Accept terms and conditions</FieldLabel>
    <FieldDescription>
      By clicking this checkbox, you agree to the terms and conditions.
    </FieldDescription>
  </div>
</Field>
