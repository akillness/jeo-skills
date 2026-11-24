// @vitest-environment node
// On a server, where client modules run too, the agent keeps nothing: a
// server renders each page once and never binds, so nothing would ever leave.
import { expect, test } from "vitest"
import { checkbox } from "../src/components/checkbox/checkbox"
import { watchers } from "../src/foundation/kernel/watchers"
import { createAgent } from "../src/page/agent/agent"

test("an agent on a server hears no components", () => {
  const agent = createAgent()
  for (let index = 0; index < 50; index++) {
    checkbox({ id: `terms-${index}` })
  }
  expect(watchers.add).toBeUndefined()
  expect(agent.snapshot()).toEqual([])
})
