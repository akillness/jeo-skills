import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/solid/resizable"
import { createSignal } from "solid-js"

function Example() {
  const [locked, setLocked] = createSignal(false)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Checkbox
            checked={locked()}
            onCheckedChange={(next) => setLocked(next === true)}
          >
            <CheckboxIndicator>
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
            </CheckboxIndicator>
          </Checkbox>
          Lock layout
        </label>
      </div>
      <Resizable disabled={locked()}>
        <ResizablePanel minSize={15}>
          <h3>Pinned</h3>
          <span data-slot="hint">2 notes</span>
        </ResizablePanel>
        <ResizableHandle disabled aria-label="Resize pinned" />
        <ResizablePanel minSize={15}>
          <h3>Inbox</h3>
          <span data-slot="hint">3 unread</span>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize inbox" />
        <ResizablePanel minSize={15}>
          <h3>Message</h3>
          <span data-slot="hint">From Kofi Mensah</span>
        </ResizablePanel>
      </Resizable>
    </div>
  )
}

export { Example }
