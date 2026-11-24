<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Menu,
    MenuCheckboxItem,
    MenuContent,
    MenuItemIndicator,
    MenuTrigger,
  } from "@ui-sdk/svelte/menu"
  import { Menubar } from "@ui-sdk/svelte/menubar"

  let statusBar = $state(true)
</script>

<div data-slot="stack">
  <Menubar>
    <Menu>
      <MenuTrigger>View</MenuTrigger>
      <MenuContent>
        <MenuCheckboxItem bind:checked={statusBar} value="status-bar">
          <MenuItemIndicator>
            <CheckIcon />
          </MenuItemIndicator>
          Status Bar
        </MenuCheckboxItem>
        <MenuCheckboxItem value="activity-bar" defaultChecked>
          <MenuItemIndicator>
            <CheckIcon />
          </MenuItemIndicator>
          Activity Bar
        </MenuCheckboxItem>
      </MenuContent>
    </Menu>
    <Menu>
      <MenuTrigger>Format</MenuTrigger>
      <MenuContent>
        <MenuCheckboxItem value="strikethrough">
          <MenuItemIndicator>
            <CheckIcon />
          </MenuItemIndicator>
          Strikethrough
        </MenuCheckboxItem>
        <MenuCheckboxItem value="code">
          <MenuItemIndicator>
            <CheckIcon />
          </MenuItemIndicator>
          Code
        </MenuCheckboxItem>
      </MenuContent>
    </Menu>
  </Menubar>
  <output data-slot="output">Status bar {statusBar ? "shown" : "hidden"}</output
  >
</div>
