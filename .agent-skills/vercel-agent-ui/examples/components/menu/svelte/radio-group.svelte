<script lang="ts">
  import {
    Menu,
    MenuContent,
    MenuGroupLabel,
    MenuItemIndicator,
    MenuRadioGroup,
    MenuRadioItem,
    MenuSeparator,
    MenuTrigger,
  } from "@ui-sdk/svelte/menu"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Menu>
  <MenuTrigger>Panel</MenuTrigger>
  <MenuContent>
    <MenuRadioGroup
      name="position"
      defaultValue="bottom"
      onValueChange={(value) => log(`Panel at the ${value}`)}
    >
      <MenuGroupLabel>Position</MenuGroupLabel>
      {#each ["Top", "Bottom", "Right"] as option (option)}
        <MenuRadioItem value={option.toLowerCase()}>
          <MenuItemIndicator />
          {option}
        </MenuRadioItem>
      {/each}
    </MenuRadioGroup>
    <MenuSeparator />
    <MenuRadioGroup
      defaultValue="comfortable"
      onValueChange={(value) => log(`${value} density`)}
    >
      <MenuGroupLabel>Density</MenuGroupLabel>
      {#each ["Compact", "Comfortable"] as option (option)}
        <MenuRadioItem value={option.toLowerCase()}>
          <MenuItemIndicator />
          {option}
        </MenuRadioItem>
      {/each}
    </MenuRadioGroup>
  </MenuContent>
</Menu>
