<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
</script>

<label data-slot="label">
  <Checkbox>
    <CheckboxIndicator>
      <CheckIcon aria-hidden="true" />
    </CheckboxIndicator>
  </Checkbox>
  Accept terms and conditions
</label>
