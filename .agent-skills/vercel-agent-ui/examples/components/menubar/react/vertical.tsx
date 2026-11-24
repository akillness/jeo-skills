import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/react/menu"
import { Menubar } from "@ui-sdk/react/menubar"

function Example() {
  return (
    <Menubar orientation="vertical">
      {["Inbox", "Drafts", "Archive"].map((label) => (
        <Menu key={label}>
          <MenuTrigger>{label}</MenuTrigger>
          <MenuContent>
            <MenuItem>Open {label}</MenuItem>
            <MenuItem>Mark all as read</MenuItem>
          </MenuContent>
        </Menu>
      ))}
    </Menubar>
  )
}

export { Example }
