import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItemIndicator,
  MenuTrigger,
} from "@ui-sdk/react/menu"
import { Menubar } from "@ui-sdk/react/menubar"
import { CheckIcon } from "lucide-react"
import * as React from "react"

export function Example() {
  const [statusBar, setStatusBar] = React.useState(true)
  return (
    <div data-slot="stack">
      <Menubar>
        <Menu>
          <MenuTrigger>View</MenuTrigger>
          <MenuContent>
            <MenuCheckboxItem
              value="status-bar"
              checked={statusBar}
              onCheckedChange={setStatusBar}
            >
              <MenuItemIndicator>
                <CheckIcon />
              </MenuItemIndicator>
              Status Bar
            </MenuCheckboxItem>
            <MenuCheckboxItem value="activity-bar" defaultChecked>
              <MenuItemIndicator>
                <CheckIcon />
              </MenuItemIndicator>
              Activity Bar
            </MenuCheckboxItem>
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger>Format</MenuTrigger>
          <MenuContent>
            <MenuCheckboxItem value="strikethrough">
              <MenuItemIndicator>
                <CheckIcon />
              </MenuItemIndicator>
              Strikethrough
            </MenuCheckboxItem>
            <MenuCheckboxItem value="code">
              <MenuItemIndicator>
                <CheckIcon />
              </MenuItemIndicator>
              Code
            </MenuCheckboxItem>
          </MenuContent>
        </Menu>
      </Menubar>
      <output data-slot="output">
        Status bar {statusBar ? "shown" : "hidden"}
      </output>
    </div>
  )
}
