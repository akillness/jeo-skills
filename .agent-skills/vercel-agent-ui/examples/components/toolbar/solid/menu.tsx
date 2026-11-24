import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/solid/menu"
import { Toolbar, ToolbarButton } from "@ui-sdk/solid/toolbar"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  return (
    <Toolbar aria-label="Document">
      <ToolbarButton onClick={() => log("Saved")}>Save</ToolbarButton>
      <Menu onAction={(value) => log(`Shared by ${value}`)}>
        <ToolbarButton render={(props) => <MenuTrigger {...props} />}>
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
            <path d="m6 9 6 6 6-6" />
          </svg>
        </ToolbarButton>
        <MenuContent>
          <MenuItem value="email">Email</MenuItem>
          <MenuItem value="link">Copy Link</MenuItem>
        </MenuContent>
      </Menu>
      <ToolbarButton onClick={() => log("Printed")}>Print</ToolbarButton>
    </Toolbar>
  )
}

export { Example }
