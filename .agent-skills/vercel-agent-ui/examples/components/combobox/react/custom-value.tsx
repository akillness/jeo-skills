"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
} from "@ui-sdk/react/combobox"
import { CheckIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"
import * as React from "react"

const titles = [
  "Designer",
  "Engineer",
  "Engineering manager",
  "Product manager",
  "Researcher",
]

function Example() {
  const log = useLog()
  const [value, setValue] = React.useState<string | null>(null)

  return (
    <Combobox
      allowCustomValue
      value={value}
      onValueChange={(next, details) => {
        setValue(next)
        log(`${next ? `“${next}”` : "No title"} (${details.reason})`)
      }}
    >
      <div data-slot="stack">
        <ComboboxLabel>Job title</ComboboxLabel>
        <ComboboxInput placeholder="Type any title…" />
      </div>
      <ComboboxContent>
        <ComboboxEmpty>
          {(state) =>
            state.empty ? `Press Enter to use “${state.query}”.` : null
          }
        </ComboboxEmpty>
        <ComboboxList>
          {titles.map((title) => (
            <ComboboxItem key={title} value={title}>
              {title}
              <ComboboxItemIndicator>
                <CheckIcon aria-hidden="true" />
              </ComboboxItemIndicator>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
