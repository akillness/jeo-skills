<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
</script>

<div data-slot="stack">
  <label data-slot="label">
    <Checkbox defaultChecked>
      <CheckboxIndicator>
        <CheckIcon aria-hidden="true" />
      </CheckboxIndicator>
    </Checkbox>
    Product updates
  </label>
  <label data-slot="label">
    <Checkbox defaultChecked disabled>
      <CheckboxIndicator>
        <CheckIcon aria-hidden="true" />
      </CheckboxIndicator>
    </Checkbox>
    Security alerts
  </label>
</div>
