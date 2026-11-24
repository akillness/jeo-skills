// A framework's values can go with its component, so a destroyed instance
// read later, like a checkbox group counting its checkboxes after they left,
// keeps what the framework last delivered.
import { expect, test } from "vitest"
import { popover } from "../src/components/popover/popover"

test("a destroyed instance keeps what its framework last delivered, without asking again", () => {
  const instance = popover({ id: "p", open: false })
  let gone = false
  instance.follow(() => {
    if (gone) {
      throw new Error("read the framework's options after the component left")
    }
    return { id: "p", open: true }
  })
  expect(instance.get().open).toBe(true)
  instance.destroy()
  gone = true
  expect(instance.get().open).toBe(true)
})
