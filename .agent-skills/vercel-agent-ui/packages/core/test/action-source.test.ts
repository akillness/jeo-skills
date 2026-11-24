// @vitest-environment jsdom
// Every action that can return a Promise hears how it was pressed, so the
// changes it makes after an `await`, once the press is over, can still report
// it: an agent's press stays the agent's for `observe` and `undoSource`. `bind`
// from the kernel stands in for an adapter.
import { afterEach, expect, test, vi } from "vitest"
import {
  button,
  type ButtonActionDetails,
} from "../src/components/button/button"
import { checkbox } from "../src/components/checkbox/checkbox"
import { alertDialog } from "../src/components/dialog/dialog"
import { input } from "../src/components/input/input"
import { toggle } from "../src/components/toggle/toggle"
import { toastRegion } from "../src/components/toast/toast"
import { createToaster } from "../src/components/toast/toaster"
import { bind, press } from "../src/foundation/kernel/part"
import { createOverlays } from "../src/page/overlays/overlays"
import { createAgent } from "../src/page/agent/agent"
import {
  observe,
  withSource,
  type ObservedChange,
} from "../src/page/observe/observe"
import { createHistory } from "../src/page/history/history"
import { keys } from "../src/testing/input"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

// Puts a part's element on the page, bound the way an adapter binds it.
function place(
  el: HTMLElement,
  part: Parameters<typeof bind>[0],
  destroy: () => void
) {
  document.body.append(el)
  cleanups.push(bind(part, el), destroy)
}

function mountInput(label: string) {
  const instance = input({ id: label })
  const el = document.createElement("input")
  el.setAttribute("aria-label", label)
  place(el, instance.part("root"), () => instance.destroy())
  return instance
}

function mountButton(
  text: string,
  action: (event: Event | undefined, details: ButtonActionDetails) => unknown,
  tag = "button"
) {
  const instance = button({ id: text, action } as Parameters<typeof button>[0])
  const el = document.createElement(tag)
  el.textContent = text
  place(el, instance.part("root"), () => instance.destroy())
  return { instance, el }
}

function mountCheckbox(text: string) {
  const instance = checkbox({ id: text })
  const el = document.createElement("button")
  el.setAttribute("aria-label", text)
  place(el, instance.part("root"), () => instance.destroy())
  return { instance, el }
}

// An action that records its press's source and waits until `finish` runs.
function waitingAction() {
  const sources: string[] = []
  let finish = () => {}
  const action = (
    _event: Event | undefined,
    { source }: { source: string }
  ) => {
    sources.push(source)
    return new Promise<void>((resolve) => (finish = resolve))
  }
  return { action, sources, finish: () => finish() }
}

const settle = () => new Promise((resolve) => setTimeout(resolve))

test("a press hands its action how the button was pressed", () => {
  const sources: string[] = []
  const { el } = mountButton("Save", (_event, { source }) =>
    sources.push(source)
  )
  withSource("keyboard", () => el.click())
  el.click()
  expect(sources).toEqual(["keyboard", "programmatic"])
})

test("Enter and Space on a button rendered as a span hand its action the keyboard", async () => {
  const sources: string[] = []
  const { el } = mountButton(
    "Save",
    (_event, { source }) => sources.push(source),
    "span"
  )
  el.tabIndex = 0
  el.focus()
  await keys(document, ["Enter", "Space"])
  expect(sources).toEqual(["keyboard", "keyboard"])
})

test("Enter and Space on a toggle rendered as a span report the keyboard", async () => {
  const sources: string[] = []
  const instance = toggle({
    id: "Bold",
    onPressedChange: (_pressed, { source }) => sources.push(source),
  })
  const el = document.createElement("span")
  el.textContent = "Bold"
  el.tabIndex = 0
  place(el, instance.part("root"), () => instance.destroy())
  el.focus()
  await keys(document, ["Enter", "Space"])
  expect(sources).toEqual(["keyboard", "keyboard"])
})

test("a change the action makes after an await reports the agent that pressed, and undo reverts only it", async () => {
  const changes: ObservedChange[] = []
  cleanups.push(observe((change) => changes.push(change)))
  const agent = createAgent()
  const history = createHistory(agent)
  cleanups.push(history.destroy)
  const status = mountInput("Status")
  const digest = mountCheckbox("Weekly digest")
  let finish = () => {}
  const save = mountButton("Save", async (_event, { source }) => {
    await new Promise<void>((resolve) => (finish = resolve))
    withSource(source, () => status.api.setValue("saved"))
  })

  const pressed = agent.act({ steps: [{ ref: "Save", action: "press" }] })
  await vi.waitFor(() => expect(save.instance.get().pending).toBe(true))
  // A person presses a checkbox while the action waits, as a keyboard, since jsdom sends no trusted events.
  withSource("keyboard", () => digest.el.click())
  finish()
  expect(await pressed).toMatchObject({ ok: true })

  expect(
    changes.map(({ label, value, source }) => ({ label, value, source }))
  ).toEqual([
    { label: "Weekly digest", value: true, source: "keyboard" },
    { label: "Status", value: "saved", source: "agent" },
  ])
  await history.undoSource("agent")
  expect(status.get().value).toBe("")
  expect(digest.instance.get().checked).toBe(true)
})

test("a Close part's action hears how it was pressed, and the dialog closes with that source once it settles", async () => {
  const closes: string[] = []
  const instance = alertDialog({
    id: "a",
    defaultOpen: true,
    onOpenChange: (_open, { source }) => closes.push(source),
  })
  const { action, sources, finish } = waitingAction()
  withSource("agent", () =>
    press(instance.part("close", { id: "delete", action }))?.()
  )
  expect(sources).toEqual(["agent"])
  finish()
  await settle()
  expect(closes).toEqual(["agent"])
})

test("a toast's action and close buttons hear how they were pressed, and the toast closes with that source", async () => {
  const toaster = createToaster({ overlays: createOverlays() })
  const region = toastRegion({ id: "r", toaster })
  cleanups.push(region.api.internal.connect(), () => region.destroy())
  const dismissals: string[] = []
  const onDismiss = ({ source }: { source: string }) => dismissals.push(source)
  const own = waitingAction()
  const undone = toaster("Deleted", {
    duration: Infinity,
    action: { label: "Undo", onAction: own.action },
    onDismiss,
  })
  const closing = waitingAction()
  const saved = toaster("Saved", { duration: Infinity, onDismiss })

  withSource("agent", () =>
    press(region.part("action", { id: "undo", toast: undone }))?.()
  )
  withSource("keyboard", () =>
    press(
      region.part("close", {
        id: "close",
        toast: saved,
        action: closing.action,
      })
    )?.()
  )
  expect([...own.sources, ...closing.sources]).toEqual(["agent", "keyboard"])
  own.finish()
  closing.finish()
  await settle()
  expect(dismissals).toEqual(["agent", "keyboard"])
})
