"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"
import { CheckIcon, CopyIcon } from "lucide-react"
import * as React from "react"

const command = "npm install @ui-sdk/react"

function Example() {
  const [copied, setCopied] = React.useState(false)

  return (
    <div data-slot="row">
      <code>{command}</code>
      <Tooltip
        closeOnPress={false}
        onOpenChangeComplete={(open) => !open && setCopied(false)}
      >
        <TooltipTrigger
          aria-label={copied ? "Copied" : "Copy"}
          onClick={() => {
            navigator.clipboard?.writeText(command).catch(() => {})
            setCopied(true)
          }}
        >
          {copied ? (
            <CheckIcon aria-hidden="true" />
          ) : (
            <CopyIcon aria-hidden="true" />
          )}
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>
    </div>
  )
}

export { Example }
