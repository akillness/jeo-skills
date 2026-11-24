import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@ui-sdk/solid/autocomplete"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/solid/field"
import { For } from "solid-js"
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
  const log = useLog()
  return (
    <form
      id="order"
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        const data = [...new FormData(event.currentTarget)].map(
          ([name, value]) => `${name}=${value}`
        )
        log(`Submitted ${data.join("&")}`)
      }}
    >
      <Field>
        <FieldLabel>Fruit</FieldLabel>
        <Autocomplete name="fruit" form="order" required defaultValue="Apple">
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
        <FieldDescription>Any fruit, listed or not.</FieldDescription>
        <div>
          <FieldError />
        </div>
      </Field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">
          Submit
        </button>
        <button type="reset">Reset</button>
      </div>
    </form>
  )
}

export { Example }
