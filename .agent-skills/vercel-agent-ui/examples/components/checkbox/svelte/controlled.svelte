<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Checkbox,
    CheckboxIndicator,
    createCheckboxController,
    type CheckedState,
  } from "@ui-sdk/svelte/checkbox"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const updates = createCheckboxController()
  let checked = $state<CheckedState>(false)
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => updates.toggle()}>Toggle</button>
  </div>
  <label data-slot="label">
    <Checkbox
      bind:checked
      controller={updates}
      onCheckedChange={(next, details) =>
        log(
          `${next === "indeterminate" ? "Mixed" : next ? "Checked" : "Unchecked"} (${details.reason})`
        )}
    >
      <CheckboxIndicator>
        <CheckIcon aria-hidden="true" />
      </CheckboxIndicator>
    </Checkbox>
    Email me about product updates
  </label>
</div>
