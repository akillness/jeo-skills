<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  function onSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const entries = [...new FormData(event.currentTarget)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(entries.length ? `Submitted ${entries.join("&")}` : "Submitted nothing")
  }
</script>

<form data-slot="stack" onsubmit={onSubmit}>
  <Field>
    <Checkbox name="terms" value="yes" required>
      <CheckboxIndicator>
        <CheckIcon aria-hidden="true" />
      </CheckboxIndicator>
    </Checkbox>
    <div data-slot="stack">
      <FieldLabel>Accept terms and conditions</FieldLabel>
      <FieldDescription
        >You agree to our Terms of Service and Privacy Policy.</FieldDescription
      >
    </div>
  </Field>
  <Field>
    <Checkbox name="newsletter" value="weekly" defaultChecked>
      <CheckboxIndicator>
        <CheckIcon aria-hidden="true" />
      </CheckboxIndicator>
    </Checkbox>
    <div data-slot="stack">
      <FieldLabel>Send me the weekly newsletter</FieldLabel>
      <FieldDescription
        >Product news and tips, once a week. Unsubscribe anytime.</FieldDescription
      >
    </div>
  </Field>
  <div data-slot="row">
    <button type="submit">Create Account</button>
    <button type="reset">Reset</button>
  </div>
</form>
