"use client"

import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui-sdk/react/command"
import { LoaderCircleIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

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
                {state.pending && (
                  <LoaderCircleIcon data-slot="spinner" aria-hidden="true" />
                )}
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
                {state.pending ? (
                  <LoaderCircleIcon data-slot="spinner" aria-hidden="true" />
                ) : (
                  state.error !== undefined && (
                    <span data-slot="hint">Failed, try again</span>
                  )
                )}
              </>
            )}
          </CommandItem>
        </CommandList>
      </Command>
    </div>
  )
}

export { Example }
