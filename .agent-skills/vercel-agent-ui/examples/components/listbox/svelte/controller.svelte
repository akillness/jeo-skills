<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    createListboxController,
    Listbox,
    ListboxItem,
    ListboxItemIndicator,
  } from "@ui-sdk/svelte/listbox"
  import { useLog } from "../../../shared/svelte/log"

  const toppings = [
    { value: "basil", label: "Basil" },
    { value: "cheese", label: "Extra cheese" },
    { value: "mushroom", label: "Mushroom" },
    { value: "olive", label: "Olive" },
    { value: "onion", label: "Onion" },
    { value: "pepper", label: "Pepper" },
  ]

  const log = useLog()
  const controller = createListboxController<string, true>()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => controller.selectAll()}
      >Select All</button
    >
    <button type="button" onclick={() => controller.clear()}>Clear</button>
    <button type="button" onclick={() => controller.focus()}>Focus</button>
  </div>
  <Listbox
    multiple
    {controller}
    onValueChange={(value, details) =>
      log(`${value.length} selected (${details.reason})`)}
    aria-label="Toppings"
  >
    {#each toppings as topping (topping.value)}
      <ListboxItem value={topping.value}>
        {topping.label}
        <ListboxItemIndicator>
          <CheckIcon aria-hidden="true" />
        </ListboxItemIndicator>
      </ListboxItem>
    {/each}
  </Listbox>
</div>
