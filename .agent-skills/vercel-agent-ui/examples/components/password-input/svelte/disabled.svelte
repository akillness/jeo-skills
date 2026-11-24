<script lang="ts">
  import { EyeIcon, EyeOffIcon } from "@lucide/svelte"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "@ui-sdk/svelte/password-input"
</script>

<Field disabled name="password">
  <FieldLabel>Password</FieldLabel>
  <PasswordInput defaultValue="hunter22">
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
  <FieldDescription>Your administrator manages this password.</FieldDescription>
</Field>
