"use client"

import { Toolbar, ToolbarButton } from "@ui-sdk/react/toolbar"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  return (
    <Toolbar loop={false} aria-label="Pages">
      {["First", "Previous", "Next", "Last"].map((label) => (
        <ToolbarButton key={label} onClick={() => log(`${label} page`)}>
          {label}
        </ToolbarButton>
      ))}
    </Toolbar>
  )
}

export { Example }
