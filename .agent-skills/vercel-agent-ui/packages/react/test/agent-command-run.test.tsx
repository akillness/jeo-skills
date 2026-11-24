// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { createAgent } from "../src/agent"
import { Command, CommandInput, CommandItem, CommandList } from "../src/command"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

const items = [
  { value: "calendar", label: "Calendar" },
  { value: "delete", label: "Delete account" },
]

const Commands = ({
  onAction,
  ...props
}: {
  onAction: (value: string) => void
  defaultQuery?: string
  defaultValue?: string
}) => (
  <Command items={items} onAction={onAction} {...props}>
    <CommandInput aria-label="Search commands" />
    <CommandList>
      {(state) =>
        state.items.map((item) =>
          "value" in item ? (
            <CommandItem
              key={item.value}
              value={item.value}
              data-agent-confirm={
                item.value === "delete" ? "Deletes your account" : undefined
              }
            >
              {item.label}
            </CommandItem>
          ) : null
        )
      }
    </CommandList>
  </Command>
)

const render = (element: React.ReactElement) => {
  root = createRoot(document.body.appendChild(document.createElement("div")))
  return React.act(async () => root!.render(element))
}

test("an agent can't run a marked command the query hides, so its mark is read", async () => {
  const onAction = vi.fn()
  await render(<Commands defaultQuery="cal" onAction={onAction} />)
  const agent = createAgent()
  const run = () =>
    agent.act({
      steps: [
        { ref: "Search commands", action: "run", args: ["Delete account"] },
      ],
    })
  expect((await run()).error?.message).toBe(
    `"Delete account" isn't shown in Search commands (${agent.snapshot()[0].ref}) now. Set the query or page that shows it, then run it.`
  )
  await agent.act({
    steps: [{ ref: "Search commands", action: "setQuery", args: [""] }],
  })
  expect((await run()).error?.message).toBe(
    'Needs a person: "Deletes your account". Ask them to make this change themselves.'
  )
  expect(onAction).not.toHaveBeenCalled()
})

test("an agent's run with no command reads the highlighted command's mark", async () => {
  const onAction = vi.fn()
  await render(<Commands defaultValue="delete" onAction={onAction} />)
  const agent = createAgent()
  for (const args of [[], [null]]) {
    const result = await agent.act({
      steps: [{ ref: "Search commands", action: "run", args }],
    })
    expect(result.error?.message).toBe(
      'Needs a person: "Deletes your account". Ask them to make this change themselves.'
    )
  }
  expect(onAction).not.toHaveBeenCalled()
})

test("an agent's run with no command runs the one approved, though the highlight moves", async () => {
  const onAction = vi.fn()
  await render(<Commands defaultValue="calendar" onAction={onAction} />)
  const input = document.querySelector("input")!
  const agent = createAgent({
    allow: async (step) => {
      await React.act(async () => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        )
      })
      return !step.confirm
    },
  })
  const result = await agent.act({
    steps: [{ ref: "Search commands", action: "run", args: [] }],
  })
  expect(result.ok).toBe(true)
  expect(onAction).toHaveBeenCalledTimes(1)
  expect(onAction.mock.calls[0][0]).toBe("calendar")
})
