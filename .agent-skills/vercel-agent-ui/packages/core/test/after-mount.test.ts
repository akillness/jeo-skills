// @vitest-environment jsdom
// Every option and slot prop follows a change after the first render: one
// rendered with a value, then another, ends where the second begins.
import { afterEach, describe, expect, test } from "vitest"
import type { Primitive } from "../src/foundation/kernel/primitive-types"
import { mount, rerenderOf } from "../src/testing/mount"
import {
  baseOptions,
  changesOf,
  idle,
  markupOf,
  tabStopProblem,
  title,
  withAttribute,
} from "./after-mount"
import { cases, type Case } from "./after-mount.cases"

const mounts: { unmount: () => void }[] = []
afterEach(() => mounts.splice(0).forEach((mounted) => mounted.unmount()))

const ignoredState = new Set(["direction"])

// Sameness of two mounts: their markup with each mount's ids made alike, and their state.
function snapshot(
  view: { root: HTMLElement; state: unknown },
  history: readonly string[] = []
) {
  const html = markupOf(view.root.parentElement ?? view.root, history)
  const state = JSON.stringify(view.state, (key, value) =>
    ignoredState.has(key) || history.includes(key)
      ? undefined
      : value instanceof Element
        ? `<${value.getAttribute("data-slot") ?? value.tagName}>`
        : value
  ).replace(/mount-\d+/g, "mount")
  return { html, state }
}

async function render(entry: Case, options: Record<string, unknown>) {
  const view = mount(
    entry.primitive as Primitive,
    options as never,
    entry.markup
  )
  mounts.push(view)
  await view.settle()
  return view
}

for (const entry of cases) {
  describe(entry.name, () => {
    const { changes, missing } = changesOf(entry)

    test("names values for every option and prop it doesn't skip", () => {
      expect(missing).toEqual([])
    })

    for (const change of changes) {
      test.skipIf(title(change) in (entry.skip ?? {}))(
        title(change),
        async () => {
          const base = baseOptions(entry, change)
          if (change.kind === "option") {
            const fresh = await render(entry, {
              ...base,
              [change.key]: change.to,
            })
            const expected = snapshot(fresh, entry.history)
            const freshProblem = tabStopProblem(fresh)
            fresh.unmount()
            const changed = await render(entry, {
              ...base,
              [change.key]: change.from,
            })
            await idle()
            rerenderOf(changed).setOptions({ [change.key]: change.to })
            await changed.settle()
            expect(snapshot(changed, entry.history)).toEqual(expected)
            if (entry.history?.includes("stop") && !freshProblem) {
              expect(tabStopProblem(changed)).toBeUndefined()
            }
            expect(entry.check?.(changed.state)).toBeUndefined()
          } else {
            const at = (value: unknown) =>
              withAttribute(entry.markup, change, value)
            const fresh = await render(
              { ...entry, markup: at(change.to) },
              base
            )
            const expected = snapshot(fresh, entry.history)
            const freshProblem = tabStopProblem(fresh)
            fresh.unmount()
            const changed = await render(
              { ...entry, markup: at(change.from) },
              base
            )
            await idle()
            rerenderOf(changed).setProps(change.slot, change.partKey, {
              [change.key]: change.to,
            })
            await changed.settle()
            expect(snapshot(changed, entry.history)).toEqual(expected)
            if (entry.history?.includes("stop") && !freshProblem) {
              expect(tabStopProblem(changed)).toBeUndefined()
            }
            expect(entry.check?.(changed.state)).toBeUndefined()
          }
        }
      )
    }
  })
}
