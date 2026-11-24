import { expect, test } from "vitest"
import { createAgent } from "../src/agent"
import { createHistory } from "../src/history"

test.each(["spread", "reactive"])(
  "createHistory accepts an agent in a %s object",
  (mode) => {
    const agent = createAgent()
    const reactive = $state({ ...agent })
    const owner = mode === "spread" ? { ...agent } : reactive
    expect(owner.act).toBe(agent.act)
    const history = createHistory(owner)
    expect(history.entries()).toEqual([])
    history.destroy()
  }
)
