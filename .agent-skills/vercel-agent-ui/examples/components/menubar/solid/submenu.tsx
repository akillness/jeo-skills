import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { Menubar } from "@ui-sdk/solid/menubar"

function Example() {
  return (
    <Menubar>
      <Menu>
        <MenuTrigger>File</MenuTrigger>
        <MenuContent>
          <MenuItem>New File</MenuItem>
          <MenuSub>
            <MenuSubTrigger>
              Share
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </MenuSubTrigger>
            <MenuSubContent>
              <MenuItem>Email link</MenuItem>
              <MenuItem>Messages</MenuItem>
            </MenuSubContent>
          </MenuSub>
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger>Edit</MenuTrigger>
        <MenuContent>
          <MenuItem>Undo</MenuItem>
          <MenuSub>
            <MenuSubTrigger>
              Find
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </MenuSubTrigger>
            <MenuSubContent>
              <MenuItem>Find…</MenuItem>
              <MenuItem>Find Next</MenuItem>
            </MenuSubContent>
          </MenuSub>
        </MenuContent>
      </Menu>
    </Menubar>
  )
}

export { Example }
