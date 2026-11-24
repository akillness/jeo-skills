// @vitest-environment jsdom
// `observe`: every change that goes through, from a person or an agent, named
// the way the agent's snapshot names the component. `bind` from the kernel
// stands in for an adapter.
import { afterEach, describe, expect, test, vi } from "vitest"
import { createAgent } from "../src/page/agent/agent"
import { checkbox } from "../src/components/checkbox/checkbox"
import { input } from "../src/components/input/input"
import { slider } from "../src/components/slider/slider"
import {
  createChange,
  createCommit,
} from "../src/foundation/kernel/input-source"
import { bind } from "../src/foundation/kernel/part"
import {
  type ChangeDetails,
  type CommitDetails,
  withSource,
} from "../src/foundation/kernel/details"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { observe } from "../src/page/observe/observe"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

// A checkbox in a label, bound the way an adapter binds it.
function mountCheckbox(
  options: Parameters<typeof checkbox>[0],
  text = "Send a weekly digest"
) {
  const instance = checkbox(options)
  const label = document.createElement("label")
  const el = document.createElement("button")
  label.append(el, text)
  document.body.append(label)
  const unbind = bind(instance.part("root"), el)
  cleanups.push(() => {
    unbind()
    instance.destroy()
  })
  return { instance, el }
}

function listen(live?: boolean) {
  const changes: unknown[] = []
  cleanups.push(observe((change) => changes.push(change), { live }))
  return changes
}

// A dial whose `value` a drag changes in steps and commits on release, and
// whose `turns` change without commits.
type DialOptions = {
  onValueChange?: (
    value: number,
    details: ChangeDetails<"drag" | "imperative">
  ) => void
  onValueCommit?: (
    value: number,
    details: CommitDetails<"drag"> & { handle: string }
  ) => void
}
const dial = definePrimitive({
  name: "dial",
  options: { onValueChange: "callback", onValueCommit: "callback" },
  state: (_options: DialOptions) => ({ value: 0, turns: 0 }),
  commits: ["value"],
  api: (context) => {
    const change = createChange(context)
    const commit = createCommit(context)
    return {
      drag: (value: number) => change("value", value, { reason: "drag" }),
      release: () =>
        commit("value", context.store.get().value, {
          reason: "drag",
          handle: "outer",
        }),
      setValue: (value: number) =>
        change("value", value, { reason: "imperative" }),
      turn: () =>
        change("turns", context.store.get().turns + 1, { reason: "drag" }),
    }
  },
  slots: (slot) => ({ root: slot({}) }),
})

// What a mouse does, without the trusted events jsdom can't send.
const withMouse = (run: () => void) => withSource("mouse", run)

function mountDial(options: DialOptions = {}) {
  const instance = dial({ id: "volume", ...options })
  cleanups.push(() => instance.destroy())
  return instance.api
}

describe("observe", () => {
  test("reports a person's change with the component's label, the reason and the source", () => {
    const changes = listen()
    const { el } = mountCheckbox({ id: "digest" })
    el.click()
    expect(changes).toEqual([
      {
        ref: expect.stringMatching(/^c\d+$/),
        component: "checkbox",
        id: "digest",
        label: "Send a weekly digest",
        key: "checked",
        value: true,
        previous: false,
        reason: expect.any(String),
        source: expect.not.stringMatching(/^agent$/),
      },
    ])
  })

  test("reports an agent's change with the source agent and the ref its snapshot uses", async () => {
    const changes = listen()
    const agent = createAgent()
    mountCheckbox({ id: "digest" })
    const [{ ref }] = agent.snapshot().filter((component) => !component.offPage)
    await agent.act({
      steps: [
        { ref: "Send a weekly digest", action: "setChecked", args: [true] },
      ],
    })
    expect(changes).toEqual([
      expect.objectContaining({
        ref,
        key: "checked",
        value: true,
        source: "agent",
      }),
    ])
  })

  test("reports a controlled component's change when it's asked for, before the owner passes it back", () => {
    const changes = listen()
    const { el } = mountCheckbox({ id: "digest", checked: false })
    el.click()
    expect(changes).toEqual([
      expect.objectContaining({ key: "checked", value: true }),
    ])
  })

  test("leaves out a change the app canceled", () => {
    const changes = listen()
    const { el } = mountCheckbox({
      id: "digest",
      onCheckedChange: (_checked, details) => details.cancel(),
    })
    el.click()
    expect(changes).toEqual([])
  })

  test("redacts a password field's value", () => {
    const changes = listen()
    const instance = input({ id: "password" })
    const el = document.createElement("input")
    el.type = "password"
    el.setAttribute("aria-label", "Password")
    document.body.append(el)
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    instance.api.setValue("hunter2")
    expect(changes).toEqual([
      expect.objectContaining({
        label: "Password",
        key: "value",
        value: "[redacted]",
      }),
    ])
  })

  test("stops when the returned function runs", () => {
    const listener = vi.fn()
    const stop = observe(listener)
    const { el } = mountCheckbox({ id: "digest" })
    stop()
    el.click()
    expect(listener).not.toHaveBeenCalled()
  })

  test("createCommit fires on<Key>Commit with the reason, the event, the source and what else it's given", () => {
    const onValueCommit = vi.fn()
    const volume = mountDial({ onValueCommit })
    withMouse(() => {
      volume.drag(30)
      volume.release()
    })
    expect(onValueCommit).toHaveBeenCalledTimes(1)
    expect(onValueCommit).toHaveBeenCalledWith(30, {
      reason: "drag",
      event: undefined,
      source: "mouse",
      handle: "outer",
    })
  })

  test("reports a key the component commits once per commit, from the value before the interaction", () => {
    const changes = listen()
    const volume = mountDial()
    withMouse(() => {
      volume.drag(10)
      volume.drag(20)
      volume.drag(30)
    })
    expect(changes).toEqual([])
    withMouse(() => {
      volume.release()
      volume.drag(40)
      volume.release()
    })
    expect(changes).toEqual([
      expect.objectContaining({
        key: "value",
        value: 30,
        previous: 0,
        reason: "drag",
        source: "mouse",
      }),
      expect.objectContaining({ key: "value", value: 40, previous: 30 }),
    ])
  })

  test("with live, reports every step and no commits", () => {
    const changes = listen(true)
    const volume = mountDial()
    withMouse(() => {
      volume.drag(10)
      volume.drag(20)
      volume.release()
    })
    expect(changes).toEqual([
      expect.objectContaining({ key: "value", value: 10, previous: 0 }),
      expect.objectContaining({ key: "value", value: 20, previous: 10 }),
    ])
  })

  test("reports a committed key set from code as it changes, and the next commit starts from it", () => {
    const changes = listen()
    const volume = mountDial()
    volume.setValue(50)
    // A commit with no steps before it, like one a call from code makes, isn't reported again.
    volume.release()
    withMouse(() => {
      volume.drag(60)
      volume.release()
    })
    expect(changes).toEqual([
      expect.objectContaining({ value: 50, previous: 0, reason: "imperative" }),
      expect.objectContaining({
        value: 60,
        previous: 50,
        reason: "drag",
        source: "mouse",
      }),
    ])
  })

  test("reports every change to a key the component doesn't commit", () => {
    const changes = listen()
    const volume = mountDial()
    withMouse(() => {
      volume.turn()
      volume.turn()
    })
    expect(changes).toEqual([
      expect.objectContaining({ key: "turns", value: 1, previous: 0 }),
      expect.objectContaining({ key: "turns", value: 2, previous: 1 }),
    ])
  })

  test("a slider's drag is one change when it ends, and onValueCommit names its thumb", () => {
    const changes = listen()
    const onValueCommit = vi.fn()
    const instance = slider({ id: "volume", onValueCommit })
    cleanups.push(() => instance.destroy())
    withMouse(() => {
      instance.api.internal.begin(0, 0)
      instance.api.internal.move(20)
      instance.api.internal.move(40)
      instance.api.internal.end()
    })
    expect(changes).toEqual([
      expect.objectContaining({
        component: "slider",
        key: "value",
        value: 40,
        previous: 0,
        reason: "drag",
      }),
    ])
    expect(onValueCommit).toHaveBeenCalledWith(
      40,
      expect.objectContaining({ reason: "drag", thumb: 0 })
    )
  })

  test("agent.subscribe hears the same changes", () => {
    const agent = createAgent()
    const heard = vi.fn()
    cleanups.push(agent.subscribe(heard))
    const changes = listen()
    const { el } = mountCheckbox({ id: "digest" })
    el.click()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith(changes[0])
  })
})
