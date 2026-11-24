import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/solid/menu"
import { Menubar } from "@ui-sdk/solid/menubar"
import { For } from "solid-js"

function Example() {
  return (
    <Menubar orientation="vertical">
      <For each={["Inbox", "Drafts", "Archive"]}>
        {(label) => (
          <Menu>
            <MenuTrigger>{label}</MenuTrigger>
            <MenuContent>
              <MenuItem>Open {label}</MenuItem>
              <MenuItem>Mark all as read</MenuItem>
            </MenuContent>
          </Menu>
        )}
      </For>
    </Menubar>
  )
}

export { Example }
