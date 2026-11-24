<script lang="ts">
  import { EyeIcon, EyeOffIcon } from "@lucide/svelte"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "@ui-sdk/svelte/password-input"
</script>

<Field name="wifi-password">
  <FieldLabel>Wi-Fi password</FieldLabel>
  <PasswordInput
    defaultVisible
    defaultValue="maple-orbit-42"
    autoComplete="new-password"
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
  <FieldDescription
    >Guests read it from here, so it starts shown.</FieldDescription
  >
</Field>
