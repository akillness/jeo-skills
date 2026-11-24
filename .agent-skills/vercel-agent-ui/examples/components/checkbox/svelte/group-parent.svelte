<script lang="ts">
  import { CheckIcon, MinusIcon } from "@lucide/svelte"
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
  <h3 id="parent-toppings">Toppings</h3>
  <CheckboxGroup
    aria-labelledby="parent-toppings"
    defaultValue={["cheese", "olives"]}
    allValues={toppings.map((topping) => topping.value)}
  >
    <label data-slot="label">
      <Checkbox parent>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
          <MinusIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Select all
    </label>
    <div data-slot="stack">
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
    </div>
  </CheckboxGroup>
</div>
