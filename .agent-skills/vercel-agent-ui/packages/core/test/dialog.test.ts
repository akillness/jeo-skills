import { describe, expect, test, vi } from "vitest"
import {
  alertDialog,
  createConfirm,
  createDialogController,
  dialog,
} from "../src/components/dialog/dialog"
import { dialogRefusal } from "../src/components/dialog/dialog-api"
import { outsideBox } from "../src/foundation/popups/popup"
import { attachController } from "../src/foundation/kernel/controller"
import { attrs, partState, press } from "../src/foundation/kernel/part"
import { kept } from "./kept"

describe("::backdrop presses", () => {
  const rect = { left: 100, right: 300, top: 50, bottom: 250 } as DOMRect

  test("a press outside the box landed on the backdrop", () => {
    expect(outsideBox({ x: 20, y: 20 }, rect)).toBe(true)
    expect(outsideBox({ x: 200, y: 260 }, rect)).toBe(true)
  })

  test("a press inside the box or on its edge landed on the dialog", () => {
    expect(outsideBox({ x: 200, y: 100 }, rect)).toBe(false)
    expect(outsideBox({ x: 100, y: 50 }, rect)).toBe(false)
  })
})

describe("labelling", () => {
  test("an open dialog is named by its title until its parts bind, as on the server", () => {
    const instance = dialog({ id: "d", defaultOpen: true })
    expect(attrs(instance.part("content"))["aria-labelledby"]).toBe("d-title")
    expect(attrs(instance.part("content"))["aria-describedby"]).toBeUndefined()
    expect(attrs(instance.part("content")).role).toBe("dialog")
  })

  test("an alert dialog has its own role", () => {
    expect(
      attrs(alertDialog({ id: "a", defaultOpen: true }).part("content")).role
    ).toBe("alertdialog")
  })
})

describe("modality", () => {
  test("a dialog is modal by default, and marked modal", () => {
    const instance = dialog({ id: "d", defaultOpen: true })
    expect(attrs(instance.part("content"))["aria-modal"]).toBe("true")
    expect(partState(instance.part("content")).modal).toBe(true)
  })

  test("trap-focus and false aren't marked modal, since the page stays usable", () => {
    for (const modal of [false, "trap-focus"] as const) {
      expect(
        attrs(dialog({ id: "d", defaultOpen: true, modal }).part("content"))[
          "aria-modal"
        ]
      ).toBeUndefined()
    }
  })

  test("an alert dialog is always modal", () => {
    const instance = alertDialog({
      id: "a",
      defaultOpen: true,
      modal: false,
    } as never)
    expect(attrs(instance.part("content"))["aria-modal"]).toBe("true")
  })

  test("a modal dialog's trigger has no aria-expanded, and a non-modal one's does", () => {
    expect(
      attrs(dialog({ id: "d" }).part("trigger"))["aria-expanded"]
    ).toBeUndefined()
    expect(
      attrs(dialog({ id: "d", modal: false }).part("trigger"))["aria-expanded"]
    ).toBe("false")
  })

  test("changing modal after mount re-renders with the new value", () => {
    const instance = dialog({ id: "d", defaultOpen: true })
    instance.setOptions({ id: "d", defaultOpen: true, modal: false })
    expect(attrs(instance.part("content"))["aria-modal"]).toBeUndefined()
    expect(attrs(instance.part("trigger"))["aria-expanded"]).toBe("true")
  })
})

describe("closing", () => {
  test("a Close part's value is the return value, and onOpenChange gets it", () => {
    const changes: unknown[] = []
    const instance = dialog({
      id: "d",
      defaultOpen: true,
      onOpenChange: (open, details) =>
        changes.push([open, details.reason, details.returnValue]),
    })
    press(instance.part("close", { value: "save" }))?.()
    expect(changes).toEqual([[false, "close-press", "save"]])
    expect(instance.get()).toMatchObject({ open: false })
  })

  test("an outside press never closes an alert dialog", () => {
    const instance = alertDialog({ id: "a", defaultOpen: true })
    ;(
      instance.api as {
        internal: { hide: (close: { reason: string }) => void }
      }
    ).internal.hide({
      reason: "outside-press",
    })
    expect(instance.get()).toMatchObject({ open: true })
  })

  test("closeOnOutsidePress false keeps a dialog open on an outside press, and Escape still closes it", () => {
    const instance = dialog({
      id: "d",
      defaultOpen: true,
      closeOnOutsidePress: false,
    })
    const hide = (
      instance.api as {
        internal: { hide: (close: { reason: string }) => void }
      }
    ).internal.hide
    hide({ reason: "outside-press" })
    expect(instance.get()).toMatchObject({ open: true })
    hide({ reason: "escape-key" })
    expect(instance.get()).toMatchObject({ open: false })
  })

  test("a non-modal dialog doesn't close on an outside press by default", () => {
    const instance = dialog({ id: "d", defaultOpen: true, modal: false })
    const hide = (
      instance.api as {
        internal: { hide: (close: { reason: string }) => void }
      }
    ).internal.hide
    hide({ reason: "outside-press" })
    expect(instance.get()).toMatchObject({ open: true })
  })

  test("canceling the close keeps it open", () => {
    const instance = dialog({
      id: "d",
      defaultOpen: true,
      onOpenChange: (_, details) => details.cancel(),
    })
    press(instance.part("close"))?.()
    expect(instance.get()).toMatchObject({ open: true })
  })
})

describe("confirm", () => {
  test("resolves true for a Close part with the confirm value, false for anything else", async () => {
    const confirm = createConfirm<{ name: string }>()
    const instance = alertDialog({ id: "a", controller: confirm.controller })
    attachController(confirm.controller, instance.api)
    const yes = confirm({ name: "Acme" })
    expect(instance.get()).toMatchObject({
      open: true,
      payload: { name: "Acme" },
    })
    press(instance.part("close", { value: "confirm" }))?.()
    expect(await yes).toBe(true)
    const no = confirm({ name: "Acme" })
    press(instance.part("close"))?.()
    expect(await no).toBe(false)
  })
})

describe("dismissal policy", () => {
  const open = {
    dismissible: true,
    outsidePress: true,
    pending: false,
    beside: false,
  }

  test("dismissals close unless dismissible is false, which makes them attempts", () => {
    for (const reason of ["escape-key", "outside-press", "back"]) {
      expect(dialogRefusal(reason, open)).toBeUndefined()
      expect(dialogRefusal(reason, { ...open, dismissible: false })).toBe(
        "attempt"
      )
    }
  })

  test("Close parts, triggers and the controller close a non-dismissible dialog", () => {
    for (const reason of [
      "close-press",
      "trigger-press",
      "imperative",
      "action",
    ]) {
      expect(
        dialogRefusal(reason, { ...open, dismissible: false })
      ).toBeUndefined()
    }
  })

  test("an outside press is an attempt when outside presses don't close", () => {
    expect(
      dialogRefusal("outside-press", { ...open, outsidePress: false })
    ).toBe("attempt")
    expect(
      dialogRefusal("escape-key", { ...open, outsidePress: false })
    ).toBeUndefined()
  })

  test("a refused press beside a non-modal dialog is the page's, not an attempt", () => {
    const beside = { ...open, outsidePress: false, beside: true }
    expect(dialogRefusal("outside-press", beside)).toBe("silent")
    expect(dialogRefusal("escape-key", { ...beside, dismissible: false })).toBe(
      "attempt"
    )
  })

  test("a running action blocks everything but the controller", () => {
    const pending = { ...open, pending: true }
    expect(dialogRefusal("escape-key", pending)).toBe("attempt")
    expect(dialogRefusal("close-press", pending)).toBe("silent")
    expect(dialogRefusal("imperative", pending)).toBeUndefined()
    expect(dialogRefusal("action", pending)).toBeUndefined()
  })

  test("Escape on a non-dismissible dialog reports the attempt and keeps it open", () => {
    const attempts: string[] = []
    const changes: string[] = []
    const instance = dialog({
      id: "d",
      defaultOpen: true,
      dismissible: false,
      onDismissAttempt: ({ reason }) => attempts.push(reason),
      onOpenChange: (_, { reason }) => changes.push(reason),
    })
    const hide = (
      instance.api as {
        internal: { hide: (close: { reason: string }) => void }
      }
    ).internal.hide
    hide({ reason: "escape-key" })
    hide({ reason: "back" })
    expect(attempts).toEqual(["escape-key", "back"])
    expect(changes).toEqual([])
    press(instance.part("close"))?.()
    expect(changes).toEqual(["close-press"])
  })

  test("a press beside a non-modal dialog isn't an attempt", () => {
    const attempts: string[] = []
    const instance = dialog({
      id: "d",
      defaultOpen: true,
      modal: false,
      onDismissAttempt: ({ reason }) => attempts.push(reason),
    })
    ;(
      instance.api as {
        internal: { hide: (close: { reason: string }) => void }
      }
    ).internal.hide({
      reason: "outside-press",
    })
    expect(attempts).toEqual([])
  })
})

describe("actions", () => {
  test("a Close part's async action keeps the dialog open and pending, then closes with reason action", async () => {
    const changes: unknown[] = []
    let finish!: () => void
    const instance = alertDialog({
      id: "a",
      defaultOpen: true,
      onOpenChange: (open, details) =>
        changes.push([open, details.reason, details.returnValue]),
    })
    const action = () => new Promise<void>((resolve) => (finish = resolve))
    const props = { id: "delete", value: "confirm", action }
    press(instance.part("close", props))?.()
    expect(instance.get()).toMatchObject({ open: true, pending: "delete" })
    expect(attrs(instance.part("close", props))["data-pending"]).toBe("")
    expect(attrs(instance.part("close", props))["aria-busy"]).toBe("true")
    expect(attrs(instance.part("close", props))["aria-disabled"]).toBe("true")
    expect(partState(instance.part("content")).pending).toBe(true)
    expect(
      attrs(instance.part("close", props))["data-disabled"]
    ).toBeUndefined()
    // Escape and the other Close part do nothing meanwhile.
    const cancel = attrs(instance.part("close", { id: "cancel" }))
    expect(cancel["aria-disabled"]).toBe("true")
    expect(cancel["data-disabled"]).toBe("")
    expect(cancel["aria-busy"]).toBeUndefined()
    press(instance.part("close", { id: "cancel" }))?.()
    expect(instance.get()).toMatchObject({ open: true })
    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(changes).toEqual([[false, "action", "confirm"]])
    expect(instance.get()).toMatchObject({ open: false, pending: null })
    expect(
      attrs(instance.part("close", { id: "cancel" }))["aria-disabled"]
    ).toBeUndefined()
  })

  test("a rejected action keeps the dialog open and shows the error until the next press", async () => {
    const instance = alertDialog({ id: "a", defaultOpen: true })
    const props = {
      id: "delete",
      action: () => Promise.reject(new Error("Offline")),
    }
    press(instance.part("close", props))?.()
    await new Promise((resolve) => setTimeout(resolve))
    expect(instance.get()).toMatchObject({ open: true, pending: null })
    expect(
      (partState(instance.part("close", props)).error as Error).message
    ).toBe("Offline")
    expect(attrs(instance.part("close", props))["data-pending"]).toBeUndefined()
    expect(
      attrs(instance.part("close", props))["aria-disabled"]
    ).toBeUndefined()
    press(instance.part("close", { ...props, action: () => undefined }))?.()
    expect(instance.get()).toMatchObject({ open: false })
  })

  test("an action that settles after its dialog closed and reopened leaves the new one alone", async () => {
    const controller = createDialogController<unknown, string>()
    const instance = dialog({ id: "d", controller })
    attachController(controller, instance.api)
    let finish!: () => void
    let fail!: (error: Error) => void
    const action = () => new Promise<void>((resolve) => (finish = resolve))
    const rejected = () => new Promise<void>((_, reject) => (fail = reject))
    controller.open()
    press(
      instance.part("close", { id: "delete", value: "confirm", action })
    )?.()
    controller.close()
    const second = controller.open()
    expect(instance.get()).toMatchObject({ open: true, pending: null })
    press(instance.part("close", { id: "retry", action: rejected }))?.()
    controller.close()
    controller.open()
    finish()
    fail(new Error("Offline"))
    await new Promise((resolve) => setTimeout(resolve))
    expect(instance.get()).toMatchObject({
      open: true,
      pending: null,
      errors: {},
    })
    controller.close({ returnValue: "cancel" })
    expect((await second).reason).toBe("imperative")
  })
})

describe("typed results", () => {
  test("open() resolves with the result close() passes, typed", async () => {
    const controller = createDialogController<{ id: string }, { id: string }>()
    const instance = dialog({ id: "d", controller })
    attachController(controller, instance.api)
    const result = controller.open({ payload: { id: "1" } })
    controller.close({ returnValue: { id: "42" } })
    const { reason, returnValue } = await result
    expect(reason).toBe("imperative")
    expect(returnValue?.id).toBe("42")
  })

  test("a pending open() resolves with reason unmount when the dialog leaves the page", async () => {
    const changes: string[] = []
    const controller = createDialogController()
    const instance = kept(
      dialog({
        id: "d",
        controller,
        onOpenChange: (_, { reason }) => changes.push(reason),
      })
    )
    const result = controller.open()
    instance.destroy()
    expect(await result).toEqual({ reason: "unmount", source: "programmatic" })
    expect(changes).toEqual(["imperative"])
    // The controller lets go of the instance that left.
    expect("isOpen" in controller).toBe(false)
  })

  test("leaving the page keeps a controller another instance attached to since", () => {
    const controller = createDialogController()
    const first = dialog({ id: "a", controller })
    attachController(controller, first.api)
    const second = dialog({ id: "b", controller })
    attachController(controller, second.api)
    first.destroy()
    controller.setOpen(true)
    expect(second.api.isOpen()).toBe(true)
  })

  test("an aborted signal closes the dialog with reason imperative, and resolves once", async () => {
    const reasons: string[] = []
    const instance = dialog({
      id: "s",
      onOpenChange: (_, { reason }) => reasons.push(reason),
    })
    const abort = new AbortController()
    const result = instance.api.open({ signal: abort.signal })
    expect(instance.api.isOpen()).toBe(true)
    abort.abort()
    expect(instance.api.isOpen()).toBe(false)
    expect(await result).toEqual({
      reason: "imperative",
      source: "programmatic",
    })
    expect(reasons).toEqual(["imperative", "imperative"])
  })

  test("an already aborted signal never opens", async () => {
    const instance = dialog({ id: "t" })
    const result = await instance.api.open({ signal: AbortSignal.abort() })
    expect(result.reason).toBe("imperative")
    expect(instance.api.isOpen()).toBe(false)
  })

  test("aborting after the close does nothing", async () => {
    const abort = new AbortController()
    const instance = dialog({ id: "u" })
    const result = instance.api.open({ signal: abort.signal })
    instance.api.close({ reason: "close-press" })
    expect((await result).reason).toBe("close-press")
    instance.api.open()
    abort.abort()
    expect(instance.api.isOpen()).toBe(true)
  })
})

describe("debug", () => {
  test("a Close action going pending and failing logs, like a change", async () => {
    const log = vi.spyOn(console, "debug").mockImplementation(() => {})
    const instance = dialog({ id: "d", debug: true, defaultOpen: true })
    instance.api.internal.closePress("close", {
      action: () => Promise.reject("offline"),
    })
    await new Promise((resolve) => setTimeout(resolve))
    const lines = log.mock.calls
      .map(([line]) => String(line))
      .filter((line) => !line.includes(" open:"))
    expect(lines).toEqual([
      expect.stringContaining("dialog#d pending: true (action"),
      expect.stringContaining("dialog#d pending: false (action"),
      expect.stringContaining("dialog#d error: offline (action"),
    ])
    log.mockRestore()
  })
})
