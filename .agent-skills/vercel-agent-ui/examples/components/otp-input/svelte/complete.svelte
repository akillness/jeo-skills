<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    OTPInput,
    OTPInputGroup,
    OTPInputSlot,
  } from "@ui-sdk/svelte/otp-input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Field>
  <FieldLabel>Verification code</FieldLabel>
  <OTPInput
    onValueCommit={(value, details) =>
      log(`Checking ${value} (${details.reason})`)}
  >
    <OTPInputGroup>
      {#each [0, 1, 2, 3, 4, 5] as index (index)}
        <OTPInputSlot {index} />
      {/each}
    </OTPInputGroup>
  </OTPInput>
</Field>
