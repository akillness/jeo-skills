import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { Toolbar, ToolbarButton } from "@ui-sdk/solid/toolbar"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const zooms = ["50%", "75%", "100%", "150%", "200%"]

function Example() {
  const log = useLog()
  const [zoom, setZoom] = createSignal("100%")
  const index = () => zooms.indexOf(zoom())
  const change = (value: string) => {
    setZoom(value)
    log(`Zoom ${value}`)
  }
  return (
    <Toolbar aria-label="View">
      <ToolbarButton
        aria-label="Zoom out"
        disabled={index() === 0}
        onClick={() => change(zooms[index() - 1])}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" x2="16.65" y1="21" y2="16.65" />
          <line x1="8" x2="14" y1="11" y2="11" />
        </svg>
      </ToolbarButton>
      <Select value={zoom()} onValueChange={(value) => value && change(value)}>
        <ToolbarButton
          render={(props) => <SelectTrigger {...props} />}
          aria-label="Zoom"
        >
          <SelectValue />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m7 15 5 5 5-5" />
            <path d="m7 9 5-5 5 5" />
          </svg>
        </ToolbarButton>
        <SelectContent>
          <For each={zooms}>
            {(zoom) => (
              <SelectItem value={zoom}>
                {zoom}
                <SelectItemIndicator>
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
                </SelectItemIndicator>
              </SelectItem>
            )}
          </For>
        </SelectContent>
      </Select>
      <ToolbarButton
        aria-label="Zoom in"
        disabled={index() === zooms.length - 1}
        onClick={() => change(zooms[index() + 1])}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" x2="16.65" y1="21" y2="16.65" />
          <line x1="11" x2="11" y1="8" y2="14" />
          <line x1="8" x2="14" y1="11" y2="11" />
        </svg>
      </ToolbarButton>
    </Toolbar>
  )
}

export { Example }
