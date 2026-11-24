<script lang="ts">
  import { EyeIcon, EyeOffIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "@ui-sdk/svelte/password-input"

  let value = $state("")

  const score = $derived(
    [
      value.length >= 8,
      value.length >= 12,
      /[a-z]/.test(value) && /[A-Z]/.test(value),
      /\d/.test(value) && /[^a-zA-Z\d]/.test(value),
    ].filter(Boolean).length
  )
</script>

<Field name="new-password">
  <FieldLabel>New password</FieldLabel>
  <PasswordInput bind:value autoComplete="new-password">
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
  <div data-slot="strength" aria-hidden="true">
    {#each [1, 2, 3, 4] as level (level)}
      <div data-on={score >= level || undefined}></div>
    {/each}
  </div>
  <output data-slot="output">
    {value
      ? `Strength: ${["Weak", "Weak", "Fair", "Good", "Strong"][score]} (${value.length} characters)`
      : "Type a password to rate it."}
  </output>
</Field>
