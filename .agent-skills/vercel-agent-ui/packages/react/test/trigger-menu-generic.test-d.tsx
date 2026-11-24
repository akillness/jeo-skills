import { triggerMenu } from "@ui-sdk/core/trigger-menu"
import { createParts } from "../src/use-primitive"

const { Root: TriggerMenu, Item: TriggerMenuItem } = createParts(triggerMenu, {
  item: "div",
})
type Person = { id: number; name: string }
declare const ada: Person

// `T` comes from the triggers' items, and reaches `onSelect`.
;<TriggerMenu
  triggers={[{ char: "@", items: [{ value: ada, label: "Ada" }] }]}
  onSelect={(value) => {
    const known: Person = value
    // @ts-expect-error `value` is a person, not a string.
    const wrong: string = value
    void known
    void wrong
  }}
/>
;<TriggerMenuItem value={ada} onSelect={(value) => void value.name} />
