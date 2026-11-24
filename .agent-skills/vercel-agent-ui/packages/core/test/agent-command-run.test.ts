// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { command } from "../src/components/command/command"
import { createAgent } from "../src/page/agent/agent"
import { mount } from "../src/testing"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

test("an agent runs a command by its label", async () => {
  const onAction = vi.fn()
  mounts.push(
    mount(
      command,
      {
        items: [
          { value: "calendar", label: "Calendar" },
          { value: "profile", label: "Profile" },
          { value: "billing", label: "Billing", disabled: true },
        ],
        onAction,
      },
      `<root><input aria-label="Search commands"><list><item value="calendar">Calendar</item><item value="profile">Profile</item><item value="billing">Billing</item></list></root>`
    )
  )
  const agent = createAgent()
  const [entry] = agent.snapshot()
  expect(entry.actions).toContain("run")
  await agent.act({
    steps: [{ ref: entry.ref, action: "run", args: ["Profile"] }],
  })
  expect(onAction).toHaveBeenCalledTimes(1)
  expect(onAction.mock.calls[0][0]).toBe("profile")
  await expect(
    agent.act({ steps: [{ ref: entry.ref, action: "run", args: ["Billing"] }] })
  ).resolves.toMatchObject({ ok: false })
  expect(onAction).toHaveBeenCalledTimes(1)
})

test("a run names one command, so a list can't reach a marked one", async () => {
  const onAction = vi.fn()
  mounts.push(
    mount(
      command,
      { onAction },
      `<root><input aria-label="Search commands"><list><item value="calendar">Calendar</item><item value="delete" data-agent-confirm="Deletes the workspace.">Delete</item></list></root>`
    )
  )
  const allow = vi.fn(() => true)
  const agent = createAgent({ allow })
  const [entry] = agent.snapshot()
  for (const arg of [
    ["delete"],
    [["delete"]],
    ["calendar"],
    { value: "delete" },
  ]) {
    await expect(
      agent.act({ steps: [{ ref: entry.ref, action: "run", args: [arg] }] })
    ).resolves.toMatchObject({ ok: false })
  }
  expect(onAction).not.toHaveBeenCalled()
  expect(allow).not.toHaveBeenCalled()
})
