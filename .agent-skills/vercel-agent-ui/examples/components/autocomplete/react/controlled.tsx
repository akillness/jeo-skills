import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/react/autocomplete"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const fruits = [
  "Apple",
  "Apricot",
  "Avocado",
  "Banana",
  "Blackberry",
  "Blueberry",
  "Cherry",
  "Grape",
  "Lemon",
  "Mango",
  "Orange",
  "Peach",
  "Pear",
  "Pineapple",
  "Strawberry",
]

export function Example() {
  const [value, setValue] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const log = useLog()
  return (
    <div data-slot="stack">
      <Autocomplete
        value={value}
        onValueChange={(next, details) => {
          if (next.length > 12) {
            return details.cancel()
          }
          setValue(next)
          log(`text: ${details.reason}`)
        }}
        open={open}
        onOpenChange={(next, details) => {
          setOpen(next)
          log(`${next ? "opened" : "closed"}: ${details.reason}`)
        }}
        onOpenChangeComplete={(next) =>
          log(`${next ? "opened" : "closed"} and settled`)
        }
        onHighlight={(highlighted) =>
          highlighted && log(`highlighted ${highlighted}`)
        }
        debug
      >
        <AutocompleteLabel>Fruit (12 characters at most)</AutocompleteLabel>
        <AutocompleteInput />
        <AutocompleteContent>
          <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
          <AutocompleteList>
            {fruits.map((fruit) => (
              <AutocompleteItem key={fruit} value={fruit}>
                {fruit}
              </AutocompleteItem>
            ))}
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </div>
  )
}
