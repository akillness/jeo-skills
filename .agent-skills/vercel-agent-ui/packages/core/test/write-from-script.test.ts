// @vitest-environment jsdom
import { expect, test } from "vitest"
import { dispatchChange } from "../src/foundation/forms/form"
import { writeFromScript } from "../src/foundation/forms/value"

test("state set from script quiets input and change on that element only", async () => {
  const [written, other] = [
    document.createElement("div"),
    document.createElement("section"),
  ]
  const inside = written.appendChild(document.createElement("span"))
  document.body.append(written, other)
  const heard: string[] = []
  for (const el of [written, inside, other]) {
    for (const type of ["input", "change"]) {
      el.addEventListener(type, () => heard.push(`${type} ${el.localName}`))
    }
  }
  writeFromScript(written, () =>
    [written, inside, other].forEach((el) => dispatchChange(el))
  )
  await Promise.resolve()
  expect(heard).toEqual(["input section", "change section"])
  written.remove()
  other.remove()
})
