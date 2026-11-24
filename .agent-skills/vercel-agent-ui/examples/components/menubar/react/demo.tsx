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
} from "@ui-sdk/react/menu"
import { Menubar } from "@ui-sdk/react/menubar"
import { CheckIcon, ChevronRightIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

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
              <ChevronRightIcon aria-hidden="true" />
            </MenuSubTrigger>
            <MenuSubContent>
              {recent.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </MenuSubContent>
          </MenuSub>
          <MenuSeparator />
          <MenuSub>
            <MenuSubTrigger>
              Export
              <ChevronRightIcon aria-hidden="true" />
            </MenuSubTrigger>
            <MenuSubContent>
              {formats.map((format) => (
                <MenuItem key={format} value={`Export as ${format}`}>
                  {format}
                </MenuItem>
              ))}
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
              <CheckIcon aria-hidden="true" />
            </MenuItemIndicator>
            Show Ruler
          </MenuCheckboxItem>
          <MenuCheckboxItem value="Word count" defaultChecked>
            <MenuItemIndicator>
              <CheckIcon aria-hidden="true" />
            </MenuItemIndicator>
            Show Word Count
          </MenuCheckboxItem>
          <MenuSeparator />
          <MenuRadioGroup defaultValue="System">
            <MenuGroupLabel>Appearance</MenuGroupLabel>
            {appearances.map((appearance) => (
              <MenuRadioItem key={appearance} value={appearance}>
                <MenuItemIndicator />
                {appearance}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    </Menubar>
  )
}

export { Example }
