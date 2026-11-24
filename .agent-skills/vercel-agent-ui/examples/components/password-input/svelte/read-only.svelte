<script lang="ts">
  import { EyeIcon, EyeOffIcon } from "@lucide/svelte"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "@ui-sdk/svelte/password-input"
</script>

<Field name="recovery-key">
  <FieldLabel>Recovery key</FieldLabel>
  <PasswordInput readOnly defaultValue="7Hq2-vX9p-Lm4c" autoComplete="off">
    <PasswordInputControl />
    <PasswordInputToggle aria-label="Show recovery key">
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
    >Keep it somewhere safe. You can show it, but not change it.</FieldDescription
  >
</Field>
