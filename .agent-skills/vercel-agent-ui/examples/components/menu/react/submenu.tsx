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
    <Menu onAction={(value) => log(`Chose ${value}`)}>
      <MenuTrigger>Edit</MenuTrigger>
      <MenuContent>
        <MenuItem value="undo" shortcut="mod+z">
          Undo
        </MenuItem>
        <MenuItem value="redo" shortcut="mod+shift+z">
          Redo
        </MenuItem>
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger>
            Find
            <ChevronRightIcon aria-hidden="true" />
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuItem value="find" shortcut="mod+f">
              Find…
            </MenuItem>
            <MenuItem value="find-next" shortcut="mod+g">
              Find next
            </MenuItem>
            <MenuItem value="find-previous" shortcut="mod+shift+g">
              Find previous
            </MenuItem>
          </MenuSubContent>
        </MenuSub>
        <MenuSub>
          <MenuSubTrigger>
            Transform
            <ChevronRightIcon aria-hidden="true" />
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuSub>
              <MenuSubTrigger>
                Case
                <ChevronRightIcon aria-hidden="true" />
              </MenuSubTrigger>
              <MenuSubContent>
                <MenuItem value="uppercase">Uppercase</MenuItem>
                <MenuItem value="lowercase">Lowercase</MenuItem>
              </MenuSubContent>
            </MenuSub>
            <MenuItem value="trim">Trim whitespace</MenuItem>
          </MenuSubContent>
        </MenuSub>
      </MenuContent>
    </Menu>
  )
}

export { Example }
