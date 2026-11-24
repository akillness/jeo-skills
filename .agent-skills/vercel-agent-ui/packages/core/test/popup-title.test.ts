// @vitest-environment jsdom
// A popover's content is named by its title while one renders, else by its
// trigger. Until the content binds, as on the server, whether a title renders
// is unknown, so `titled` is null and the trigger names it.
import { afterEach, expect, test } from "vitest"
import { popover } from "../src/components/popover/popover"
import { attrs, ref } from "../src/foundation/kernel/part"

Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

afterEach(() => document.body.replaceChildren())

const host = { by: "framework", attaches: "all" } as const
const labelledBy = (instance: ReturnType<typeof popover>) =>
  attrs(instance.part("content"))["aria-labelledby"]

function bindContent(instance: ReturnType<typeof popover>) {
  const content = document.body.appendChild(document.createElement("div"))
  ref(instance.part("content"), host)(content)
  return content
}

test("a popover open before its parts bind doesn't know yet whether it's titled and is named by its trigger", () => {
  const instance = popover({ id: "p", defaultOpen: true })
  expect({
    titled: instance.get().titled,
    labelledBy: labelledBy(instance),
  }).toEqual({
    titled: null,
    labelledBy: "p-trigger",
  })
})

test("a popover whose content binds without a title is named by its trigger", async () => {
  const instance = popover({ id: "p", defaultOpen: true })
  bindContent(instance)
  await Promise.resolve()
  expect({
    titled: instance.get().titled,
    labelledBy: labelledBy(instance),
  }).toEqual({
    titled: false,
    labelledBy: "p-trigger",
  })
})

test("a popover whose title binds after its content is named by the title", async () => {
  const instance = popover({ id: "p", defaultOpen: true })
  const content = bindContent(instance)
  ref(
    instance.part("title"),
    host
  )(content.appendChild(document.createElement("h2")))
  await Promise.resolve()
  expect({
    titled: instance.get().titled,
    labelledBy: labelledBy(instance),
  }).toEqual({
    titled: true,
    labelledBy: "p-title",
  })
})
