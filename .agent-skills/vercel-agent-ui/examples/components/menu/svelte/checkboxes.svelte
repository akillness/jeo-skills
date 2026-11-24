<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Menu,
    MenuCheckboxItem,
    MenuContent,
    MenuGroup,
    MenuGroupLabel,
    MenuItemIndicator,
    MenuSeparator,
    MenuTrigger,
  } from "@ui-sdk/svelte/menu"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Menu
  onCheckedChange={(checked, details) =>
    log(`${details.value} ${checked ? "on" : "off"}`)}
>
  <MenuTrigger>View</MenuTrigger>
  <MenuContent>
    <MenuGroup>
      <MenuGroupLabel>Appearance</MenuGroupLabel>
      <MenuCheckboxItem value="status-bar" defaultChecked>
        <MenuItemIndicator keepMounted>
          <CheckIcon aria-hidden="true" />
        </MenuItemIndicator>
        Status bar
      </MenuCheckboxItem>
      <MenuCheckboxItem value="minimap">
        <MenuItemIndicator keepMounted>
          <CheckIcon aria-hidden="true" />
        </MenuItemIndicator>
        Minimap
      </MenuCheckboxItem>
    </MenuGroup>
    <MenuSeparator />
    <MenuCheckboxItem value="line-numbers" defaultChecked>
      <MenuItemIndicator keepMounted>
        <CheckIcon aria-hidden="true" />
      </MenuItemIndicator>
      Line numbers
    </MenuCheckboxItem>
    <MenuCheckboxItem value="word-wrap">
      <MenuItemIndicator keepMounted>
        <CheckIcon aria-hidden="true" />
      </MenuItemIndicator>
      Word wrap
    </MenuCheckboxItem>
  </MenuContent>
</Menu>
