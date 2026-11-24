import {
  Menu,
  MenuContent,
  MenuItem,
  MenuItemIcon,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/react/menu"
import { Menubar } from "@ui-sdk/react/menubar"
import {
  CircleHelpIcon,
  FileIcon,
  FolderIcon,
  RedoIcon,
  SaveIcon,
  SettingsIcon,
  TrashIcon,
  UndoIcon,
} from "lucide-react"

export function Example() {
  return (
    <Menubar>
      <Menu>
        <MenuTrigger>File</MenuTrigger>
        <MenuContent>
          <MenuItem>
            <MenuItemIcon>
              <FileIcon />
            </MenuItemIcon>
            New File
          </MenuItem>
          <MenuItem>
            <MenuItemIcon>
              <FolderIcon />
            </MenuItemIcon>
            Open Folder
          </MenuItem>
          <MenuItem>
            <MenuItemIcon>
              <SaveIcon />
            </MenuItemIcon>
            Save
          </MenuItem>
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger>Edit</MenuTrigger>
        <MenuContent>
          <MenuItem>
            <MenuItemIcon mirror>
              <UndoIcon />
            </MenuItemIcon>
            Undo
          </MenuItem>
          <MenuItem>
            <MenuItemIcon mirror>
              <RedoIcon />
            </MenuItemIcon>
            Redo
          </MenuItem>
        </MenuContent>
      </Menu>
      <Menu>
        <MenuTrigger>More</MenuTrigger>
        <MenuContent>
          <MenuItem>
            <MenuItemIcon>
              <SettingsIcon />
            </MenuItemIcon>
            Settings
          </MenuItem>
          <MenuItem>
            <MenuItemIcon>
              <CircleHelpIcon />
            </MenuItemIcon>
            Help
          </MenuItem>
          <MenuSeparator />
          <MenuItem destructive>
            <MenuItemIcon>
              <TrashIcon />
            </MenuItemIcon>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </Menubar>
  )
}
