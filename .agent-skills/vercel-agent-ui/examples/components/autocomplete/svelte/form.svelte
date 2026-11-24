<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteList,
  } from "@ui-sdk/svelte/autocomplete"
  import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
  } from "@ui-sdk/svelte/field"
  import { useLog } from "../../../shared/svelte/log"

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

  const log = useLog()

  function submit(event: SubmitEvent) {
    event.preventDefault()
    const data = [...new FormData(event.currentTarget as HTMLFormElement)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(`Submitted ${data.join("&")}`)
  }
</script>

<form id="order" data-slot="stack" onsubmit={submit}>
  <Field>
    <FieldLabel>Fruit</FieldLabel>
    <Autocomplete name="fruit" form="order" required defaultValue="Apple">
      <AutocompleteInput />
      <AutocompleteContent>
        <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
        <AutocompleteList>
          {#each fruits as fruit (fruit)}
            <AutocompleteItem value={fruit}>
              {fruit}
            </AutocompleteItem>
          {/each}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
    <FieldDescription>Any fruit, listed or not.</FieldDescription>
    <div><FieldError /></div>
  </Field>
  <div data-slot="row">
    <button type="submit" data-variant="solid"> Submit </button>
    <button type="reset"> Reset </button>
  </div>
</form>
