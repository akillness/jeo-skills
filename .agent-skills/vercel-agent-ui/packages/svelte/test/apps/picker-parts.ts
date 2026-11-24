import { createParts } from "../../src/create-parts"
import { picker } from "./picker"

const {
  Root: Picker,
  Item: PickerItem,
  Label: PickerLabel,
} = createParts(picker, {
  root: "div",
  item: "div",
  label: "button",
})

export { Picker, PickerItem, PickerLabel }
