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
            <MenuSub>
              <MenuSubTrigger>
                Case
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
