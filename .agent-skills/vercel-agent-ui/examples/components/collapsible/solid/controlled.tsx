import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  createCollapsibleController,
} from "@ui-sdk/solid/collapsible"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const recoveryCodes = ["7KQ2-M9XD", "P4TR-8HZC", "W3NB-6JUE", "C5YF-2LSA"]

function Example() {
  const log = useLog()
  const collapsible = createCollapsibleController()
  const [open, setOpen] = createSignal(false)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => collapsible.toggle()}>
          Toggle
        </button>
      </div>
      <Collapsible
        data-variant="card"
        open={open()}
        onOpenChange={(next, details) => {
          setOpen(next)
          log(`${next ? "Opened" : "Closed"} (${details.reason})`)
        }}
        controller={collapsible}
      >
        <CollapsibleTrigger>
          <span data-slot="stack">
            <span>Recovery codes</span>
            <span data-slot="hint">Each code signs you in once</span>
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div data-slot="stack">
            <ul>
              <For each={recoveryCodes}>{(code) => <li>{code}</li>}</For>
            </ul>
            <button type="button" onClick={() => collapsible.close()}>
              Done
            </button>
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  )
}

export { Example }
