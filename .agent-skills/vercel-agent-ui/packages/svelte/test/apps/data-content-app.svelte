<script lang="ts">
  import type { MenuController } from "@ui-sdk/core/menu"
  import type { SelectController } from "@ui-sdk/core/select"
  import { Menu, MenuContent, MenuItem } from "../../src/menu"
  import { Select, SelectContent, SelectItem } from "../../src/select"

  let {
    select,
    menu,
  }: { select: SelectController<string>; menu: MenuController } = $props()
  let own = $state(true)
  export const dropOwn = () => (own = false)
  const fruits = [
    { value: "apple", label: "Apple" },
    { value: "pear", label: "Pear" },
  ]
</script>

<Select controller={select} items={fruits}>
  {#if own}
    <SelectContent
      ><SelectItem value="apple">Own apple</SelectItem></SelectContent
    >
  {/if}
</Select>
<Menu
  controller={menu}
  items={[
    { value: "copy", label: "Copy" },
    { value: "paste", label: "Paste" },
  ]}
>
  {#if own}
    <MenuContent><MenuItem>Own item</MenuItem></MenuContent>
  {/if}
</Menu>
