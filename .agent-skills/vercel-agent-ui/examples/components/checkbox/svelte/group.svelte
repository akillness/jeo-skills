<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Checkbox,
    CheckboxGroup,
    CheckboxIndicator,
  } from "@ui-sdk/svelte/checkbox"

  const toppings = [
    { value: "cheese", label: "Cheese" },
    { value: "mushrooms", label: "Mushrooms" },
    { value: "olives", label: "Olives" },
    { value: "peppers", label: "Peppers" },
  ]
</script>

<div data-slot="stack">
  <h3 id="basic-toppings">Toppings</h3>
  <CheckboxGroup aria-labelledby="basic-toppings" defaultValue={["cheese"]}>
    {#each toppings as topping (topping.value)}
      <label data-slot="label">
        <Checkbox value={topping.value}>
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        {topping.label}
      </label>
    {/each}
  </CheckboxGroup>
</div>
