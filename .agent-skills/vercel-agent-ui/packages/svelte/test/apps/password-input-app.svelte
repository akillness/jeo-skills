<script lang="ts">
  import {
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "../../src/password-input"

  let { defaultVisible }: { defaultVisible?: boolean } = $props()
</script>

<PasswordInput name="password" {defaultVisible}>
  <PasswordInputControl aria-label="Password" />
  <PasswordInputToggle aria-label="Show password" />
</PasswordInput>
