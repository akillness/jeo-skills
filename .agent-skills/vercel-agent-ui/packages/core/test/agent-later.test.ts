// @vitest-environment jsdom
// An agent created after the page rendered, like one a chat panel loads on
// demand. Its own file, so nothing created an agent before the components.
import { expect, test } from "vitest"
import { checkbox } from "../src/components/checkbox/checkbox"
import { watchers } from "../src/foundation/kernel/watchers"
import { bind } from "../src/foundation/kernel/part"
import { createAgent } from "../src/page/agent/agent"

test("an agent created later finds the components already on the page", () => {
  expect(watchers.add).toBeUndefined()
  const instance = checkbox({ id: "late" })
  // Made and never mounted or destroyed, like a render a framework threw away.
  checkbox({ id: "spare" })
  const label = document.createElement("label")
  const el = document.createElement("button")
  label.append(el, "Subscribe")
  document.body.append(label)
  const unbind = bind(instance.part("root"), el)
  const agent = createAgent()
  expect(agent.snapshot()).toEqual([
    expect.objectContaining({ component: "checkbox", label: "Subscribe" }),
  ])
  unbind()
  instance.destroy()
})
