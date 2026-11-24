<script lang="ts">
  import { EyeIcon, EyeOffIcon } from "@lucide/svelte"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    PasswordInput,
    PasswordInputControl,
    PasswordInputToggle,
  } from "@ui-sdk/svelte/password-input"
</script>

<div dir="rtl">
  <Field name="password">
    <FieldLabel>كلمة المرور</FieldLabel>
    <PasswordInput>
      <PasswordInputControl />
      <PasswordInputToggle aria-label="إظهار كلمة المرور">
        {#snippet children(state)}
          {#if state.visible}
            <EyeOffIcon aria-hidden="true" />
          {:else}
            <EyeIcon aria-hidden="true" />
          {/if}
        {/snippet}
      </PasswordInputToggle>
    </PasswordInput>
    <FieldDescription>ثمانية أحرف على الأقل.</FieldDescription>
  </Field>
</div>
