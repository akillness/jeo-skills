<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Checkbox,
    CheckboxGroup,
    CheckboxIndicator,
  } from "@ui-sdk/svelte/checkbox"

  const toppings = [
    { value: "cheese", label: "جبن" },
    { value: "mushrooms", label: "فطر" },
    { value: "olives", label: "زيتون" },
    { value: "peppers", label: "فلفل" },
  ]
</script>

<div data-slot="stack" dir="rtl">
  <h3 id="rtl-toppings">الإضافات</h3>
  <CheckboxGroup aria-labelledby="rtl-toppings" defaultValue={["cheese"]}>
    {#each toppings as topping (topping.value)}
      <label data-slot="label">
        <Checkbox value={topping.value}>
          <CheckboxIndicator>
            <CheckIcon />
          </CheckboxIndicator>
        </Checkbox>
        {topping.label}
      </label>
    {/each}
  </CheckboxGroup>
</div>
