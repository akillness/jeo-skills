<script lang="ts">
  import { EyeIcon, EyeOffIcon, LockIcon } from "@lucide/svelte"
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
    {#snippet children(state)}
      <PasswordInputControl />
      <span
        >{#if state.capsLock}<LockIcon aria-hidden="true" />{/if}</span
      >
      <PasswordInputToggle aria-label="Show password">
        {#snippet children(toggle)}
          {#if toggle.visible}
            <EyeOffIcon aria-hidden="true" />
          {:else}
            <EyeIcon aria-hidden="true" />
          {/if}
        {/snippet}
      </PasswordInputToggle>
    {/snippet}
  </PasswordInput>
  <p data-slot="caps-lock">Caps Lock is on.</p>
</Field>
