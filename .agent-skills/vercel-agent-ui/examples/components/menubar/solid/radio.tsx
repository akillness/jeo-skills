import {
  Menu,
  MenuContent,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { Menubar } from "@ui-sdk/solid/menubar"
import { createSignal, For } from "solid-js"

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

export function Example() {
  const [theme, setTheme] = createSignal("system")
  return (
    <div data-slot="stack">
      <Menubar>
        <Menu>
          <MenuTrigger>Profiles</MenuTrigger>
          <MenuContent>
            <MenuRadioGroup defaultValue="ines">
              <For each={profiles}>
                {(profile) => (
                  <MenuRadioItem value={profile.value}>
                    <MenuItemIndicator />
                    {profile.label}
                  </MenuRadioItem>
                )}
              </For>
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger>Theme</MenuTrigger>
          <MenuContent>
            <MenuRadioGroup value={theme()} onValueChange={setTheme}>
              <For each={themes}>
                {(option) => (
                  <MenuRadioItem value={option.value}>
                    <MenuItemIndicator />
                    {option.label}
                  </MenuRadioItem>
                )}
              </For>
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
      </Menubar>
      <output data-slot="output">Theme: {theme()}</output>
    </div>
  )
}
