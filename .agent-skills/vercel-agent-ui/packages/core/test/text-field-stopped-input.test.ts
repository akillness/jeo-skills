// @vitest-environment jsdom
import { expect, test, vi } from "vitest"
import { trustSent } from "../src/foundation/kernel/trusted"
import { textFieldAdapter } from "../src/foundation/text/caret"

test("an edit whose input event a listener stops is read later, still as a program's", async () => {
  const sent = new WeakSet<Event>()
  trustSent(sent)
  const dispatch = EventTarget.prototype.dispatchEvent
  vi.spyOn(EventTarget.prototype, "dispatchEvent").mockImplementation(function (
    this: EventTarget,
    event: Event
  ) {
    sent.add(event)
    return dispatch.call(this, event)
  })
  const field = document.body.appendChild(document.createElement("input"))
  const adapter = textFieldAdapter(field)
  const users: boolean[] = []
  const off = adapter.subscribe(
    (change) => change.type === "input" && users.push(change.user)
  )
  field.addEventListener("input", (event) => event.stopPropagation())
  field.value = "@"
  field.dispatchEvent(new InputEvent("input", { bubbles: true }))
  adapter.replace({ start: 1, end: 1 }, "ada ")
  await new Promise((resolve) => setTimeout(resolve))
  expect(users).toEqual([true, false])
  off()
  field.remove()
  vi.restoreAllMocks()
})
