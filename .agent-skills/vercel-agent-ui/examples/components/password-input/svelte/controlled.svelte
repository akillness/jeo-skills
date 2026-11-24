<script lang="ts">
  import { EyeIcon, EyeOffIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "@ui-sdk/svelte/password-input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let visible = $state(false)
</script>

<Field name="password">
  <FieldLabel>Password</FieldLabel>
  <PasswordInput
    bind:visible
    onVisibleChange={(next: boolean, details: { reason: string }) =>
      log(`${next ? "Shown" : "Hidden"} (${details.reason})`)}
  >
    <PasswordInputControl />
    <PasswordInputToggle aria-label="Show password">
      {#snippet children(state)}
        {#if state.visible}
          <EyeOffIcon aria-hidden="true" />
        {:else}
          <EyeIcon aria-hidden="true" />
        {/if}
      {/snippet}
    </PasswordInputToggle>
  </PasswordInput>
</Field>
