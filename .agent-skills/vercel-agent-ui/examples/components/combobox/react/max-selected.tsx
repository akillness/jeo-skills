"use client"

import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue,
} from "@ui-sdk/react/combobox"
import { CheckIcon, XIcon } from "lucide-react"

const labels = [
  "Bug",
  "Feature",
  "Documentation",
  "Design",
  "Performance",
  "Security",
  "Testing",
]

function Example() {
  return (
    <Combobox multiple maxSelected={3} defaultValue={["Bug", "Design"]}>
      <div data-slot="stack">
        <ComboboxLabel>Labels (up to 3)</ComboboxLabel>
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
          <ComboboxInput placeholder="Add labels…" />
        </ComboboxChips>
      </div>
      <ComboboxContent>
        <ComboboxList>
          {labels.map((label) => (
            <ComboboxItem key={label} value={label}>
              {(state) => (
                <>
                  {label}
                  {state.maxReached && (
                    <span data-slot="hint">Limit reached</span>
                  )}
                  <ComboboxItemIndicator>
                    <CheckIcon aria-hidden="true" />
                  </ComboboxItemIndicator>
                </>
              )}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
