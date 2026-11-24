<script lang="ts">
  import { Checkbox, CheckboxGroup } from "../../src/checkbox"

  let { disabled = false, name }: { disabled?: boolean; name?: string } =
    $props()
</script>

<form>
  <CheckboxGroup {disabled} {name} aria-label="Toppings">
    <Checkbox value="cheese" aria-label="Cheese" />
  </CheckboxGroup>
</form>
