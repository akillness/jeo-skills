<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Listbox,
    ListboxItem,
    ListboxItemIndicator,
  } from "@ui-sdk/svelte/listbox"

  const toppings = [
    { value: "basil", label: "Basil" },
    { value: "cheese", label: "Extra cheese" },
    { value: "mushroom", label: "Mushroom" },
    { value: "olive", label: "Olive" },
    { value: "onion", label: "Onion" },
    { value: "pepper", label: "Pepper" },
  ]

  let disabled = $state(false)
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => (disabled = !disabled)}>
      {disabled ? "Enable the List" : "Disable the List"}
    </button>
  </div>
  <Listbox multiple {disabled} defaultValue={["basil"]} aria-label="Toppings">
    {#each toppings as topping (topping.value)}
      <ListboxItem value={topping.value} disabled={topping.value === "olive"}>
        {topping.label}
        <ListboxItemIndicator>
          <CheckIcon aria-hidden="true" />
        </ListboxItemIndicator>
      </ListboxItem>
    {/each}
  </Listbox>
</div>
