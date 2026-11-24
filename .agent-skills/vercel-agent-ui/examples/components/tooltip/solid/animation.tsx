import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/solid/tooltip"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <Tooltip
      onOpenChange={(open) => log(open ? "Opening" : "Closing")}
      onOpenChangeComplete={(open) => log(open ? "Open" : "Closed")}
    >
      <TooltipTrigger aria-label="Archive">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect width="20" height="5" x="2" y="3" rx="1" />
          <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
          <path d="M10 12h4" />
        </svg>
      </TooltipTrigger>
      <TooltipContent>Archive</TooltipContent>
    </Tooltip>
  )
}

export { Example }
