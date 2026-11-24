<script lang="ts">
  import { Field, FieldError, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    OTPInput,
    OTPInputGroup,
    OTPInputSlot,
  } from "@ui-sdk/svelte/otp-input"

  let invalid = $state(true)
</script>

<Field {invalid}>
  <FieldLabel>Verification code</FieldLabel>
  <OTPInput defaultValue="482913" onValueChange={() => (invalid = false)}>
    <OTPInputGroup>
      {#each [0, 1, 2, 3, 4, 5] as index (index)}
        <OTPInputSlot {index} />
      {/each}
    </OTPInputGroup>
  </OTPInput>
  <FieldError>That code has expired. Request a new one.</FieldError>
</Field>
