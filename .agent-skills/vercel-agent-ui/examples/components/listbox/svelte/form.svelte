<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
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
</script>

<div data-slot="stack">
  <Listbox
    multiple
    name="toppings"
    form="pizza-order"
    required
    defaultValue={["cheese"]}
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
  <form
    id="pizza-order"
    data-slot="row"
    onsubmit={(event) => {
      event.preventDefault()
      log(
        `Ordered ${new FormData(event.currentTarget).getAll("toppings").join(", ")}`
      )
    }}
  >
    <button type="reset">Reset</button>
    <button data-variant="solid">Order</button>
  </form>
</div>
