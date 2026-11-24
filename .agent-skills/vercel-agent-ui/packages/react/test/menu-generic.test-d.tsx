import { menu } from "@ui-sdk/core/menu"
import { createParts } from "../src/use-primitive"

const { Root: Menu, RadioGroup: MenuRadioGroup } = createParts(menu, {
  "radio-group": "div",
})

// A radio group's `T` comes from its `value`, and reaches `onValueChange`.
;<Menu>
  <MenuRadioGroup
    value="asc"
    onValueChange={(value) => {
      const known: "asc" = value
      // @ts-expect-error `value` is "asc", not a number.
      const wrong: number = value
      void known
      void wrong
    }}
  />
</Menu>
