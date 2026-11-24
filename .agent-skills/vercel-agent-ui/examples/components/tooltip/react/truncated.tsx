"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"
import { FileIcon } from "lucide-react"
import * as React from "react"

const files = [
  "Quarterly report, final revised version for the board.pdf",
  "Notes.txt",
  "Design review recording, October 2nd.mp4",
  "Budget.xlsx",
]

function FileRow({ name }: { name: string }) {
  const text = React.useRef<HTMLSpanElement>(null)

  return (
    <li>
      <Tooltip
        type="label"
        onOpenChange={(open, details) => {
          const span = text.current
          if (open && span && span.scrollWidth <= span.clientWidth) {
            details.cancel()
          }
        }}
      >
        <TooltipTrigger>
          <FileIcon aria-hidden="true" />
          <span ref={text}>{name}</span>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
    </li>
  )
}

function Example() {
  return (
    <ul>
      {files.map((file) => (
        <FileRow key={file} name={file} />
      ))}
    </ul>
  )
}

export { Example }
