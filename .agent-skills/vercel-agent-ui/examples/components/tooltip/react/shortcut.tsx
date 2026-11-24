"use client"

import { registerShortcut } from "@ui-sdk/core/shortcuts"
import {
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "@ui-sdk/react/tooltip"
import { SaveIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  React.useEffect(() => {
    const offSave = registerShortcut("mod+s", () => log("Saved"))
    const offShare = registerShortcut("mod+shift+e", () => log("Shared"))
    return () => {
      offSave()
      offShare()
    }
  }, [log])

  return (
    <div data-slot="row">
      <Tooltip shortcut="mod+s">
        <TooltipTrigger aria-label="Save" onClick={() => log("Saved")}>
          <SaveIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          Save
          <TooltipShortcut />
        </TooltipContent>
      </Tooltip>
      <Tooltip shortcut="mod+shift+e">
        <TooltipTrigger onClick={() => log("Shared")}>Share</TooltipTrigger>
        <TooltipContent>
          Share with your team
          <TooltipShortcut />
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export { Example }
