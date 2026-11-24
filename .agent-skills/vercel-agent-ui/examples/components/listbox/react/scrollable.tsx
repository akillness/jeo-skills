"use client"

import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/react/listbox"
import { CheckIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const timezones = Array.from({ length: 27 }, (_, index) => {
  const offset = index - 12
  const label = `UTC${offset < 0 ? "−" : "+"}${String(Math.abs(offset)).padStart(2, "0")}:00`
  return { value: `utc${offset}`, label }
})

function Example() {
  const log = useLog()

  return (
    <Listbox
      defaultValue="utc9"
      onHighlight={(value, details) =>
        value &&
        log(
          `Focused ${timezones[details.index].label} (${details.index + 1} of ${timezones.length})`
        )
      }
      aria-label="Time zone"
    >
      {timezones.map((zone, index) => (
        <ListboxItem key={zone.value} value={zone.value} index={index}>
          {zone.label}
          <ListboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ListboxItemIndicator>
        </ListboxItem>
      ))}
    </Listbox>
  )
}

export { Example }
