import { expect, vi } from "vitest"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"
import {
  attrs,
  liveAttrs,
  partState,
  present,
  subscribe,
} from "../src/foundation/kernel/part"

// The guard every slot with `selects` needs. A part that selects on a key
// hears about that key's changes only when it takes or leaves the part's own
// values. A wrong `selects` would hide a real change, so these helpers drive
// state changes and fail on any part that changed without hearing about it.

type Part = { slot: string; props: Record<string, unknown> }
// A step's name, what it does, and optionally what must hold once it has,
// like the tab stop being gone.
type Step = [name: string, run: () => unknown, check?: () => void]

// Everything a part shows: its state, attributes, live attributes and presence.
function shown(instance: PrimitiveInstance, { slot, props }: Part) {
  const part = instance.part(slot, props)
  return JSON.stringify([
    partState(part, props),
    attrs(part, props),
    liveAttrs(part, props),
    present(part, props),
  ])
}

/**
 * Subscribes every part with `subscribe`, runs each step, and fails with
 * the step, slot and props of every part that changed without being
 * notified. Returns how many parts heard each step, so a test can check that
 * the selection narrows who hears a change.
 */
async function expectNoMissedUpdates(
  instance: PrimitiveInstance,
  parts: Part[],
  steps: Step[]
) {
  const watched = parts.map((part) => {
    const entry = { ...part, heard: false, before: "" }
    subscribe(
      instance.part(part.slot, part.props),
      () => (entry.heard = true),
      part.props
    )
    return entry
  })
  const missed: string[] = []
  const heard: Record<string, number> = {}
  for (const [name, run, check] of steps) {
    for (const part of watched) {
      part.heard = false
      part.before = shown(instance, part)
    }
    // Not awaited: a step like opening a menu returns a promise of its close.
    run()
    // Changes queued in a microtask, like a roving group's tab stop, count too.
    await Promise.resolve()
    check?.()
    heard[name] = watched.filter((part) => part.heard).length
    for (const part of watched) {
      if (!part.heard && shown(instance, part) !== part.before) {
        missed.push(`${name}: ${part.slot} ${JSON.stringify(part.props)}`)
      }
    }
  }
  expect(missed, "Parts changed without being notified.").toEqual([])
  return heard
}

/**
 * Just enough of an element for core to bind a part in Node: attributes,
 * listeners, and a place in document order by `index`.
 */
function fakeElement(index: number, tagName = "BUTTON") {
  const attributes = new Map<string, string>()
  const focusListeners = new Set<EventListener>()
  const el = {
    index,
    tagName,
    isConnected: true,
    parentNode: null,
    style: {
      setProperty() {},
      removeProperty() {},
      getPropertyValue: () => "",
    },
    // Node.DOCUMENT_POSITION_FOLLOWING or PRECEDING.
    compareDocumentPosition: (other: { index: number }) =>
      other.index > index ? 4 : 2,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    hasAttribute: (name: string) => attributes.has(name),
    toggleAttribute: (name: string, on: boolean) => (
      on ? attributes.set(name, "") : attributes.delete(name),
      on
    ),
    // Only focus listeners run, when `focus()` is called, as a roving group follows focus.
    addEventListener(type: string, listener: EventListener) {
      if (type === "focus") {
        focusListeners.add(listener)
      }
    },
    removeEventListener(type: string, listener: EventListener) {
      if (type === "focus") {
        focusListeners.delete(listener)
      }
    },
    contains: (other: unknown) => other === el,
    getBoundingClientRect: () => ({
      x: index * 10,
      y: 0,
      left: index * 10,
      top: 0,
      width: 10,
      height: 10,
    }),
    focus() {
      focusListeners.forEach((listener) =>
        listener({ type: "focus", target: el } as unknown as Event)
      )
    },
  }
  return el as unknown as HTMLElement
}

/**
 * A fake element whose exit animation never finishes on its own, so a part
 * stays exiting until a step finishes it. Stubs the timing globals the
 * animation helpers read in Node.
 */
function animatingElement(index: number) {
  vi.stubGlobal("requestAnimationFrame", () => 0)
  vi.stubGlobal("cancelAnimationFrame", () => {})
  const still = {
    transitionDuration: "0s",
    transitionDelay: "0s",
    animationDuration: "0s",
    animationDelay: "0s",
  }
  vi.stubGlobal("getComputedStyle", () => still)
  const running = { finished: new Promise(() => {}), effect: null }
  return Object.assign(fakeElement(index, "SPAN"), {
    getAnimations: () => [running],
  })
}

export {
  animatingElement,
  expectNoMissedUpdates,
  fakeElement,
  type Part,
  type Step,
}
