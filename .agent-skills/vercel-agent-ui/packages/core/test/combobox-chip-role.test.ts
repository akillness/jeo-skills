// A chip is a group named by its value's label, so it reads as that value and
// not as its text and its remove button's together.
import { expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { comboboxChips } from "../src/renderer"
import { partAttrs } from "../src/testing"

test("a chip is a group named by its label", () => {
  const instance = combobox({
    id: "labels",
    multiple: true,
    defaultValue: ["perf"],
    items: [{ value: "perf", label: "Performance" }],
  })
  instance.use(comboboxChips)
  expect(partAttrs(instance.part("chip", { value: "perf" }))).toMatchObject({
    role: "group",
    "aria-label": "Performance",
  })
})
