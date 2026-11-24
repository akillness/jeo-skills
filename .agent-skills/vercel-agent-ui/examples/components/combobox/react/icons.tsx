"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIcon,
  ComboboxItemIndicator,
  ComboboxItemText,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValueIcon,
} from "@ui-sdk/react/combobox"
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  CircleCheckIcon,
  CircleXIcon,
} from "lucide-react"
import * as React from "react"

function Example() {
  const [field, setField] = React.useState<HTMLDivElement | null>(null)

  return (
    <Combobox>
      <div data-slot="stack">
        <ComboboxLabel>Status</ComboboxLabel>
        <div ref={setField} data-slot="row">
          <ComboboxValueIcon />
          <ComboboxInput placeholder="Select a status" />
          <ComboboxTrigger aria-label="Show statuses">
            <ChevronDownIcon aria-hidden="true" />
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent anchor={field}>
        <ComboboxEmpty>No statuses found.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxItem value="backlog" label="Backlog">
            <ComboboxItemIcon>
              <CircleIcon />
            </ComboboxItemIcon>
            <ComboboxItemText />
            <ComboboxItemIndicator>
              <CheckIcon aria-hidden="true" />
            </ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxItem value="in-progress" label="In progress">
            <ComboboxItemIcon mirror>
              <ArrowRightIcon />
            </ComboboxItemIcon>
            <ComboboxItemText />
            <ComboboxItemIndicator>
              <CheckIcon aria-hidden="true" />
            </ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxItem value="done" label="Done">
            <ComboboxItemIcon>
              <CircleCheckIcon />
            </ComboboxItemIcon>
            <ComboboxItemText />
            <ComboboxItemIndicator>
              <CheckIcon aria-hidden="true" />
            </ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxItem value="canceled" label="Canceled">
            <ComboboxItemIcon>
              <CircleXIcon />
            </ComboboxItemIcon>
            <ComboboxItemText />
            <ComboboxItemIndicator>
              <CheckIcon aria-hidden="true" />
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
