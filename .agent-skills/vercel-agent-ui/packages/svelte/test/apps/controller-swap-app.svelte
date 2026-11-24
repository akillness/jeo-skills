<script lang="ts">
  import type { MenuController } from "@ui-sdk/core/menu"
  import type { SelectController } from "@ui-sdk/core/select"
  import {
    Menu,
    MenuContent,
    MenuContextTrigger,
    MenuItem,
  } from "../../src/menu"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "../../src/select"

  let {
    selects,
    menus,
  }: {
    selects: [SelectController<string>, SelectController<string>]
    menus: [MenuController, MenuController]
  } = $props()
  let swapped = $state(false)
  export const swap = () => (swapped = true)
  const fruits = [
    { value: "apple", label: "Apple" },
    { value: "pear", label: "Pear" },
  ]
</script>

<Select controller={selects[0]} items={fruits} defaultValue="apple">
  <SelectContent
    >{#each fruits as fruit (fruit.value)}<SelectItem value={fruit.value}
        >{fruit.label}</SelectItem
      >{/each}</SelectContent
  >
</Select>
<Select controller={selects[1]} items={fruits} defaultValue="pear">
  <SelectContent
    >{#each fruits as fruit (fruit.value)}<SelectItem value={fruit.value}
        >{fruit.label}</SelectItem
      >{/each}</SelectContent
  >
</Select>
<SelectTrigger
  controller={swapped ? selects[1] : selects[0]}
  aria-label="Fruit"
/>
<Menu controller={menus[0]}
  ><MenuContent><MenuItem>First</MenuItem></MenuContent></Menu
>
<Menu controller={menus[1]}
  ><MenuContent><MenuItem>Second</MenuItem></MenuContent></Menu
>
<MenuContextTrigger
  controller={swapped ? menus[1] : menus[0]}
  data-testid="area">Area</MenuContextTrigger
>
