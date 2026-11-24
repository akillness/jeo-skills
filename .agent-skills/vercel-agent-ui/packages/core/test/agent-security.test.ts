// @vitest-environment jsdom
// What an agent can never do, on every component: change what `allow` refused,
// reach a hidden or inert region, call an inherited method, or read a secret.
import { afterEach, describe, expect, test, vi } from "vitest"
import { createAgent } from "../src/page/agent/agent"
import { observe, type ObservedChange } from "../src/page/observe/observe"
import { mount } from "../src/testing/mount"
import { componentCases, type ComponentCase } from "./component-cases"

let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  unmount = undefined
})

async function mountCase(component: ComponentCase, markup = component.markup) {
  const mounted = mount(component.primitive, { ...component.options }, markup)
  unmount = mounted.unmount
  await mounted.settle()
  return mounted
}

const onPage = (agent: ReturnType<typeof createAgent>) =>
  agent.snapshot().filter((entry) => !entry.offPage)

// A step for each action, with the arguments that get it as far as `allow`:
// none, true for a setter of a flag, no files for a file input, or a button's
// text for a press.
const argsToTry = (buttons: string[] = []) => [
  [],
  [true],
  [[]],
  ...buttons.map((text) => [text]),
]

// What the component offers an agent while nothing guards it.
async function offered(component: ComponentCase) {
  const mounted = await mountCase(component)
  const [entry] = onPage(createAgent())
  mounted.unmount()
  return entry
}

// How many values each component held while the secret test read what an agent is told.
const canaries = new Map<string, number>()

describe.each(componentCases)("$name", (component) => {
  test("changes nothing for a step allow refused, whatever the action", async () => {
    const allow = vi.fn(() => false)
    const agent = createAgent({ allow })
    const mounted = await mountCase(component)
    const [entry] = onPage(agent)
    expect(entry.actions.length).toBeGreaterThan(0)
    const before = mounted.root.outerHTML
    const neverAsked: string[] = []
    for (const action of entry.actions) {
      allow.mockClear()
      for (const args of argsToTry(entry.buttons)) {
        const result = await agent.act({
          steps: [{ ref: entry.ref, action, args }],
        })
        expect(result.ok).toBe(false)
        if (allow.mock.calls.length > 0) {
          break
        }
      }
      if (allow.mock.calls.length === 0) {
        neverAsked.push(action)
      }
    }
    await mounted.settle()
    expect(neverAsked).toEqual([])
    expect(mounted.changes.map((change) => change.key)).toEqual([])
    expect(mounted.root.outerHTML).toBe(before)
  })

  test("is out of an agent's reach inside data-agent-hidden", async () => {
    const plain = await offered(component)
    const allow = vi.fn(() => true)
    const agent = createAgent({ allow })
    const mounted = await mountCase(
      component,
      `<div data-agent-hidden>${component.markup}</div>`
    )
    expect(onPage(agent)).toEqual([])
    expect(await agent.query({ kind: plain.component })).toEqual([])
    const names = [plain.component, plain.label].filter(
      (name): name is string => !!name
    )
    for (const ref of names) {
      for (const action of plain.actions) {
        for (const args of argsToTry(plain.buttons)) {
          const result = await agent.act({ steps: [{ ref, action, args }] })
          expect(result.ok).toBe(false)
        }
      }
    }
    await mounted.settle()
    expect(allow).not.toHaveBeenCalled()
    expect(mounted.changes.map((change) => change.key)).toEqual([])
  })

  test("takes nothing from an agent inside an inert region, like a person", async () => {
    const plain = await offered(component)
    const allow = vi.fn(() => true)
    const agent = createAgent({ allow })
    const mounted = await mountCase(
      component,
      `<div inert>${component.markup}</div>`
    )
    const [entry] = onPage(agent)
    expect(entry).toMatchObject({ disabled: true, actions: [] })
    for (const action of plain.actions) {
      for (const args of argsToTry(plain.buttons)) {
        const result = await agent.act({
          steps: [{ ref: entry.ref, action, args }],
        })
        expect(result.ok).toBe(false)
      }
    }
    // A step that names nothing looks inside closed sections, like an accordion's.
    await agent.act({
      steps: [{ ref: "Nothing by this name", action: "press" }],
    })
    await mounted.settle()
    expect(allow).not.toHaveBeenCalled()
    expect(mounted.changes.map((change) => change.key)).toEqual([])
  })

  test("takes no method it inherits as an action", async () => {
    const agent = createAgent()
    const mounted = await mountCase(component)
    const [entry] = onPage(agent)
    for (const action of [
      "constructor",
      "__proto__",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "__defineSetter__",
    ]) {
      const result = await agent.act({
        steps: [{ ref: entry.ref, action, args: ["polluted", () => {}] }],
      })
      expect(result.ok).toBe(false)
      expect(result.error?.message).toContain(`takes no ${action} now`)
    }
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
    expect(mounted.changes.map((change) => change.key)).toEqual([])
  })

  test("never tells an agent a value it holds inside data-agent-secret", async () => {
    const logged: ObservedChange[] = []
    const stop = observe((change) => logged.push(change))
    const agent = createAgent()
    const mounted = await mountCase(
      component,
      `<div data-agent-secret>${component.markup}</div>`
    )
    const [entry] = onPage(agent)
    const told: unknown[] = []
    const held: string[] = []
    for (const value of ["zq7canary", 739146]) {
      const outcome = await agent.act({
        steps: [{ ref: entry.ref, action: "setValue", args: [value] }],
      })
      told.push(outcome)
      if (outcome.ok) {
        held.push(String(value))
      }
    }
    await mounted.settle()
    told.push(onPage(agent), await agent.query({ kind: entry.component }))
    mounted.unmount()
    told.push(agent.snapshot(), logged)
    stop()
    const leaked = held.filter((value) => JSON.stringify(told).includes(value))
    expect(leaked).toEqual([])
    canaries.set(component.name, held.length)
  })
})

test("the secret check held a value in every component that takes text or a number", () => {
  expect(
    [...canaries].filter(([, held]) => held > 0).map(([name]) => name)
  ).toEqual([
    "autocomplete",
    "calendar",
    "date picker",
    "number input",
    "otp input",
    "password input",
    "slider",
    "token input",
  ])
})

// jsdom has no layout, so `checkVisibility` here stands in for the browser's:
// it hides what's inside `data-invisible` only when asked about `visibility`.
test("a component hidden with visibility: hidden isn't on the page", async () => {
  const prototype = HTMLElement.prototype as {
    checkVisibility?: (options?: { visibilityProperty?: boolean }) => boolean
  }
  prototype.checkVisibility = function (this: HTMLElement, options) {
    return !(options?.visibilityProperty && this.closest("[data-invisible]"))
  }
  try {
    const component = componentCases.find(({ name }) => name === "button")!
    const agent = createAgent()
    await mountCase(component, `<div data-invisible>${component.markup}</div>`)
    expect(onPage(agent)).toEqual([])
    const result = await agent.act({
      steps: [{ ref: "Save", action: "press" }],
    })
    expect(result.ok).toBe(false)
  } finally {
    delete prototype.checkVisibility
  }
})
