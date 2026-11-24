<script lang="ts">
  import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "@ui-sdk/svelte/password-input"

  const rules = [
    {
      label: "At least 8 characters",
      test: (password: string) => password.length >= 8,
    },
    { label: "A number", test: (password: string) => /\d/.test(password) },
    {
      label: "An uppercase and a lowercase letter",
      test: (password: string) =>
        /[a-z]/.test(password) && /[A-Z]/.test(password),
    },
  ]

  let password = $state("")
</script>

<Field name="new-password">
  <FieldLabel>Create a password</FieldLabel>
  <PasswordInput
    value={password}
    autoComplete="new-password"
    onValueChange={(value: string) => (password = value)}
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
  <ul data-slot="stack" aria-label="Password requirements">
    {#each rules as rule (rule.label)}
      {#if rule.test(password)}
        <li data-slot="row">
          <CheckIcon aria-hidden="true" />
          <span data-slot="visually-hidden">Done:</span>
          {rule.label}
        </li>
      {:else}
        <li data-slot="row">
          <XIcon aria-hidden="true" />
          <span data-slot="visually-hidden">To do:</span>
          {rule.label}
        </li>
      {/if}
    {/each}
  </ul>
</Field>
