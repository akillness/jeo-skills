"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"
import { ArchiveIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Tooltip
      onOpenChange={(open) => log(open ? "Opening" : "Closing")}
      onOpenChangeComplete={(open) => log(open ? "Open" : "Closed")}
    >
      <TooltipTrigger aria-label="Archive">
        <ArchiveIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>Archive</TooltipContent>
    </Tooltip>
  )
}

export { Example }
