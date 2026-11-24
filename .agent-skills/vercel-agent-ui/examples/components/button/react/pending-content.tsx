"use client"

import { Button } from "@ui-sdk/react/button"
import { ArrowDownToLineIcon, LoaderCircleIcon } from "lucide-react"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function Example() {
  return (
    <Button onClick={() => wait(1500)} pendingAnnouncement="Saving">
      <ArrowDownToLineIcon data-show="idle" aria-hidden="true" />
      <LoaderCircleIcon
        data-show="pending"
        data-slot="spinner"
        aria-hidden="true"
      />
      Save
    </Button>
  )
}

export { Example }
