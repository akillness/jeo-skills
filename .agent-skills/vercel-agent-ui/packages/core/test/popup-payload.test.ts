import { describe, expect, test, vi } from "vitest"
import { alertDialog, dialog } from "../src/components/dialog/dialog"
import { drawer } from "../src/components/drawer/drawer"
import { hoverCard } from "../src/components/hover-card/hover-card"
import { menu } from "../src/components/menu/menu"
import { popover } from "../src/components/popover/popover"
import { tooltip } from "../src/components/tooltip/tooltip"
import { press as partPress } from "../src/foundation/kernel/part"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"

// One popup, several triggers with payloads, like one menu for every row of a
// table. Pressing another trigger while the popup is open hands it over with
// no open change, so `onPayloadChange` is how content hears about it.
const popups = {
  menu: (options: object) => menu({ id: "m", ...options }),
  popover: (options: object) => popover({ id: "p", ...options }),
  dialog: (options: object) => dialog({ id: "d", modal: false, ...options }),
  drawer: (options: object) => drawer({ id: "w", modal: false, ...options }),
}

// A press on the trigger with this key and payload.
const press = (instance: PrimitiveInstance, id: string, payload: unknown) =>
  partPress(instance.part("trigger", { id, payload }))?.()

describe.each(Object.entries(popups))("%s payload changes", (_name, create) => {
  test("reports the payload it opens with, then the trigger that takes it over, with no open change", () => {
    const onOpenChange = vi.fn()
    const onPayloadChange = vi.fn()
    const instance = create({ onOpenChange, onPayloadChange })
    press(instance, "a", "Ada")
    expect(onPayloadChange).toHaveBeenLastCalledWith(
      "Ada",
      expect.objectContaining({ reason: "trigger-press" })
    )
    press(instance, "b", "Grace")
    expect(onPayloadChange).toHaveBeenLastCalledWith(
      "Grace",
      expect.objectContaining({ reason: "trigger-press" })
    )
    expect(onPayloadChange).toHaveBeenCalledTimes(2)
    expect(onOpenChange).toHaveBeenCalledOnce()
    expect(instance.get()).toMatchObject({
      open: true,
      trigger: "b",
      payload: "Grace",
    })
    instance.api.close()
  })

  test("the payload changes before the open, so onOpenChange reads the new one", () => {
    const payloads: unknown[] = []
    const instance = create({
      onOpenChange: () => payloads.push(instance.api.getPayload()),
    })
    press(instance, "a", "Ada")
    expect(payloads).toEqual(["Ada"])
    instance.api.close()
  })

  test("reopening with the same payload reports no change", () => {
    const onPayloadChange = vi.fn()
    const instance = create({ onPayloadChange })
    instance.api.open({ payload: "Ada" })
    instance.api.close()
    instance.api.open({ payload: "Ada" })
    expect(onPayloadChange).toHaveBeenCalledOnce()
    expect(onPayloadChange).toHaveBeenLastCalledWith(
      "Ada",
      expect.objectContaining({ reason: "imperative" })
    )
    instance.api.close()
  })

  test("canceling a handover keeps the previous payload", () => {
    const instance = create({
      onPayloadChange: (payload: unknown, details: { cancel: () => void }) =>
        payload === "Grace" && details.cancel(),
    })
    press(instance, "a", "Ada")
    press(instance, "b", "Grace")
    expect(instance.get()).toMatchObject({
      open: true,
      trigger: "b",
      payload: "Ada",
    })
    instance.api.close()
  })

  test("a controller's new payload keeps the trigger that opened it", () => {
    const instance = create({})
    press(instance, "a", "Ada")
    instance.api.open({ payload: "Grace" })
    expect(instance.get()).toMatchObject({
      open: true,
      trigger: "a",
      payload: "Grace",
    })
    instance.api.close()
  })

  test("a canceled open puts the previous payload back", () => {
    const instance = create({
      onOpenChange: (open: boolean, details: { cancel: () => void }) =>
        open && details.cancel(),
    })
    press(instance, "a", "Ada")
    expect(instance.get()).toMatchObject({ open: false, payload: undefined })
  })
})

// A controller's `open({ payload })` on the open popup replaces the payload,
// like a trigger handover, and returns the promise the first open did.
const controlled = {
  ...popups,
  "alert dialog": (options: object) => alertDialog({ id: "a", ...options }),
  tooltip: (options: object) => tooltip({ id: "t", ...options }),
  "hover card": (options: object) => hoverCard({ id: "h", ...options }),
}

describe.each(Object.entries(controlled))(
  "%s controller opens while open",
  (_name, create) => {
    test("a new payload replaces the shown one, with reason imperative and the same promise", () => {
      const onOpenChange = vi.fn()
      const onPayloadChange = vi.fn()
      const instance = create({ onOpenChange, onPayloadChange })
      const first = instance.api.open({ payload: "Ada" })
      onPayloadChange.mockClear()
      const second = instance.api.open({ payload: "Grace" })
      expect(second).toBe(first)
      expect(onPayloadChange).toHaveBeenCalledOnce()
      expect(onPayloadChange).toHaveBeenLastCalledWith(
        "Grace",
        expect.objectContaining({ reason: "imperative" })
      )
      expect(onOpenChange).toHaveBeenCalledOnce()
      expect(instance.get()).toMatchObject({ open: true, payload: "Grace" })
      instance.api.close()
    })

    test("canceling the new payload keeps the shown one", () => {
      const instance = create({
        onPayloadChange: (payload: unknown, details: { cancel: () => void }) =>
          payload === "Grace" && details.cancel(),
      })
      const first = instance.api.open({ payload: "Ada" })
      expect(instance.api.open({ payload: "Grace" })).toBe(first)
      expect(instance.get()).toMatchObject({ open: true, payload: "Ada" })
      instance.api.close()
    })

    test("an open without a payload, or with the same one, changes nothing", () => {
      const onPayloadChange = vi.fn()
      const instance = create({ onPayloadChange })
      instance.api.open({ payload: "Ada" })
      instance.api.open()
      instance.api.open({ payload: "Ada" })
      expect(onPayloadChange).toHaveBeenCalledOnce()
      expect(instance.get()).toMatchObject({ open: true, payload: "Ada" })
      instance.api.close()
    })

    test("setOpen and toggle carry no payload, so the payload hears imperative", () => {
      const onOpenChange = vi.fn()
      const onPayloadChange = vi.fn()
      const instance = create({ onOpenChange, onPayloadChange })
      for (const open of [
        () => instance.api.setOpen(true, { reason: "trigger-press" }),
        () => instance.api.toggle({ reason: "trigger-press" }),
      ]) {
        instance.api.open({ payload: "Ada" })
        instance.api.close()
        onPayloadChange.mockClear()
        open()
        expect(onOpenChange).toHaveBeenLastCalledWith(
          true,
          expect.objectContaining({ reason: "trigger-press" })
        )
        expect(onPayloadChange).toHaveBeenCalledExactlyOnceWith(
          undefined,
          expect.objectContaining({ reason: "imperative" })
        )
        instance.api.close()
      }
    })
  }
)

describe("payload changes elsewhere", () => {
  test("an alert dialog reports the payload it opens with", () => {
    const onPayloadChange = vi.fn()
    const instance = alertDialog({ id: "a", onPayloadChange })
    instance.api.open({ payload: "Delete Roadmap.pdf?" })
    expect(onPayloadChange).toHaveBeenCalledWith(
      "Delete Roadmap.pdf?",
      expect.objectContaining({ reason: "imperative" })
    )
    instance.api.close()
  })

  test("a context area that takes an open menu over reports its payload", () => {
    const onPayloadChange = vi.fn()
    const instance = menu({ id: "m", onPayloadChange })
    instance.api.internal.contextOpen(
      { x: 0, y: 0 },
      { by: "pointer", key: "a", payload: "Ada" }
    )
    instance.api.internal.contextOpen(
      { x: 0, y: 40 },
      { by: "pointer", key: "b", payload: "Grace" }
    )
    expect(onPayloadChange.mock.calls.map(([payload]) => payload)).toEqual([
      "Ada",
      "Grace",
    ])
    expect(instance.get()).toMatchObject({ open: true, trigger: "b" })
    instance.api.close()
  })

  test("a submenu reports no payload of its own", () => {
    const onPayloadChange = vi.fn()
    const root = menu({ id: "m" })
    const sub = menu({ id: "s", parent: root.api, onPayloadChange })
    root.api.open({ payload: "Ada" })
    sub.api.open()
    expect(onPayloadChange).not.toHaveBeenCalled()
    root.api.close()
  })
})
