import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/solid/popover"
import { createSignal, For } from "solid-js"

const sides = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
] as const
type Side = (typeof sides)[number]["value"]

function Example() {
  const [open, setOpen] = createSignal(false)
  const [side, setSide] = createSignal<Side>("bottom")
  let controls: HTMLDivElement | undefined

  return (
    <div data-slot="stack">
      <div data-slot="controls" role="group" aria-label="Side" ref={controls}>
        <For each={sides}>
          {(option) => (
            <button
              type="button"
              data-size="sm"
              aria-pressed={side() === option.value ? "true" : "false"}
              onClick={() => setSide(option.value)}
            >
              {option.label}
            </button>
          )}
        </For>
      </div>
      <Popover
        open={open()}
        onOpenChange={(next, details) => {
          const target = details.event?.target
          const inControls =
            target instanceof Node && controls?.contains(target)
          if (inControls && details.reason !== "escape-key") {
            return details.cancel()
          }
          setOpen(next)
        }}
      >
        <PopoverTrigger aria-label="Help">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        </PopoverTrigger>
        <PopoverContent side={side()} sideOffset={10} arrowPadding={12}>
          <PopoverArrow />
          <PopoverTitle>Keyboard shortcuts</PopoverTitle>
          <PopoverDescription>
            Press ? anywhere to see them all.
          </PopoverDescription>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
