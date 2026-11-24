<script lang="ts">
  import { EyeIcon, EyeOffIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    createPasswordInputController,
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "@ui-sdk/svelte/password-input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const password = createPasswordInputController()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button
      type="button"
      onclick={() => {
        password.setValue("plum-kettle-orbit-42")
        password.setVisible(true)
      }}
    >
      Suggest
    </button>
    <button type="button" onclick={() => password.toggleVisible()}
      >Toggle</button
    >
    <button type="button" onclick={() => password.clear()}>Clear</button>
    <button
      type="button"
      onclick={() =>
        log(
          `${password.getValue().length} characters, ${password.isVisible() ? "shown" : "hidden"}`
        )}
    >
      Read
    </button>
    <button type="button" onclick={() => password.focus()}>Focus</button>
  </div>
  <Field name="new-password">
    <FieldLabel>New password</FieldLabel>
    <PasswordInput controller={password} autoComplete="new-password">
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
</div>
