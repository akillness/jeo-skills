"use client"

import {
  Menu,
  MenuContent,
  MenuContextTrigger,
  MenuItem,
  MenuSeparator,
} from "@ui-sdk/react/menu"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Menu onAction={(value) => log(`Chose ${value}`)}>
      <MenuContextTrigger tabIndex={0}>
        Right-click or long-press here
      </MenuContextTrigger>
      <MenuContent>
        <MenuItem value="back">Back</MenuItem>
        <MenuItem value="forward" disabled>
          Forward
        </MenuItem>
        <MenuItem value="reload">Reload</MenuItem>
        <MenuSeparator />
        <MenuItem value="save">Save page as…</MenuItem>
        <MenuItem value="print">Print…</MenuItem>
      </MenuContent>
    </Menu>
  )
}

export { Example }
