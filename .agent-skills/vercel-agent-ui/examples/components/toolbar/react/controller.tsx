"use client"

import { useShortcut } from "@ui-sdk/react/shortcuts"
import {
  createToolbarController,
  Toolbar,
  ToolbarButton,
} from "@ui-sdk/react/toolbar"
import { BoldIcon, ItalicIcon, LinkIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const actions = [
  { label: "Bold", icon: BoldIcon },
  { label: "Italic", icon: ItalicIcon },
  { label: "Insert link", icon: LinkIcon },
]

function Example() {
  const log = useLog()
  const [toolbar] = React.useState(createToolbarController)
  useShortcut("alt+f10", () => toolbar.focus(), { allowInInput: true })
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => toolbar.focus()}>
          Focus Toolbar
        </button>
      </div>
      <Toolbar controller={toolbar} aria-label="Notes formatting">
        {actions.map(({ label, icon: Icon }) => (
          <ToolbarButton
            key={label}
            aria-label={label}
            onClick={() => log(label)}
          >
            <Icon aria-hidden="true" />
          </ToolbarButton>
        ))}
      </Toolbar>
      <textarea aria-label="Notes" placeholder="Type, then press Alt+F10" />
    </div>
  )
}

export { Example }
