<script lang="ts">
  import { EyeIcon, EyeOffIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "@ui-sdk/svelte/password-input"
</script>

<Field name="password">
  <FieldLabel>Password</FieldLabel>
  <PasswordInput>
    <PasswordInputControl />
    <PasswordInputToggle aria-label="Show password">
      {#snippet render({ props, state })}
        <button {...props}>
          {#if state.visible}
            <EyeOffIcon aria-hidden="true" />
          {:else}
            <EyeIcon aria-hidden="true" />
          {/if}
        </button>
      {/snippet}
    </PasswordInputToggle>
  </PasswordInput>
</Field>
