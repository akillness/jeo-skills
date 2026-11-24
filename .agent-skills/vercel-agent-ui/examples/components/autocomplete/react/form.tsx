"use client"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@ui-sdk/react/autocomplete"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/react/field"
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
              {fruits.map((fruit) => (
                <AutocompleteItem key={fruit} value={fruit}>
                  {fruit}
                </AutocompleteItem>
              ))}
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
