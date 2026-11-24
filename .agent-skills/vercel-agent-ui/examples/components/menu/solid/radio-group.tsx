import {
  Menu,
  MenuContent,
  MenuGroupLabel,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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
          <For each={["Top", "Bottom", "Right"]}>
            {(option) => (
              <MenuRadioItem value={option.toLowerCase()}>
                <MenuItemIndicator />
                {option}
              </MenuRadioItem>
            )}
          </For>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuRadioGroup
          defaultValue="comfortable"
          onValueChange={(value) => log(`${value} density`)}
        >
          <MenuGroupLabel>Density</MenuGroupLabel>
          <For each={["Compact", "Comfortable"]}>
            {(option) => (
              <MenuRadioItem value={option.toLowerCase()}>
                <MenuItemIndicator />
                {option}
              </MenuRadioItem>
            )}
          </For>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

export { Example }
