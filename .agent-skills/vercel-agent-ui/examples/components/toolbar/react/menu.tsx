"use client"

import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/react/menu"
import { Toolbar, ToolbarButton } from "@ui-sdk/react/toolbar"
import { ChevronDownIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  return (
    <Toolbar aria-label="Document">
      <ToolbarButton onClick={() => log("Saved")}>Save</ToolbarButton>
      <Menu onAction={(value) => log(`Shared by ${value}`)}>
        <ToolbarButton render={<MenuTrigger />}>
          Share
          <ChevronDownIcon aria-hidden="true" />
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
