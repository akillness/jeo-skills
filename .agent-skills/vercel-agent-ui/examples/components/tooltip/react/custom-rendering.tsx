"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"

function Example() {
  return (
    <Tooltip>
      <TooltipTrigger
        data-variant="link"
        render={<a href="https://example.com/changelog" />}
      >
        Changelog
      </TooltipTrigger>
      <TooltipContent>See what's new in 2.0</TooltipContent>
    </Tooltip>
  )
}

export { Example }
