// @vitest-environment jsdom
import { expect, test } from "vitest"
import { toolbar } from "../src/components/toolbar/toolbar"
import { attrs, bind } from "../src/foundation/kernel/part"

test("a button that becomes disabled and unfocusable hands the tab stop to the next one", async () => {
  const bar = toolbar({ id: "t" })
  const unbinds = ["a", "b"].map((id) =>
    bind(
      bar.part("button", { id }),
      document.body.appendChild(document.createElement("button"))
    )
  )
  await Promise.resolve()
  expect(attrs(bar.part("button", { id: "a" })).tabindex).toBe("0")
  bar.part("button", { id: "a", disabled: true, focusableWhenDisabled: false })
  await Promise.resolve()
  expect(attrs(bar.part("button", { id: "b" })).tabindex).toBe("0")
  unbinds.forEach((unbind) => unbind?.())
  document.body.replaceChildren()
})
