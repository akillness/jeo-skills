// @vitest-environment jsdom
import { definePrimitive } from "@ui-sdk/core"
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { createAgent } from "../src/agent"
import { createParts } from "../src/primitive"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

const ran: string[] = []

const shell = definePrimitive({
  name: "shell",
  state: () => ({}),
  api: () => ({
    run: (command: string, flag?: { verbose: boolean }) => {
      ran.push(flag?.verbose ? `${command} -v` : command)
    },
  }),
  slots: (slot) => ({ root: slot({ attrs: () => ({ role: "group" }) }) }),
  agent: { actions: ["run"] },
})
const { Root: Shell } = createParts(shell, { root: "div" })

test("a component's own run action gets its arguments as written", async () => {
  root = createRoot(document.body.appendChild(document.createElement("div")))
  await React.act(async () => root!.render(<Shell aria-label="Shell" />))
  const agent = createAgent()
  const result = await agent.act({
    steps: [
      { ref: "Shell", action: "run", args: ["ls"] },
      { ref: "Shell", action: "run", args: ["pwd", { verbose: true }] },
    ],
  })
  expect(result.ok).toBe(true)
  expect(ran).toEqual(["ls", "pwd -v"])
})
