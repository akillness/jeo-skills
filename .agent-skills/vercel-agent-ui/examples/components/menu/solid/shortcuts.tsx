import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <Menu onAction={(value) => log(`Chose ${value}`)}>
      <MenuTrigger>File</MenuTrigger>
      <MenuContent>
        <MenuItem value="new-tab" shortcut="mod+t">
          New tab
        </MenuItem>
        <MenuItem value="new-window" shortcut="mod+n">
          New window
        </MenuItem>
        <MenuItem value="open" shortcut="mod+o">
          Open…
        </MenuItem>
        <MenuSeparator />
        <MenuItem value="save" shortcut="mod+s">
          Save
        </MenuItem>
        <MenuItem value="save-as" shortcut="mod+shift+s">
          Save as…
        </MenuItem>
        <MenuSeparator />
        <MenuItem value="print" shortcut="mod+p">
          Print…
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

export { Example }
