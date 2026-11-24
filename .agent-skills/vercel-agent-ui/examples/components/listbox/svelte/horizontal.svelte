<script lang="ts">
  import { Listbox, ListboxItem } from "@ui-sdk/svelte/listbox"

  const sizes = [
    { value: "xs", label: "XS" },
    { value: "s", label: "S" },
    { value: "m", label: "M" },
    { value: "l", label: "L" },
    { value: "xl", label: "XL", disabled: true },
  ]
</script>

<Listbox
  orientation="horizontal"
  loop={false}
  defaultValue="m"
  aria-label="Size"
>
  {#each sizes as size (size.value)}
    <ListboxItem value={size.value} disabled={size.disabled}>
      {size.label}
    </ListboxItem>
  {/each}
</Listbox>
