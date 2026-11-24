import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/solid/tooltip"
import { For } from "solid-js"

const files = [
  "Quarterly report, final revised version for the board.pdf",
  "Notes.txt",
  "Design review recording, October 2nd.mp4",
  "Budget.xlsx",
]

function FileRow(props: { name: string }) {
  let text: HTMLSpanElement | undefined

  return (
    <li>
      <Tooltip
        type="label"
        onOpenChange={(open, details) => {
          const span = text
          if (open && span && span.scrollWidth <= span.clientWidth) {
            details.cancel()
          }
        }}
      >
        <TooltipTrigger>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
            <path d="M14 2v5a1 1 0 0 0 1 1h5" />
          </svg>
          <span ref={text}>{props.name}</span>
        </TooltipTrigger>
        <TooltipContent>{props.name}</TooltipContent>
      </Tooltip>
    </li>
  )
}

function Example() {
  return (
    <ul>
      <For each={files}>{(file) => <FileRow name={file} />}</For>
    </ul>
  )
}

export { Example }
