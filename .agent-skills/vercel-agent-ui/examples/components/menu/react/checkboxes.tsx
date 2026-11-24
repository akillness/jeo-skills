"use client"

import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItemIndicator,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/react/menu"
import { CheckIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Menu
      onCheckedChange={(checked, details) =>
        log(`${details.value} ${checked ? "on" : "off"}`)
      }
    >
      <MenuTrigger>View</MenuTrigger>
      <MenuContent>
        <MenuGroup>
          <MenuGroupLabel>Appearance</MenuGroupLabel>
          <MenuCheckboxItem value="status-bar" defaultChecked>
            <MenuItemIndicator keepMounted>
              <CheckIcon aria-hidden="true" />
            </MenuItemIndicator>
            Status bar
          </MenuCheckboxItem>
          <MenuCheckboxItem value="minimap">
            <MenuItemIndicator keepMounted>
              <CheckIcon aria-hidden="true" />
            </MenuItemIndicator>
            Minimap
          </MenuCheckboxItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuCheckboxItem value="line-numbers" defaultChecked>
          <MenuItemIndicator keepMounted>
            <CheckIcon aria-hidden="true" />
          </MenuItemIndicator>
          Line numbers
        </MenuCheckboxItem>
        <MenuCheckboxItem value="word-wrap">
          <MenuItemIndicator keepMounted>
            <CheckIcon aria-hidden="true" />
          </MenuItemIndicator>
          Word wrap
        </MenuCheckboxItem>
      </MenuContent>
    </Menu>
  )
}

export { Example }
