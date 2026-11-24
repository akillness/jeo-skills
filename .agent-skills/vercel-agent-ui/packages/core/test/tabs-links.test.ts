// @vitest-environment jsdom
// A tab rendered as a link stays a link: it has no button `type`, which on
// an `<a>` names the linked resource's media type.
import { expect, test } from "vitest"
import { tabs } from "../src/components/tabs/tabs"
import { attrs, bind } from "../src/foundation/kernel/part"

test("a tab rendered as a link drops the button type once it binds, and a button keeps it", () => {
  const instance = tabs({ id: "links", defaultValue: "a" })
  const link = document.body.appendChild(
    Object.assign(document.createElement("a"), { href: "#a" })
  )
  const button = document.body.appendChild(document.createElement("button"))
  const linkTab = instance.part("tab", { value: "a" })
  const buttonTab = instance.part("tab", { value: "b" })
  expect(attrs(linkTab).type).toBe("button")
  const unbindLink = bind(linkTab, link)
  const unbindButton = bind(buttonTab, button)
  expect(attrs(linkTab)).toMatchObject({ role: "tab", type: undefined })
  expect(attrs(buttonTab)).toMatchObject({ role: "tab", type: "button" })
  unbindLink?.()
  unbindButton?.()
  link.remove()
  button.remove()
})
