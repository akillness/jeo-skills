<script lang="ts">
  import {
    Menu,
    MenuContent,
    MenuItemIndicator,
    MenuRadioGroup,
    MenuRadioItem,
    MenuTrigger,
  } from "@ui-sdk/svelte/menu"
  import { Menubar } from "@ui-sdk/svelte/menubar"

  const profiles = [
    { value: "hollis", label: "Hollis" },
    { value: "ines", label: "Inès" },
    { value: "kofi", label: "Kofi" },
  ]

  const themes = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ]

  let theme = $state("system")
</script>

<div data-slot="stack">
  <Menubar>
    <Menu>
      <MenuTrigger>Profiles</MenuTrigger>
      <MenuContent>
        <MenuRadioGroup defaultValue="ines">
          {#each profiles as profile (profile.value)}
            <MenuRadioItem value={profile.value}>
              <MenuItemIndicator />
              {profile.label}
            </MenuRadioItem>
          {/each}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
    <Menu>
      <MenuTrigger>Theme</MenuTrigger>
      <MenuContent>
        <MenuRadioGroup bind:value={theme}>
          {#each themes as option (option.value)}
            <MenuRadioItem value={option.value}>
              <MenuItemIndicator />
              {option.label}
            </MenuRadioItem>
          {/each}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  </Menubar>
  <output data-slot="output">Theme: {theme}</output>
</div>
