import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui-sdk/solid/command"
import { Show } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const Spinner = () => (
  <svg
    data-slot="spinner"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

function Example() {
  const log = useLog()
  return (
    <div data-slot="stack">
      <Command>
        <CommandInput
          aria-label="Search actions"
          placeholder="Search actions…"
        />
        <CommandList>
          <CommandItem
            value="deploy"
            onSelect={async () => {
              await wait(1200)
              log("Deployed to production")
            }}
          >
            {(state) => (
              <>
                Deploy to production
                <Show when={state.pending}>
                  <Spinner />
                </Show>
              </>
            )}
          </CommandItem>
          <CommandItem
            value="sync"
            onSelect={async () => {
              await wait(600)
              log("Couldn't sync: offline")
              throw new Error("Offline")
            }}
          >
            {(state) => (
              <>
                Sync with server
                <Show
                  when={state.pending}
                  fallback={
                    <Show when={state.error !== undefined}>
                      <span data-slot="hint">Failed, try again</span>
                    </Show>
                  }
                >
                  <Spinner />
                </Show>
              </>
            )}
          </CommandItem>
        </CommandList>
      </Command>
    </div>
  )
}

export { Example }
