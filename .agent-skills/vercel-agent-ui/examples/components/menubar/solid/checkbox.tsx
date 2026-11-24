import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItemIndicator,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { Menubar } from "@ui-sdk/solid/menubar"
import { createSignal } from "solid-js"

export function Example() {
  const [statusBar, setStatusBar] = createSignal(true)
  return (
    <div data-slot="stack">
      <Menubar>
        <Menu>
          <MenuTrigger>View</MenuTrigger>
          <MenuContent>
            <MenuCheckboxItem
              value="status-bar"
              checked={statusBar()}
              onCheckedChange={setStatusBar}
            >
              <MenuItemIndicator>
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
              Status Bar
            </MenuCheckboxItem>
            <MenuCheckboxItem value="activity-bar" defaultChecked>
              <MenuItemIndicator>
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
              Activity Bar
            </MenuCheckboxItem>
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger>Format</MenuTrigger>
          <MenuContent>
            <MenuCheckboxItem value="strikethrough">
              <MenuItemIndicator>
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
              Strikethrough
            </MenuCheckboxItem>
            <MenuCheckboxItem value="code">
              <MenuItemIndicator>
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
              Code
            </MenuCheckboxItem>
          </MenuContent>
        </Menu>
      </Menubar>
      <output data-slot="output">
        Status bar {statusBar() ? "shown" : "hidden"}
      </output>
    </div>
  )
}
