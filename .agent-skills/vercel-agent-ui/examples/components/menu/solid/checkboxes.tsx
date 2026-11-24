import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItemIndicator,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { useLog } from "../../../shared/solid/log"

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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </MenuItemIndicator>
            Status bar
          </MenuCheckboxItem>
          <MenuCheckboxItem value="minimap">
            <MenuItemIndicator keepMounted>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </MenuItemIndicator>
            Minimap
          </MenuCheckboxItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuCheckboxItem value="line-numbers" defaultChecked>
          <MenuItemIndicator keepMounted>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </MenuItemIndicator>
          Line numbers
        </MenuCheckboxItem>
        <MenuCheckboxItem value="word-wrap">
          <MenuItemIndicator keepMounted>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </MenuItemIndicator>
          Word wrap
        </MenuCheckboxItem>
      </MenuContent>
    </Menu>
  )
}

export { Example }
