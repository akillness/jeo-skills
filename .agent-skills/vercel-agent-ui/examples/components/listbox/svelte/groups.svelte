<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Listbox,
    ListboxGroup,
    ListboxGroupLabel,
    ListboxItem,
    ListboxItemIndicator,
    ListboxSeparator,
  } from "@ui-sdk/svelte/listbox"

  const produce = [
    {
      label: "Fruits",
      items: [
        { value: "apple", label: "Apple" },
        { value: "banana", label: "Banana" },
        { value: "orange", label: "Orange" },
      ],
    },
    {
      label: "Vegetables",
      items: [
        { value: "carrot", label: "Carrot" },
        { value: "broccoli", label: "Broccoli" },
        { value: "spinach", label: "Spinach" },
      ],
    },
  ]
</script>

<Listbox multiple defaultValue={["banana"]} aria-label="Produce">
  {#each produce as group, index (group.label)}
    {#if index > 0}
      <ListboxSeparator />
    {/if}
    <ListboxGroup>
      <ListboxGroupLabel>{group.label}</ListboxGroupLabel>
      {#each group.items as item (item.value)}
        <ListboxItem value={item.value}>
          {item.label}
          <ListboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ListboxItemIndicator>
        </ListboxItem>
      {/each}
    </ListboxGroup>
  {/each}
</Listbox>
