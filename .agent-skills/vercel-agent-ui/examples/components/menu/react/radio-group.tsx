"use client"

import {
  Menu,
  MenuContent,
  MenuGroupLabel,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/react/menu"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Menu>
      <MenuTrigger>Panel</MenuTrigger>
      <MenuContent>
        <MenuRadioGroup
          name="position"
          defaultValue="bottom"
          onValueChange={(value) => log(`Panel at the ${value}`)}
        >
          <MenuGroupLabel>Position</MenuGroupLabel>
          {["Top", "Bottom", "Right"].map((option) => (
            <MenuRadioItem key={option} value={option.toLowerCase()}>
              <MenuItemIndicator />
              {option}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuRadioGroup
          defaultValue="comfortable"
          onValueChange={(value) => log(`${value} density`)}
        >
          <MenuGroupLabel>Density</MenuGroupLabel>
          {["Compact", "Comfortable"].map((option) => (
            <MenuRadioItem key={option} value={option.toLowerCase()}>
              <MenuItemIndicator />
              {option}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

export { Example }
