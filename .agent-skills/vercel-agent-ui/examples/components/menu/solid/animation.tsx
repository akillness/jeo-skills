import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { useLog } from "../../../shared/solid/log"

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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
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
