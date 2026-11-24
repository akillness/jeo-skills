"use client"

import { Toolbar, ToolbarButton } from "@ui-sdk/react/toolbar"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  return (
    <Toolbar aria-label="Message">
      <ToolbarButton onClick={() => log("Reply")}>Reply</ToolbarButton>
      <ToolbarButton disabled onClick={() => log("Archive")}>
        Archive
      </ToolbarButton>
      <ToolbarButton
        disabled
        focusableWhenDisabled={false}
        onClick={() => log("Delete")}
      >
        Delete
      </ToolbarButton>
    </Toolbar>
  )
}

export { Example }
