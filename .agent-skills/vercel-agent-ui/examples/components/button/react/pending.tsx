"use client"

import { Button } from "@ui-sdk/react/button"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function Example() {
  return (
    <Button onClick={() => wait(1500)} pendingAnnouncement="Saving">
      Save
    </Button>
  )
}

export { Example }
