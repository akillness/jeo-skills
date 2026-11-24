import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/solid/tooltip"
import { createSignal } from "solid-js"

const command = "npm install @ui-sdk/solid"

function Example() {
  const [copied, setCopied] = createSignal(false)

  return (
    <div data-slot="row">
      <code>{command}</code>
      <Tooltip
        closeOnPress={false}
        onOpenChangeComplete={(open) => !open && setCopied(false)}
      >
        <TooltipTrigger
          aria-label={copied() ? "Copied" : "Copy"}
          onClick={() => {
            navigator.clipboard?.writeText(command).catch(() => {})
            setCopied(true)
          }}
        >
          {copied() ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
          )}
        </TooltipTrigger>
        <TooltipContent>{copied() ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>
    </div>
  )
}

export { Example }
