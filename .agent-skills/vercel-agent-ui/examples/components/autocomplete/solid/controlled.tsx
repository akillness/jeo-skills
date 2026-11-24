import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/solid/autocomplete"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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

function Example() {
  const [value, setValue] = createSignal("")
  const [open, setOpen] = createSignal(false)
  const log = useLog()
  return (
    <div data-slot="stack">
      <Autocomplete
        value={value()}
        onValueChange={(next, details) => {
          if (next.length > 12) {
            return details.cancel()
          }
          setValue(next)
          log(`text: ${details.reason}`)
        }}
        open={open()}
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
            <For each={fruits}>
              {(fruit) => (
                <AutocompleteItem value={fruit}>{fruit}</AutocompleteItem>
              )}
            </For>
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </div>
  )
}

export { Example }
