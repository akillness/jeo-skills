"use client"

import {
  Toolbar,
  ToolbarButton,
  ToolbarLink,
  ToolbarSeparator,
} from "@ui-sdk/react/toolbar"
import { CheckIcon, MessageSquareIcon } from "lucide-react"
import type * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const follow = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    event.preventDefault()
    log(`Opened ${event.currentTarget.textContent}`)
  }
  return (
    <Toolbar aria-label="Pull request">
      <ToolbarButton aria-label="Approve" onClick={() => log("Approved")}>
        <CheckIcon aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton aria-label="Comment" onClick={() => log("Comment")}>
        <MessageSquareIcon aria-hidden="true" />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarLink href="#files" onClick={follow}>
        Files Changed
      </ToolbarLink>
      <ToolbarLink href="#checks" onClick={follow}>
        Checks
      </ToolbarLink>
    </Toolbar>
  )
}

export { Example }
