import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroupLabel,
  MenuItem,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { Menubar } from "@ui-sdk/solid/menubar"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const recent = ["Q3 roadmap", "Launch checklist", "Offsite notes"]
const formats = ["PDF", "Markdown", "HTML"]
const appearances = ["Light", "Dark", "System"]

function Example() {
  const log = useLog()
  const chose = (value: string) => log(`Chose ${value}`)

  return (
    <Menubar>
      <Menu onAction={chose}>
        <MenuTrigger>File</MenuTrigger>
        <MenuContent>
          <MenuItem value="New document" shortcut="mod+n">
            New Document
          </MenuItem>
          <MenuItem value="Open" shortcut="mod+o">
            Open…
          </MenuItem>
          <MenuSub>
            <MenuSubTrigger>
              Open Recent
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
              <For each={recent}>
                {(name) => <MenuItem value={name}>{name}</MenuItem>}
              </For>
            </MenuSubContent>
          </MenuSub>
          <MenuSeparator />
          <MenuSub>
            <MenuSubTrigger>
              Export
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
              <For each={formats}>
                {(format) => (
                  <MenuItem value={`Export as ${format}`}>{format}</MenuItem>
                )}
              </For>
            </MenuSubContent>
          </MenuSub>
          <MenuItem value="Print" shortcut="mod+p">
            Print…
          </MenuItem>
        </MenuContent>
      </Menu>
      <Menu onAction={chose}>
        <MenuTrigger>Edit</MenuTrigger>
        <MenuContent>
          <MenuItem value="Undo" shortcut="mod+z" disabled>
            Undo
          </MenuItem>
          <MenuItem value="Redo" shortcut="mod+shift+z">
            Redo
          </MenuItem>
          <MenuSeparator />
          <MenuItem value="Cut" shortcut="mod+x">
            Cut
          </MenuItem>
          <MenuItem value="Copy" shortcut="mod+c">
            Copy
          </MenuItem>
          <MenuItem value="Paste" shortcut="mod+v">
            Paste
          </MenuItem>
          <MenuSeparator />
          <MenuItem value="Find" shortcut="mod+f">
            Find…
          </MenuItem>
        </MenuContent>
      </Menu>
      <Menu
        onCheckedChange={(checked, details) =>
          log(`${details.value} ${checked ? "on" : "off"}`)
        }
        onValueChange={(value) => log(`${value} appearance`)}
      >
        <MenuTrigger>View</MenuTrigger>
        <MenuContent>
          <MenuCheckboxItem value="Ruler">
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
            Show Ruler
          </MenuCheckboxItem>
          <MenuCheckboxItem value="Word count" defaultChecked>
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
            Show Word Count
          </MenuCheckboxItem>
          <MenuSeparator />
          <MenuRadioGroup defaultValue="System">
            <MenuGroupLabel>Appearance</MenuGroupLabel>
            <For each={appearances}>
              {(appearance) => (
                <MenuRadioItem value={appearance}>
                  <MenuItemIndicator />
                  {appearance}
                </MenuRadioItem>
              )}
            </For>
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    </Menubar>
  )
}

export { Example }
