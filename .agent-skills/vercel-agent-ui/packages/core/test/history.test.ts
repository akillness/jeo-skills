// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import {
  checkbox,
  type CheckedState,
} from "../src/components/checkbox/checkbox"
import { input } from "../src/components/input/input"
import { numberInput } from "../src/components/number-input/number-input"
import { withSource } from "../src/foundation/kernel/details"
import { bind } from "../src/foundation/kernel/part"
import { createAgent } from "../src/page/agent/agent"
import { createHistory } from "../src/page/history/history"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

// A checked checkbox the agent checked, whose change callback refuses once `refusing` is set.
async function checkedByAgent() {
  const agent = createAgent()
  const history = createHistory(agent)
  let refusing = false
  const instance = checkbox({
    id: "digest",
    onCheckedChange: (_checked, details) => {
      if (refusing) {
        details.cancel()
      }
    },
  })
  const el = document.body.appendChild(document.createElement("button"))
  el.setAttribute("aria-label", "Weekly digest")
  cleanups.push(
    bind(instance.part("root"), el),
    () => instance.destroy(),
    history.destroy
  )
  const [{ ref }] = agent.snapshot()
  await agent.act({ steps: [{ ref, action: "setChecked", args: [true] }] })
  return { instance, history, refuse: () => (refusing = true) }
}

test("undo puts back what the agent changed", async () => {
  const { instance, history } = await checkedByAgent()
  expect(await history.undoSource("agent")).toEqual([])
  expect(instance.get().checked).toBe(false)
  expect(history.entries()[0].reverted).toBe(true)
})

test("an undo a change callback refuses is reported, and its entry stays applied", async () => {
  const { instance, history, refuse } = await checkedByAgent()
  refuse()
  expect(await history.undoSource("agent")).toEqual([
    expect.objectContaining({ key: "checked", value: false }),
  ])
  expect(instance.get().checked).toBe(true)
  expect(history.entries()[0].reverted).toBeUndefined()
})

test("a seek a change callback refuses is reported, and the position stays", async () => {
  const { instance, history, refuse } = await checkedByAgent()
  refuse()
  expect(await history.seek(0)).toEqual([
    expect.objectContaining({ key: "checked", value: false }),
  ])
  expect(instance.get().checked).toBe(true)
  expect(history.position()).toBe(1)
})

test("an undo a controlled owner doesn't take is reported, and its entry stays applied", async () => {
  const agent = createAgent()
  const history = createHistory(agent)
  let accepting = true
  const options = {
    id: "digest",
    checked: false as CheckedState,
    onCheckedChange: (checked: CheckedState) => {
      if (accepting) {
        instance.setOptions({ ...options, checked })
      }
    },
  }
  const instance = checkbox(options)
  const el = document.body.appendChild(document.createElement("button"))
  el.setAttribute("aria-label", "Weekly digest")
  cleanups.push(
    bind(instance.part("root"), el),
    () => instance.destroy(),
    history.destroy
  )
  const [{ ref }] = agent.snapshot()
  await agent.act({ steps: [{ ref, action: "setChecked", args: [true] }] })
  expect(instance.get().checked).toBe(true)
  accepting = false
  expect(await history.undoSource("agent")).toEqual([
    expect.objectContaining({ key: "checked", value: false }),
  ])
  expect(instance.get().checked).toBe(true)
  expect(history.entries()[0].reverted).toBeUndefined()
})

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test("a replaced act method is rejected before restoring can bypass its guard", () => {
  const agent = createAgent()
  expect(() =>
    createHistory({ ...agent, act: (input) => agent.act(input) })
  ).toThrow(
    "createHistory requires an agent with the original act method returned by createAgent."
  )
})

for (const operation of ["undo", "seek"] as const) {
  test.each(["same control", "another control", "no edit"])(
    `${operation} preserves a human edit to %s while permission is pending`,
    async (target) => {
      let waiting = false
      const started = deferred()
      const release = deferred()
      const agent = createAgent({
        allow: async () => {
          if (waiting) {
            started.resolve()
            await release.promise
          }
          return true
        },
      })
      const history = createHistory(agent, { coalesce: false })
      const first = input({ id: "first", defaultValue: "initial" })
      const second = input({ id: "second", defaultValue: "untouched" })
      for (const [instance, label] of [
        [first, "First"],
        [second, "Second"],
      ] as const) {
        const element = document.body.appendChild(
          document.createElement("input")
        )
        element.value = instance.get().value
        element.setAttribute("aria-label", label)
        cleanups.push(bind(instance.part("root"), element), () =>
          instance.destroy()
        )
      }
      cleanups.push(history.destroy, release.resolve)
      expect(
        (
          await agent.act({
            steps: [{ ref: "First", action: "setValue", args: ["agent"] }],
          })
        ).ok
      ).toBe(true)
      waiting = true
      const work =
        operation === "undo" ? history.undoSource("agent") : history.seek(0)
      await started.promise
      if (target !== "no edit") {
        const edited = target === "same control" ? first : second
        withSource("keyboard", () =>
          edited.api.setValue("human", { reason: "input-change" })
        )
        expect(edited.get().value).toBe("human")
      }
      release.resolve()
      const failed = await work
      expect(first.get().value).toBe(
        target === "same control" ? "human" : "initial"
      )
      expect(second.get().value).toBe(
        target === "another control" ? "human" : "untouched"
      )
      expect(failed).toHaveLength(target === "same control" ? 1 : 0)
      if (target === "same control" && operation === "undo") {
        expect(history.entries()[0].reverted).toBeUndefined()
      }
      if (target !== "no edit") {
        expect(history.entries()).toContainEqual(
          expect.objectContaining({ source: "keyboard", value: "human" })
        )
      }
      expect(
        (
          await agent.act({
            steps: [{ ref: "First", action: "setValue", args: ["later"] }],
          })
        ).ok
      ).toBe(true)
      expect(first.get().value).toBe("later")
    }
  )

  test.each([false, true])(
    `${operation} acknowledges decimal restoration with refusal %s`,
    async (refusing) => {
      let refuse = false
      const instance = numberInput({
        id: "precision",
        defaultValue: 0.121,
        step: 0.001,
        onValueChange: (_value, details) => {
          if (refuse) {
            details.cancel()
          }
        },
      })
      const element = document.body.appendChild(document.createElement("div"))
      element.setAttribute("aria-label", "Precision")
      const agent = createAgent()
      const history = createHistory(agent, { coalesce: false })
      cleanups.push(
        bind(instance.part("root"), element),
        () => instance.destroy(),
        history.destroy
      )
      expect(
        (
          await agent.act({
            steps: [{ ref: "Precision", action: "setValue", args: [0.124] }],
          })
        ).ok
      ).toBe(true)
      expect(instance.get().value).toBe(0.124)
      refuse = refusing
      const failed =
        operation === "undo"
          ? await history.undoSource("agent")
          : await history.seek(0)
      expect(instance.get().value).toBe(refusing ? 0.124 : 0.121)
      expect(failed).toHaveLength(refusing ? 1 : 0)
      if (operation === "undo") {
        expect(!!history.entries()[0].reverted).toBe(!refusing)
      } else {
        expect(history.position()).toBe(refusing ? 1 : 0)
      }
    }
  )
}
