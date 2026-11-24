// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { numberInput } from "../src/components/number-input/number-input"
import { withSource } from "../src/foundation/kernel/details"
import { bind } from "../src/foundation/kernel/part"
import { createAgent } from "../src/page/agent/agent"
import { observe, type ObservedChange } from "../src/page/observe/observe"
import { createHistory } from "../src/page/history/history"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

for (const operation of ["undo", "seek"] as const) {
  test.each([false, true])(
    `${operation} preserves an unfinished human edit with default coalescing: %s`,
    async (edited) => {
      let waiting = false
      const started = deferred()
      const permission = deferred()
      const agent = createAgent({
        allow: async () => {
          if (waiting) {
            started.resolve()
            await permission.promise
          }
          return true
        },
      })
      const history = createHistory(agent)
      const changes: ObservedChange[] = []
      const stop = observe((change) => changes.push(change), { live: true })
      const instance = numberInput({ id: "live-number", defaultValue: 1 })
      const element = document.body.appendChild(document.createElement("div"))
      element.setAttribute("aria-label", "Count")
      cleanups.push(
        bind(instance.part("root"), element),
        () => instance.destroy(),
        history.destroy,
        stop,
        permission.resolve
      )

      expect(
        (
          await agent.act({
            steps: [{ ref: "Count", action: "setValue", args: [2] }],
          })
        ).ok
      ).toBe(true)
      waiting = true
      const work =
        operation === "undo" ? history.undoSource("agent") : history.seek(0)
      await started.promise
      if (edited) {
        withSource("keyboard", () =>
          instance.api.setValue(3, {
            reason: "step-key",
            event: new KeyboardEvent("keydown", { key: "ArrowUp" }),
          })
        )
        expect(instance.get().value).toBe(3)
        expect(changes.at(-1)).toMatchObject({
          source: "keyboard",
          key: "value",
          value: 3,
        })
        expect(history.entries()).toHaveLength(1)
      }
      permission.resolve()
      expect(await work).toHaveLength(edited ? 1 : 0)
      expect(instance.get().value).toBe(edited ? 3 : 1)
      if (operation === "undo") {
        expect(!!history.entries()[0].reverted).toBe(!edited)
      } else {
        expect(history.position()).toBe(edited ? 1 : 0)
      }
      expect(
        (
          await agent.act({
            steps: [{ ref: "Count", action: "setValue", args: [4] }],
          })
        ).ok
      ).toBe(true)
      expect(instance.get().value).toBe(4)
    }
  )
}
