"use client"

import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle"
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@ui-sdk/react/toolbar"
import { BoldIcon, ItalicIcon, LinkIcon, UnderlineIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const styles = [
  { label: "Bold", icon: BoldIcon },
  { label: "Italic", icon: ItalicIcon },
  { label: "Underline", icon: UnderlineIcon },
]

function Example() {
  const log = useLog()
  return (
    <Toolbar aria-label="Formatting">
      {styles.map(({ label, icon: Icon }) => (
        <Toggle
          key={label}
          aria-label={label}
          onPressedChange={(pressed) =>
            log(`${label} ${pressed ? "on" : "off"}`)
          }
        >
          <ToggleIcon>
            <Icon />
          </ToggleIcon>
        </Toggle>
      ))}
      <ToolbarSeparator />
      <ToolbarButton
        aria-label="Insert link"
        onClick={() => log("Insert link")}
      >
        <LinkIcon aria-hidden="true" />
      </ToolbarButton>
    </Toolbar>
  )
}

export { Example }
