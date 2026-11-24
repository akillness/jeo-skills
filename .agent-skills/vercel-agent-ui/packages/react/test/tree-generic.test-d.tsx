import { tree } from "@ui-sdk/core/tree"
import { createParts } from "../src/use-primitive"

const { Root: Tree } = createParts(tree, { root: "div" })

// One item by default: `onValueChange` gets a value or null.
;<Tree
  onValueChange={(value) => {
    const known: string | null = value
    // @ts-expect-error `value` is a value or null, not a list.
    const wrong: string[] = value
    void known
    void wrong
  }}
/>
// `mode: "multiple"` makes the value a list.
;<Tree
  mode="multiple"
  onValueChange={(value) => {
    const known: string[] = value
    // @ts-expect-error `value` is a list.
    const wrong: string | null = value
    void known
    void wrong
  }}
/>
// @ts-expect-error A single selection isn't a list.
;<Tree defaultValue={["src"]} />
// @ts-expect-error A multiple selection is a list.
;<Tree mode="multiple" defaultValue="src" />
