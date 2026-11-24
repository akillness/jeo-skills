// Checked by vue-tsc, not run.
import {
  createLocalStorage,
  createPointerKind,
  createPreference,
} from "@ui-sdk/core"
import { usePreference } from "../../src/preferences"

const sidebar = createPreference({
  values: ["open", "closed"],
  defaultValue: "open",
  attribute: "data-sidebar",
  storage: createLocalStorage("sidebar"),
})

function preferenceTypes() {
  const pointer = usePreference(createPointerKind())
  const hover: "hover" | "none" | "unknown" = pointer.value.hover
  // @ts-expect-error The state keeps its type, so a value it can't hold fails.
  const typo: "nope" = pointer.value.hover
  const value: "open" | "closed" = usePreference(sidebar).value.value
  return [hover, typo, value]
}

export { preferenceTypes }
