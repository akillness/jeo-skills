import { checkboxGroup } from "@ui-sdk/core/checkbox"
import { createParts } from "../src/use-primitive"

const { Root: CheckboxGroup } = createParts(checkboxGroup, { group: "div" })

// `T` comes from `allValues`, and reaches `onValueChange`.
;<CheckboxGroup
  allValues={["email", "sms"]}
  onValueChange={(value) => {
    const known: ("email" | "sms")[] = value
    // @ts-expect-error `value` lists channels, not numbers.
    const wrong: number[] = value
    void known
    void wrong
  }}
/>
