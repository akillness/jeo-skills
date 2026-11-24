import { combobox } from "@ui-sdk/core/combobox"
import { createParts } from "../src/use-primitive"

const {
  Root: Combobox,
  Item: ComboboxItem,
  Chip: ComboboxChip,
} = createParts(combobox, { root: "div", item: "div", chip: "div" })
type User = { id: number; name: string }
declare const ada: User

// One value: `T` comes from `items`, and `onValueChange` gets `T` or null.
;<Combobox
  items={[{ value: ada, label: "Ada" }]}
  onValueChange={(value) => {
    const known: User | null = value
    // @ts-expect-error `value` is a user or null, not a list.
    const wrong: User[] = value
    void known
    void wrong
  }}
/>
// `multiple` makes the value a list.
;<Combobox
  multiple
  value={[ada]}
  onValueChange={(value) => {
    const known: User[] = value
    // @ts-expect-error `value` is a list.
    const wrong: User | null = value
    void known
    void wrong
  }}
/>
// Without a value, it's a string.
;<Combobox onValueChange={(value) => value?.toUpperCase()} />
// @ts-expect-error With `multiple`, the value is a list.
;<Combobox multiple defaultValue="ada" />
// Items and chips take any value.
;<ComboboxItem value={ada} />
;<ComboboxChip value={ada} />
// @ts-expect-error An item needs a value.
;<ComboboxItem />
// An inline list of objects with `multiple` still makes `T` the object.
;<Combobox
  multiple
  value={[{ id: 1 }]}
  onValueChange={(value) => {
    const known: { id: number }[] = value
    void known
  }}
/>
