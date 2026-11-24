import * as React from "react"
import { select } from "@ui-sdk/core/select"
import { createParts } from "../src/use-primitive"

const { Root: Select, Item: SelectItem } = createParts(select, {
  root: "div",
  item: "div",
})
type Fruit = { name: string }
declare const apple: Fruit

// One value: `T` comes from `value`, and `onValueChange` gets `T` or null.
;<Select
  value={apple}
  onValueChange={(value) => {
    const known: Fruit | null = value
    // @ts-expect-error `value` is a fruit or null, not a list.
    const wrong: Fruit[] = value
    void known
    void wrong
  }}
/>
// `multiple` makes the value a list.
;<Select
  multiple
  defaultValue={[1, 2]}
  onValueChange={(value) => {
    const known: number[] = value
    // @ts-expect-error `value` is a list.
    const wrong: number | null = value
    void known
    void wrong
  }}
/>
// `T` comes from `items` too.
;<Select
  items={[{ value: 1, label: "One" }]}
  onValueChange={(value) => {
    const known: number | null = value
    void known
  }}
/>
// Without a value, it's a string.
;<Select onValueChange={(value) => value?.toUpperCase()} />
;<Select
  multiple
  onValueChange={(value) => value.map((item) => item.toUpperCase())}
/>
// @ts-expect-error With `multiple`, the value is a list.
;<Select multiple value={apple} />
// An item's `value` is any type, and the root's `T` doesn't reach it.
;<SelectItem
  value={apple}
  className={(state) => (state.selected ? "on" : "off")}
/>

// A state's setter is a callback for either shape.
function Controlled() {
  const [values, setValues] = React.useState<string[]>([])
  const [value, setValue] = React.useState<string | null>(null)
  return (
    <>
      <Select multiple value={values} onValueChange={setValues} />
      <Select value={value} onValueChange={setValue} />
    </>
  )
}
void Controlled
// An inline list of objects with `multiple` still makes `T` the object.
;<Select
  multiple
  value={[{ id: 1 }]}
  onValueChange={(value) => {
    const known: { id: number }[] = value
    // @ts-expect-error `value` is a list of objects, not a list of lists.
    const wrong: { id: number }[][] = value
    void known
    void wrong
  }}
/>
