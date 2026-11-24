"use client"

import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxCreate,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue,
} from "@ui-sdk/react/combobox"
import { CheckIcon, LoaderCircleIcon, PlusIcon, XIcon } from "lucide-react"
import * as React from "react"

const initialLabels = [
  "Bug",
  "Feature",
  "Documentation",
  "Design",
  "Performance",
  "Security",
  "Testing",
]

function saveLabel(name: string) {
  return new Promise<void>((resolve, reject) =>
    setTimeout(
      () =>
        name.length > 20
          ? reject(new Error("Labels are 20 characters at most."))
          : resolve(),
      800
    )
  )
}

function Example() {
  const [labels, setLabels] = React.useState(initialLabels)
  const [value, setValue] = React.useState<string[]>(["Bug"])

  return (
    <Combobox multiple value={value} onValueChange={setValue}>
      <div data-slot="stack">
        <ComboboxLabel>Labels</ComboboxLabel>
        <ComboboxChips>
          <ComboboxValue>
            {(state) =>
              (state.value as string[]).map((label) => (
                <ComboboxChip key={label} value={label}>
                  {label}
                  <ComboboxChipRemove aria-label={`Remove ${label}`}>
                    <XIcon aria-hidden="true" />
                  </ComboboxChipRemove>
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxInput placeholder="Add or create a label…" />
        </ComboboxChips>
      </div>
      <ComboboxContent>
        <ComboboxList>
          {labels.map((label) => (
            <ComboboxItem key={label} value={label}>
              {label}
              <ComboboxItemIndicator>
                <CheckIcon aria-hidden="true" />
              </ComboboxItemIndicator>
            </ComboboxItem>
          ))}
          <ComboboxCreate
            minLength={2}
            onCreate={async (query) => {
              await saveLabel(query)
              setLabels((list) => [...list, query])
              setValue((list) => [...list, query])
            }}
          >
            {(state) =>
              state.pending ? (
                <>
                  <LoaderCircleIcon aria-hidden="true" data-slot="spinner" />
                  Creating “{state.query}”…
                </>
              ) : (
                <>
                  <PlusIcon aria-hidden="true" />
                  <span data-slot="stack">
                    Create “{state.query}”
                    {state.error ? (
                      <span data-slot="hint">
                        {(state.error as Error).message}
                      </span>
                    ) : null}
                  </span>
                </>
              )
            }
          </ComboboxCreate>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
