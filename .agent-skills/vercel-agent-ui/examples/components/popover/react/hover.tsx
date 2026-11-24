"use client"

import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  return (
    <Popover openOnHover delay={200} closeDelay={150}>
      <PopoverTrigger>@kofi</PopoverTrigger>
      <PopoverContent sideOffset={8}>
        <PopoverArrow />
        <PopoverTitle>Kofi Mensah</PopoverTitle>
        <PopoverDescription>
          Engineering manager, platform team.
        </PopoverDescription>
        <div data-slot="row">
          <button
            type="button"
            data-size="sm"
            data-variant="solid"
            onClick={() => log("Followed @kofi")}
          >
            Follow
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { Example }
