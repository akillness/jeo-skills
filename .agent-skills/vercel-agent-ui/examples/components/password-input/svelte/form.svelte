<script lang="ts">
  import { EyeIcon, EyeOffIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import {
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "@ui-sdk/svelte/password-input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<div data-slot="stack">
  <form
    data-slot="stack"
    id="sign-in"
    onsubmit={(event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const length = String(data.get("password")).length
      log(
        `Signed in as ${data.get("email")}, with a password of ${length} characters`
      )
    }}
  >
    <Field name="email">
      <FieldLabel>Email</FieldLabel>
      <Input type="email" required autocomplete="username" />
    </Field>
  </form>
  <Field>
    <FieldLabel>Password</FieldLabel>
    <PasswordInput name="password" form="sign-in" required>
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
  <div data-slot="row">
    <button type="submit" form="sign-in" data-variant="solid">Sign In</button>
    <button type="reset" form="sign-in">Reset</button>
  </div>
</div>
