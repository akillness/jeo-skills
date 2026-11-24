"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"
import { BookmarkIcon } from "lucide-react"

function Example() {
  return (
    <Tooltip defaultOpen>
      <TooltipTrigger aria-label="Add to library">
        <BookmarkIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>Add to library</TooltipContent>
    </Tooltip>
  )
}

export { Example }
