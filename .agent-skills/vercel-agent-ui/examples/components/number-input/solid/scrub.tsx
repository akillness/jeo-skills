import {
  NumberInput,
  NumberInputControl,
  NumberInputGroup,
  NumberInputScrubArea,
  NumberInputScrubAreaCursor,
} from "@ui-sdk/solid/number-input"
import { createUniqueId, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const fields = [
  { label: "X position", handle: "X", defaultValue: 120 },
  { label: "Y position", handle: "Y", defaultValue: 48 },
  { label: "Width", handle: "W", defaultValue: 320, min: 0 },
  { label: "Height", handle: "H", defaultValue: 240, min: 0 },
]

function Example() {
  const log = useLog()
  const title = createUniqueId()

  return (
    <div data-slot="card" role="group" aria-labelledby={title}>
      <h3 id={title}>Frame</h3>
      <div data-slot="grid">
        <For each={fields}>
          {({ label, handle, ...options }) => (
            <NumberInput
              {...options}
              onValueCommit={(value) => log(`${label} ${value ?? "empty"}`)}
            >
              <NumberInputGroup>
                <NumberInputScrubArea pixelsPerStep={1}>
                  <span aria-hidden="true">{handle}</span>
                  <NumberInputScrubAreaCursor>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m18 8 4 4-4 4" />
                      <path d="M2 12h20" />
                      <path d="m6 8-4 4 4 4" />
                    </svg>
                  </NumberInputScrubAreaCursor>
                </NumberInputScrubArea>
                <NumberInputControl aria-label={label} />
              </NumberInputGroup>
            </NumberInput>
          )}
        </For>
      </div>
    </div>
  )
}

export { Example }
