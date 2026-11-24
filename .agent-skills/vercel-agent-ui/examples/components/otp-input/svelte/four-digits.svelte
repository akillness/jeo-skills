<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    OTPInput,
    OTPInputGroup,
    OTPInputSlot,
  } from "@ui-sdk/svelte/otp-input"
</script>

<Field>
  <FieldLabel>PIN</FieldLabel>
  <OTPInput maxLength={4} textAlign="center">
    <OTPInputGroup>
      {#each [0, 1, 2, 3] as index (index)}
        <OTPInputSlot {index} />
      {/each}
    </OTPInputGroup>
  </OTPInput>
</Field>
