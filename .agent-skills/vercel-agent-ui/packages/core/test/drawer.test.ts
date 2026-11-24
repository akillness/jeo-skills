import { describe, expect, test } from "vitest"
import { drawer, type DrawerOptions } from "../src/components/drawer/drawer"
import { partState } from "../src/foundation/kernel/part"

describe("snap points while closed", () => {
  test("a snap point set while closed is where it opens next", () => {
    const instance = drawer({ id: "d", snapPoints: [0.25, 0.5, 1] })
    instance.api.setSnapPoint(1)
    expect(instance.api.getSnapPoint()).toBe(1)
    instance.api.open()
    expect(partState(instance.part("content")).snapPoint).toBe(1)
  })

  test("an uncontrolled drawer opens at its default snap point again once it unmounts", () => {
    const instance = drawer({ id: "d", snapPoints: [0.25, 0.5, 1] })
    instance.api.open()
    instance.api.setSnapPoint(1)
    instance.api.close()
    expect(instance.get().mounted).toBe(false)
    expect(instance.api.getSnapPoint()).toBeNull()
    instance.api.open()
    expect(partState(instance.part("content")).snapPoint).toBe(0.25)
  })

  test("a controlled snap point stays as passed while closed", () => {
    const instance = drawer({
      id: "d",
      snapPoints: [0.25, 0.5, 1],
      snapPoint: 0.5,
    })
    instance.api.open()
    instance.api.close()
    expect(instance.api.getSnapPoint()).toBe(0.5)
  })
})

// What the development build recorded writing while options were handed over.
const relays = () =>
  (globalThis as Record<symbol, { relays?: unknown[] } | undefined>)[
    Symbol.for("ui-sdk.devtools.history@1")
  ]?.relays ?? []

describe("opened through `open`", () => {
  test.each([{ open: true }, { defaultOpen: true }])(
    "initial open state includes snap and modality for %j",
    (open) => {
      const instance = drawer({
        id: "initial-drawer",
        ...open,
        snapPoints: [0.25, 1],
        defaultSnapPoint: 0.25,
        modalAbove: 0.25,
      })
      expect(instance.get()).toMatchObject({
        open: true,
        mounted: true,
        snapPoint: 0.25,
        interactive: true,
        modal: false,
      })
      expect(partState(instance.part("content"))).toMatchObject({
        open: true,
        snapPoint: 0.25,
        interactive: true,
      })
      instance.destroy()
    }
  )

  test("controlled closed state has no initial snap point", () => {
    const instance = drawer({
      id: "closed-drawer",
      open: false,
      snapPoints: [0.25, 1],
      modalAbove: 0.25,
    })
    expect(instance.get()).toMatchObject({
      open: false,
      mounted: false,
      snapPoint: null,
      interactive: false,
    })
    instance.destroy()
  })

  test("an initially controlled snap point overrides its default", () => {
    const instance = drawer({
      id: "controlled-snap",
      open: true,
      snapPoints: [0.25, 1],
      defaultSnapPoint: 0.25,
      snapPoint: 1,
      modalAbove: 0.25,
    })
    expect(instance.get()).toMatchObject({
      snapPoint: 1,
      interactive: false,
      modal: true,
    })
    instance.destroy()
  })

  test("it starts at its first snap point with the option, before it's handed over, each time", () => {
    relays().splice(0)
    let options = {
      id: "d",
      snapPoints: [0.25, 0.5, 1],
      modalAbove: 0.25,
      open: false,
    }
    const instance = drawer(options)
    instance.follow(() => options)
    const hand = (open: boolean) => {
      options = { ...options, open }
      const followed = instance.get()
      instance.setOptions(options)
      return followed
    }
    for (const _ of [1, 2]) {
      expect(hand(true)).toMatchObject({
        open: true,
        snapPoint: 0.25,
        interactive: true,
        modal: false,
      })
      expect(hand(false)).toMatchObject({
        open: false,
        mounted: false,
        snapPoint: null,
      })
    }
    expect(relays()).toEqual([])
  })

  test.each([
    [
      "snap points",
      { snapPoints: [0.25, 1] },
      { snapPoint: 0.25, interactive: true, modal: false },
    ],
    [
      "a default snap point",
      { defaultSnapPoint: 1 },
      { snapPoint: 1, interactive: false, modal: true },
    ],
  ])(
    "it opens with %s changed with it, before they're handed over",
    (_, change, expected) => {
      relays().splice(0)
      let options: DrawerOptions & { id: string } = {
        id: "d",
        snapPoints: [0.5, 1],
        modalAbove: 0.25,
        open: false,
      }
      const instance = drawer(options)
      instance.follow(() => options)
      options = { ...options, ...change, open: true }
      const followed = instance.get()
      instance.setOptions(options)
      expect({ followed, landed: instance.get() }).toMatchObject({
        followed: expected,
        landed: expected,
      })
      expect(relays()).toEqual([])
    }
  )
})

test("an open drawer whose snap point and default both leave its snap points moves to the first left", () => {
  const options: DrawerOptions & { id: string } = {
    id: "d",
    defaultOpen: true,
    snapPoints: [0.5, 1],
    defaultSnapPoint: 0.5,
  }
  const instance = drawer(options)
  expect(instance.api.getSnapPoint()).toBe(0.5)
  instance.setOptions({ ...options, snapPoints: [1] })
  expect(instance.api.getSnapPoint()).toBe(1)
})

test("an open drawer whose snap points become empty keeps a snap point", () => {
  const options: DrawerOptions & { id: string } = {
    id: "d",
    defaultOpen: true,
    snapPoints: [0.5, 1],
  }
  const instance = drawer(options)
  instance.setOptions({ ...options, snapPoints: [] })
  expect(instance.api.getSnapPoint()).not.toBeUndefined()
})
