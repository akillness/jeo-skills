"use client"

import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Popover
      onOpenChange={(open) => log(open ? "Opening" : "Closing")}
      onOpenChangeComplete={(open) => log(open ? "Open" : "Closed")}
    >
      <PopoverTrigger>What's New</PopoverTrigger>
      <PopoverContent keepMounted>
        <PopoverTitle>What's new</PopoverTitle>
        <PopoverDescription>
          Comments now support threads and reactions.
        </PopoverDescription>
        <div data-slot="row">
          <PopoverClose data-variant="solid">Got It</PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { Example }
