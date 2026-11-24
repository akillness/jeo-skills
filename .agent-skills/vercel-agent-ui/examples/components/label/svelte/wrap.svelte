<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import { Label } from "@ui-sdk/svelte/label"
</script>

<Label>
  <Checkbox>
    <CheckboxIndicator>
      <CheckIcon aria-hidden="true" />
    </CheckboxIndicator>
  </Checkbox>
  Accept terms and conditions
</Label>
