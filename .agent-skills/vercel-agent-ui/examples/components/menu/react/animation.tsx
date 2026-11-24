"use client"

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/react/menu"
import { ChevronRightIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Menu
      onOpenChange={(open) => log(open ? "Opening" : "Closing")}
      onOpenChangeComplete={(open) =>
        log(open ? "Finished opening" : "Finished closing")
      }
    >
      <MenuTrigger>Animated</MenuTrigger>
      <MenuContent keepMounted>
        <MenuItem>Back</MenuItem>
        <MenuItem>Forward</MenuItem>
        <MenuItem>Reload</MenuItem>
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger>
            More tools
            <ChevronRightIcon aria-hidden="true" />
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuItem>Save page as…</MenuItem>
            <MenuItem>Developer tools</MenuItem>
          </MenuSubContent>
        </MenuSub>
      </MenuContent>
    </Menu>
  )
}

export { Example }
