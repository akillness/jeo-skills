"use client"

import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle"
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@ui-sdk/react/toolbar"
import { BoldIcon, ItalicIcon, LinkIcon } from "lucide-react"

function Example() {
  return (
    <div dir="rtl">
      <Toolbar aria-label="تنسيق">
        <Toggle aria-label="غامق">
          <ToggleIcon>
            <BoldIcon />
          </ToggleIcon>
        </Toggle>
        <Toggle aria-label="مائل">
          <ToggleIcon>
            <ItalicIcon />
          </ToggleIcon>
        </Toggle>
        <ToolbarSeparator />
        <ToolbarButton aria-label="إدراج رابط">
          <LinkIcon aria-hidden="true" />
        </ToolbarButton>
      </Toolbar>
    </div>
  )
}

export { Example }
