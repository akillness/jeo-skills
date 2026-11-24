import { radioGroup } from "@ui-sdk/core/radio"
import { createParts } from "../src/use-primitive"

const { Root: RadioGroup } = createParts(radioGroup, { group: "div" })

// `T` comes from `value`, and reaches `onValueChange`.
;<RadioGroup
  defaultValue="small"
  onValueChange={(value) => {
    const known: "small" | null = value
    // @ts-expect-error `value` is "small" or null, not a number.
    const wrong: number = value
    void known
    void wrong
  }}
/>
// Without a value, it's any string.
;<RadioGroup onValueChange={(value) => value?.toUpperCase()} />
// @ts-expect-error Values are strings.
;<RadioGroup value={1} />
