import { toggleGroup } from "@ui-sdk/core/toggle"
import { createParts } from "../src/use-primitive"

const { Root: ToggleGroup } = createParts(toggleGroup, { group: "div" })

// `T` comes from `defaultValue`, and reaches `onValueChange`.
;<ToggleGroup
  defaultValue={["bold"]}
  onValueChange={(value) => {
    const known: "bold"[] = value
    // @ts-expect-error `value` lists "bold", not numbers.
    const wrong: number[] = value
    void known
    void wrong
  }}
/>
