"use client"

import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from "@ui-sdk/react/toolbar"
import {
  ClipboardIcon,
  CopyIcon,
  RedoIcon,
  ScissorsIcon,
  UndoIcon,
} from "lucide-react"
import { useLog } from "../../../shared/react/log"

const clipboard = [
  { label: "Cut", icon: ScissorsIcon },
  { label: "Copy", icon: CopyIcon },
  { label: "Paste", icon: ClipboardIcon },
]

function Example() {
  const log = useLog()
  return (
    <Toolbar aria-label="Edit">
      <ToolbarGroup aria-label="Clipboard">
        {clipboard.map(({ label, icon: Icon }) => (
          <ToolbarButton
            key={label}
            aria-label={label}
            onClick={() => log(label)}
          >
            <Icon aria-hidden="true" />
          </ToolbarButton>
        ))}
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup disabled aria-label="History">
        <ToolbarButton aria-label="Undo">
          <UndoIcon aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton aria-label="Redo">
          <RedoIcon aria-hidden="true" />
        </ToolbarButton>
      </ToolbarGroup>
    </Toolbar>
  )
}

export { Example }
