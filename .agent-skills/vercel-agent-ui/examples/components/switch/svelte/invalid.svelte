<script lang="ts">
  import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
  } from "@ui-sdk/svelte/field"
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<form
  data-slot="stack"
  onsubmit={(event) => {
    event.preventDefault()
    log(
      `Submitted two-factor=${new FormData(event.currentTarget).get("two-factor")}`
    )
  }}
>
  <Field>
    <div data-slot="row">
      <div data-slot="stack">
        <FieldLabel>Two-factor authentication</FieldLabel>
        <FieldDescription
          >Required for admins of this workspace.</FieldDescription
        >
      </div>
      <Switch name="two-factor" required>
        <SwitchThumb />
      </Switch>
    </div>
    <FieldError match="valueMissing">Turn this on to continue.</FieldError>
  </Field>
  <div data-slot="row">
    <button type="submit" data-variant="solid">Continue</button>
  </div>
</form>
