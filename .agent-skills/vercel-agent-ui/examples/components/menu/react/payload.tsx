"use client"

import * as React from "react"
import {
  createMenuController,
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/react/menu"
import { EllipsisIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

type File = { name: string; size: string }

const files: File[] = [
  { name: "Roadmap.pdf", size: "2.4 MB" },
  { name: "Budget.xlsx", size: "860 KB" },
  { name: "Team photo.jpg", size: "5.1 MB" },
]

function Example() {
  const [menu] = React.useState(() => createMenuController<File>())
  const log = useLog()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          onClick={async (event) => {
            const result = await menu.open({
              payload: files[0],
              anchor: event.currentTarget,
            })
            log(`Closed with ${result.reason}`)
          }}
        >
          Open {files[0].name} Actions
        </button>
      </div>
      <ul data-slot="list">
        {files.map((file) => (
          <li key={file.name} data-slot="row">
            {file.name}
            <span data-slot="hint">{file.size}</span>
            <MenuTrigger
              controller={menu}
              payload={file}
              aria-label={`Actions for ${file.name}`}
              data-variant="ghost"
              data-size="sm"
            >
              <EllipsisIcon aria-hidden="true" />
            </MenuTrigger>
          </li>
        ))}
      </ul>
      <Menu
        controller={menu}
        onAction={(action) => log(`${action} ${menu.getPayload()?.name}`)}
      >
        <MenuContent<File> align="end">
          {(state) => (
            <>
              <MenuGroup>
                <MenuGroupLabel>{state.payload?.name}</MenuGroupLabel>
                <MenuItem value="open">Open</MenuItem>
                <MenuItem value="rename">Rename</MenuItem>
                <MenuItem value="duplicate">Duplicate</MenuItem>
              </MenuGroup>
              <MenuSeparator />
              <MenuItem value="delete">Delete</MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </div>
  )
}

export { Example }
