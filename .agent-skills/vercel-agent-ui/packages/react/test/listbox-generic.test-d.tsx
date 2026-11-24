import { listbox } from "@ui-sdk/core/listbox"
import { createParts } from "../src/use-primitive"

const { Root: Listbox, Item: ListboxItem } = createParts(listbox, {
  root: "div",
  item: "div",
})

// One value: `onValueChange` gets `T` or null.
;<Listbox
  defaultValue={1}
  onValueChange={(value) => {
    const known: number | null = value
    // @ts-expect-error `value` is a number or null, not a list.
    const wrong: number[] = value
    void known
    void wrong
  }}
/>
// `multiple` makes the value a list.
;<Listbox
  multiple
  onValueChange={(value) => {
    const known: string[] = value
    void known
  }}
/>
// @ts-expect-error With `multiple`, the value is a list.
;<Listbox multiple value={1} />
;<ListboxItem value={{ id: 1 }} />
// An inline list of objects with `multiple` still makes `T` the object.
;<Listbox
  multiple
  value={[{ id: 1 }]}
  onValueChange={(value) => {
    const known: { id: number }[] = value
    void known
  }}
/>
