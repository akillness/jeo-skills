// @vitest-environment jsdom
// createPopup, its part builders and popupState: a link preview on
// `hoverCardPreset`, a popover on `popoverPreset`, tooltips on
// `tooltipPreset`, and our Popover, Hover Card and Tooltip on them, driven
// the way a person would, with the testing kit.
import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest"
import {
  linkPreview,
  type LinkPreviewOptions,
} from "../../../examples/experiments/link-preview"
import type { ChangeDetails } from "../src/foundation/kernel/details"
import { bind } from "../src/foundation/kernel/part"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { createPopup, popupState } from "../src/foundation/popups/create-popup"
import { tooltipPreset } from "../src/foundation/popups/popup-hover-presets"
import { popoverPreset } from "../src/foundation/popups/popup-presets"
import { popupSlots } from "../src/foundation/popups/popup-slots"
import { carousel } from "../src/components/carousel/carousel"
import { dialog } from "../src/components/dialog/dialog"
import { hoverCard } from "../src/components/hover-card/hover-card"
import { popover } from "../src/components/popover/popover"
import { tooltip } from "../src/components/tooltip/tooltip"
import { select } from "../src/components/select/select"
import { combobox } from "../src/components/combobox/combobox"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { findLayer } from "../src/foundation/platform/layers"
import { type Modal, modalTriple } from "../src/foundation/popups/popup"
import { checkPattern, checkServer, mount } from "../src/testing"
import { rerenderOf } from "../src/testing/mount"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

const frame = () =>
  new Promise((done) => requestAnimationFrame(() => setTimeout(done)))

const page = (title: string) =>
  JSON.stringify({
    title,
    description: `About ${title}.`,
    image: `/${title}.png`,
  })

const previewMarkup = `<div>
  <button>Before</button>
  <p>
    Read about <trigger id="popups" as="a" href="/docs/popups" payload='${page("Popups")}'>popups</trigger>
    and <trigger id="focus" as="a" href="/docs/focus" payload='${page("Focus")}'>focus</trigger>.
  </p>
  <content><image></image><title>Preview</title><a href="/docs">Open</a></content>
  <button>After</button>
</div>`

function preview(options: LinkPreviewOptions = {}) {
  const reasons: string[] = []
  const view = mount(
    linkPreview,
    {
      delay: 50,
      ...options,
      onOpenChange: (_open, details) => reasons.push(details.reason),
    },
    previewMarkup
  )
  mounts.push(view)
  const button = (name: string) =>
    [...view.root.querySelectorAll("button")].find(
      (el) => el.textContent === name
    )!
  // `state` is a getter, so the view gets the extras rather than being copied.
  return Object.assign(view, { reasons, button })
}

describe("a link preview on the hoverCard preset", () => {
  test("opens once the pointer has rested on a link for its delay", async () => {
    // Well past the two frames `hover` waits, even on a busy machine.
    const view = preview({ delay: 500 })
    await view.hover(view.part("trigger", "popups")!)
    expect(view.state.open).toBe(false)
    await vi.waitFor(() => expect(view.state.open).toBe(true), {
      timeout: 2000,
    })
    expect(view.part("content")!.isConnected).toBe(true)
    expect(view.part("trigger", "popups")!.hasAttribute("data-open")).toBe(true)
    expect(view.reasons).toEqual(["trigger-hover"])
  })

  test("opens when keyboard focus reaches a link, without taking focus", async () => {
    const view = preview()
    await view.keys("Tab", "Tab")
    expect(document.activeElement).toBe(view.part("trigger", "popups"))
    await vi.waitFor(() => expect(view.state.open).toBe(true))
    expect(document.activeElement).toBe(view.part("trigger", "popups"))
    expect(view.reasons).toEqual(["trigger-focus"])
  })

  test("Escape closes it and focus stays where it was", async () => {
    const view = preview()
    await view.keys("Tab", "Tab")
    await vi.waitFor(() => expect(view.state.open).toBe(true))
    await view.keys("Escape")
    expect(view.state.open).toBe(false)
    expect(document.activeElement).toBe(view.part("trigger", "popups"))
    expect(view.reasons).toEqual(["trigger-focus", "escape-key"])
  })

  test("Escape on one the pointer opened leaves focus on what had it", async () => {
    const view = preview()
    view.button("Before").focus()
    await view.hover(view.part("trigger", "popups")!)
    await vi.waitFor(() => expect(view.state.open).toBe(true))
    await view.keys("Escape")
    expect(view.state.open).toBe(false)
    expect(document.activeElement).toBe(view.button("Before"))
  })

  test("a press outside closes it", async () => {
    const view = preview()
    await view.hover(view.part("trigger", "popups")!)
    await vi.waitFor(() => expect(view.state.open).toBe(true))
    await view.click(view.button("After"))
    expect(view.state.open).toBe(false)
    expect(view.reasons).toEqual(["trigger-hover", "outside-press"])
  })

  test("Tab from the link moves into the preview, and leaving it closes it", async () => {
    const view = preview()
    await view.keys("Tab", "Tab")
    await vi.waitFor(() => expect(view.state.open).toBe(true))
    await view.keys("Tab")
    expect(view.part("content")!.contains(document.activeElement)).toBe(true)
    view.button("After").focus()
    await view.settle()
    expect(view.state.open).toBe(false)
    expect(view.reasons).toEqual(["trigger-focus", "focus-out"])
  })

  test("each link hands the preview its page, and another link takes the open preview over", async () => {
    const payloads: { title: string; reason: string }[] = []
    const view = preview({
      onPayloadChange: (page, details) =>
        payloads.push({
          title: (page as { title: string }).title,
          reason: details.reason,
        }),
    })
    await view.hover(view.part("trigger", "popups")!)
    await vi.waitFor(() => expect(view.state.open).toBe(true))
    expect(view.part("image")!.getAttribute("src")).toBe("/Popups.png")
    await view.hover(view.part("trigger", "focus")!)
    expect(view.state.open).toBe(true)
    expect(view.state.trigger).toBe("focus")
    expect(view.part("image")!.getAttribute("src")).toBe("/Focus.png")
    expect(view.part("trigger", "focus")!.hasAttribute("data-open")).toBe(true)
    expect(view.part("trigger", "popups")!.hasAttribute("data-open")).toBe(
      false
    )
    expect(payloads).toEqual([
      { title: "Popups", reason: "trigger-hover" },
      { title: "Focus", reason: "trigger-hover" },
    ])
    // Taking over opens nothing new.
    expect(view.reasons).toEqual(["trigger-hover"])
  })

  test("renders on the server from state alone", () => {
    const closed = checkServer(linkPreview, {}, previewMarkup)
    expect(closed).not.toContain('data-slot="link-preview-content"')
    const open = checkServer(linkPreview, { defaultOpen: true }, previewMarkup)
    expect(open).toContain('data-slot="link-preview-content"')
    expect(open).not.toContain('role="dialog"')
  })
})

type ShareOptions = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details: ChangeDetails<string>) => void
  modal?: Extract<Modal, boolean | "trap-focus">
  openOnHover?: boolean
}

// A popover as an agent would write it: three names and a controller.
const share = definePrimitive({
  name: "share",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    modal: "value",
    openOnHover: "boolean",
  },
  state: (options: ShareOptions) => popupState(options),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: (context) => createPopup(context, { preset: popoverPreset }),
  slots: (slot) => popupSlots(slot),
})

// The same popover with no `sync`, as a primitive that hands no state from its options.
const unsyncedShare = definePrimitive({
  name: "unsynced-share",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    modal: "value",
    openOnHover: "boolean",
  },
  state: (options: ShareOptions) => popupState(options),
  api: (context) => createPopup(context, { preset: popoverPreset }),
  slots: (slot) => popupSlots(slot),
})

const shareMarkup = `<div>
  <trigger>Share</trigger>
  <content><title>Share</title><button>Copy link</button><close>Close</close></content>
  <button>After</button>
</div>`

const backdropMarkup = `<div>
  <trigger>Share</trigger>
  <backdrop></backdrop>
  <content><title>Share</title><close>Close</close></content>
  <button>After</button>
</div>`

function sharing(options: ShareOptions = {}) {
  const reasons: string[] = []
  const view = mount(
    share,
    {
      ...options,
      onOpenChange: (_open, details) => reasons.push(details.reason),
    },
    shareMarkup
  )
  mounts.push(view)
  return Object.assign(view, { reasons })
}

const outsideButton = (root: Element) =>
  [...root.querySelectorAll("button")].find((el) => el.textContent === "After")!

// Lays an element out at a box, since jsdom lays nothing out.
const place = (el: Element, box: DOMRect) =>
  Object.assign(el, { getBoundingClientRect: () => box })

// Keeps elements animating out for the rest of the test.
function holdExit(...els: Element[]) {
  const computed = window.getComputedStyle
  const fading = {
    transitionDuration: "10s",
    transitionDelay: "0s",
    animationDuration: "0s",
    animationDelay: "0s",
  }
  vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) =>
    els.includes(el) ? (fading as CSSStyleDeclaration) : computed(el, pseudo)
  )
  for (const el of els) {
    Object.assign(el, {
      getAnimations: () => [{ finished: new Promise(() => {}), effect: null }],
    })
  }
  onTestFinished(() => {
    vi.restoreAllMocks()
  })
}

// What reached an element pressed with the mouse: its pointerdown, said
// prevented when it was, and its click.
async function pressOn(
  view: { click: (el: Element) => Promise<void> },
  el: Element
) {
  const heard: string[] = []
  const hear = (event: Event) =>
    heard.push(`${event.type}${event.defaultPrevented ? " prevented" : ""}`)
  for (const type of ["pointerdown", "click"]) {
    el.addEventListener(type, hear)
  }
  await view.click(el)
  for (const type of ["pointerdown", "click"]) {
    el.removeEventListener(type, hear)
  }
  return heard
}

describe("a popup animating out", () => {
  test.each([false, true])(
    "lets a press on its content through to the page, modal: %s",
    async (modal) => {
      const view = sharing({ modal })
      await view.click(view.part("trigger")!)
      const content = view.part("content")!
      holdExit(content)
      place(content, new DOMRect(0, 0, 200, 200))
      await view.keys("Escape")
      expect(view.state).toMatchObject({ open: false, mounted: true })
      const after = place(outsideButton(view.root), new DOMRect(50, 50, 20, 20))
      expect(await pressOn(view, after)).toEqual(["pointerdown", "click"])
      expect(view.state.mounted).toBe(true)
    }
  )

  test("a modal dialog swallows a press on its backdrop, so it never reaches the page", async () => {
    const view = mount(dialog, { modal: true }, backdropMarkup)
    mounts.push(view)
    await view.click(view.part("trigger")!)
    const [backdrop, content] = [view.part("backdrop")!, view.part("content")!]
    holdExit(backdrop, content)
    place(backdrop, new DOMRect(0, 0, 1000, 1000))
    place(content, new DOMRect(300, 300, 200, 200))
    await view.keys("Escape")
    expect(view.state).toMatchObject({ open: false, mounted: true })
    const after = outsideButton(view.root)
    expect(
      await pressOn(view, place(after, new DOMRect(50, 50, 20, 20)))
    ).toEqual(["pointerdown prevented"])
    expect(
      await pressOn(view, place(after, new DOMRect(350, 350, 20, 20)))
    ).toEqual(["pointerdown", "click"])
    expect(view.state.mounted).toBe(true)
  })
})

describe("a modal dialog closed by a press on its backdrop", () => {
  test("lets the next click through when the press's own click never comes", async () => {
    const view = mount(dialog, { modal: true }, backdropMarkup)
    mounts.push(view)
    const trigger = view.part("trigger")!
    await view.click(trigger)
    const backdrop = view.part("backdrop")!
    const press = { bubbles: true, cancelable: true, composed: true, button: 0 }
    backdrop.dispatchEvent(new PointerEvent("pointerdown", press))
    // The backdrop leaves as the release closes the dialog, so no click follows.
    backdrop.dispatchEvent(new PointerEvent("pointerup", press))
    expect(view.state.open).toBe(false)
    trigger.focus()
    await view.keys("Space")
    expect(view.state.open).toBe(true)
  })
})

describe("a popover on the popover preset", () => {
  test("a modal one passes the dialog pattern", async () => {
    const view = sharing({ modal: true })
    await view.click(view.part("trigger")!)
    expect(view.part("content")!.getAttribute("aria-modal")).toBe("true")
    await checkPattern(view.root, "dialog")
  })

  test("one with no sync follows a modal option that changes while it's open", async () => {
    const view = mount(
      unsyncedShare,
      { defaultOpen: true, modal: true },
      shareMarkup
    )
    mounts.push(view)
    expect(view.part("content")!.getAttribute("aria-modal")).toBe("true")
    rerenderOf(view).setOptions({ modal: false })
    expect(view.state.modal).toBe(false)
    expect(view.part("content")!.hasAttribute("aria-modal")).toBe(false)
  })

  test("a non-modal one passes the dialog pattern without aria-modal", async () => {
    const view = sharing()
    await view.click(view.part("trigger")!)
    expect(view.part("content")!.hasAttribute("aria-modal")).toBe(false)
    await checkPattern(view.root, "dialog")
  })

  test("onOpenChange hears why it opened and closed each time", async () => {
    const view = sharing()
    const trigger = view.part("trigger")!
    await view.click(trigger)
    await view.click(trigger)
    await view.click(trigger)
    await view.click(view.part("close")!)
    await view.click(trigger)
    await view.keys("Escape")
    await view.click(trigger)
    await view.click(view.root.lastElementChild!)
    view.api.setOpen(true)
    view.api.close()
    expect(view.reasons).toEqual([
      "trigger-press",
      "trigger-press",
      "trigger-press",
      "close-press",
      "trigger-press",
      "escape-key",
      "trigger-press",
      "outside-press",
      "imperative",
      "imperative",
    ])
  })

  test("onOpenChange hears the details its rules add", async () => {
    type TaggedOptions = {
      defaultOpen?: boolean
      onOpenChange?: (
        open: boolean,
        details: ChangeDetails<string> & { tag: string }
      ) => void
    }
    const tagged = definePrimitive({
      name: "tagged",
      options: { defaultOpen: "boolean", onOpenChange: "callback" },
      state: (options: TaggedOptions) => popupState(options),
      api: (context) =>
        createPopup(context, {
          preset: popoverPreset,
          rules: () => ({ details: () => ({ tag: "share" }) }),
        }),
      slots: (slot) => popupSlots(slot),
    })
    const tags: string[] = []
    const view = mount(
      tagged,
      { onOpenChange: (_open, details) => tags.push(details.tag) },
      shareMarkup
    )
    mounts.push(view)
    await view.click(view.part("trigger")!)
    await view.keys("Escape")
    expect(tags).toEqual(["share", "share"])
  })

  test("a controlled one opens only when its owner says", async () => {
    const view = sharing({ open: false })
    await view.click(view.part("trigger")!)
    expect(view.reasons).toEqual(["trigger-press"])
    expect(view.state.open).toBe(false)
  })

  test("with openOnHover, resting the pointer opens it and a press keeps it open", async () => {
    const view = mount(share, { openOnHover: true }, shareMarkup)
    mounts.push(view)
    await view.hover(view.part("trigger")!)
    await vi.waitFor(() => expect(view.state.open).toBe(true))
    await view.click(view.part("trigger")!)
    expect(view.state.open).toBe(true)
  })

  test("one the pointer opened closes when another opens by hover, unless that one is inside it", async () => {
    const first = sharing({ openOnHover: true })
    const second = sharing({ openOnHover: true })
    const nested = sharing({ openOnHover: true })
    await first.hover(first.part("trigger")!)
    await vi.waitFor(() => expect(first.state.open).toBe(true))
    first.part("content")!.append(nested.root)
    await nested.hover(nested.part("trigger")!)
    await vi.waitFor(() => expect(nested.state.open).toBe(true))
    expect(first.state.open).toBe(true)
    await second.hover(second.part("trigger")!)
    await vi.waitFor(() => expect(second.state.open).toBe(true))
    expect(first.state.open).toBe(false)
    expect(nested.state.open).toBe(false)
    expect(first.reasons).toEqual(["trigger-hover", "trigger-hover"])
  })

  test("renders on the server from state alone", () => {
    const html = checkServer(
      share,
      { defaultOpen: true, modal: true },
      shareMarkup
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-labelledby="server-')
  })
})

// A tooltip as an agent would write it.
const tip = definePrimitive({
  name: "tip",
  options: { open: "boolean", defaultOpen: "boolean", delay: "number" },
  state: (options: { open?: boolean; defaultOpen?: boolean; delay?: number }) =>
    popupState(options),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: (context) => createPopup(context, { preset: tooltipPreset }),
  slots: (slot) => popupSlots(slot),
})

const tipMarkup = (label: string) =>
  `<div><trigger as="button">${label}</trigger><content>${label} tip</content></div>`

describe("tooltips on tooltipPreset", () => {
  test("describe their trigger, and the next opens at once while one is open, closing it", async () => {
    const first = mount(tip, { delay: 50 }, tipMarkup("Bold"))
    const second = mount(tip, { delay: 50 }, tipMarkup("Italic"))
    mounts.push(first, second)
    const trigger = first.part("trigger")!
    expect(trigger.getAttribute("aria-describedby")).toBe(
      first.part("content")!.id
    )
    await first.hover(trigger)
    await vi.waitFor(() => expect(first.state.open).toBe(true))
    await second.hover(second.part("trigger")!)
    expect(second.state.open).toBe(true)
    expect(first.state.open).toBe(false)
  })
})

describe("our popups on the kit", () => {
  test("Popover passes the dialog pattern and its trigger's shortcut opens it", async () => {
    const view = mount(
      popover,
      {},
      `<div><trigger shortcut="mod+i">Share</trigger><content><title>Share</title><button>Copy link</button><close>Close</close></content><button>After</button></div>`
    )
    mounts.push(view)
    await view.click(view.part("trigger")!)
    await checkPattern(view.root, "dialog")
    expect(view.part("trigger")!.getAttribute("aria-keyshortcuts")).toBeTruthy()
  })

  test("Popover closing after the trigger that opened it is gone moves focus past it, not to its other trigger", async () => {
    const view = mount(
      popover,
      {},
      `<div><trigger id="ada">Ada</trigger><trigger id="grace">Grace</trigger><button>After</button><content><button>Copy link</button></content></div>`
    )
    mounts.push(view)
    const grace = view.part("trigger", "grace")!
    grace.focus()
    await view.keys("Enter")
    expect(view.state.open).toBe(true)
    grace.remove()
    await view.keys("Escape")
    expect(view.state.open).toBe(false)
    expect(document.activeElement?.textContent).toBe("After")
  })

  test("Popover whose only trigger renders again while open returns focus to the new one", async () => {
    const instance = popover({ id: "p" })
    const first = Object.assign(document.createElement("button"), {
      textContent: "Open",
    })
    const content = document.createElement("div")
    const inside = content.appendChild(
      Object.assign(document.createElement("button"), { textContent: "Inside" })
    )
    document.body.append(first, content)
    const unbindContent = bind(instance.part("content"), content)
    const unbindFirst = bind(instance.part("trigger", { id: "t1" }), first)
    first.click()
    await frame()
    inside.focus()
    unbindFirst()
    const second = Object.assign(document.createElement("button"), {
      textContent: "Close",
    })
    first.replaceWith(second)
    const unbindSecond = bind(instance.part("trigger", { id: "t2" }), second)
    inside.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
    await frame()
    expect(instance.get().open).toBe(false)
    expect(document.activeElement).toBe(second)
    unbindSecond()
    unbindContent()
    instance.destroy()
  })

  test("Popover that mounts open and whose only trigger renders again returns focus to the new one", async () => {
    for (const options of [{ defaultOpen: true }, { open: true }]) {
      const instance = popover({ id: "p", ...options })
      const button = (text: string) =>
        Object.assign(document.createElement("button"), { textContent: text })
      const [first, after] = [button("Open"), button("After")]
      const content = document.createElement("div")
      const inside = content.appendChild(button("Inside"))
      document.body.append(first, after, content)
      const unbindContent = bind(instance.part("content"), content)
      const unbindFirst = bind(instance.part("trigger", { id: "t1" }), first)
      await frame()
      inside.focus()
      unbindFirst()
      const second = button("Close")
      first.replaceWith(second)
      const unbindSecond = bind(instance.part("trigger", { id: "t2" }), second)
      instance.api.close()
      if ("open" in options) {
        instance.setOptions({ id: "p", open: false })
      }
      await frame()
      expect(document.activeElement).toBe(second)
      unbindSecond()
      unbindContent()
      instance.destroy()
      document.body.replaceChildren()
    }
  })

  test("Popover whose triggers all bind again while open keeps the one that opened it", async () => {
    const instance = popover({ id: "p" })
    const button = (text: string) =>
      Object.assign(document.createElement("button"), { textContent: text })
    const [ada, grace] = [button("Ada"), button("Grace")]
    const content = document.createElement("div")
    const inside = content.appendChild(button("Copy link"))
    document.body.append(ada, grace, content)
    const unbindContent = bind(instance.part("content"), content)
    const triggers = () => [
      bind(instance.part("trigger", { id: "ada" }), ada),
      bind(instance.part("trigger", { id: "grace" }), grace),
    ]
    let unbind = triggers()
    grace.click()
    await frame()
    inside.focus()
    for (const cleanup of unbind) {
      cleanup()
    }
    unbind = triggers()
    expect(instance.get().trigger).toBe("grace")
    inside.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
    await frame()
    expect(document.activeElement).toBe(grace)
    for (const cleanup of [...unbind, unbindContent]) {
      cleanup()
    }
    instance.destroy()
  })

  test("Popover closing after the trigger that opened it is gone and another binds moves focus past it", async () => {
    const instance = popover({ id: "p" })
    const button = (text: string) =>
      Object.assign(document.createElement("button"), { textContent: text })
    const [ada, grace, after, linus] = [
      button("Ada"),
      button("Grace"),
      button("After"),
      button("Linus"),
    ]
    const content = document.createElement("div")
    const inside = content.appendChild(button("Copy link"))
    const row = document.body.appendChild(document.createElement("div"))
    row.append(ada, grace, after)
    document.body.append(content)
    const unbind = [
      bind(instance.part("content"), content),
      bind(instance.part("trigger", { id: "ada" }), ada),
      bind(instance.part("trigger", { id: "grace" }), grace),
    ]
    grace.focus()
    grace.click()
    await frame()
    inside.focus()
    grace.remove()
    row.append(linus)
    unbind.push(bind(instance.part("trigger", { id: "linus" }), linus))
    inside.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
    await frame()
    expect(document.activeElement).toBe(after)
    for (const cleanup of unbind) {
      cleanup()
    }
    instance.destroy()
  })

  test("Popover whose content binds again after the trigger that opened it is gone moves focus past it", async () => {
    const instance = popover({ id: "p" })
    const button = (text: string) =>
      Object.assign(document.createElement("button"), { textContent: text })
    const [ada, grace, after] = [
      button("Ada"),
      button("Grace"),
      button("After"),
    ]
    const content = document.createElement("div")
    const inside = content.appendChild(button("Copy link"))
    const row = document.body.appendChild(document.createElement("div"))
    row.append(ada, grace, after)
    document.body.append(content)
    let unbindContent = bind(instance.part("content"), content)
    const unbind = [
      bind(instance.part("trigger", { id: "ada" }), ada),
      bind(instance.part("trigger", { id: "grace" }), grace),
    ]
    grace.focus()
    grace.click()
    await frame()
    grace.remove()
    unbindContent()
    unbindContent = bind(instance.part("content"), content)
    await frame()
    inside.focus()
    inside.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
    await frame()
    expect(instance.get().open).toBe(false)
    expect(document.activeElement).toBe(after)
    for (const cleanup of [unbindContent, ...unbind]) {
      cleanup()
    }
    instance.destroy()
  })

  test("Popover closing from its other trigger after the one that opened it is gone leaves focus there", async () => {
    const instance = popover({ id: "p" })
    const button = (text: string) =>
      Object.assign(document.createElement("button"), { textContent: text })
    const [ada, grace, after] = [
      button("Ada"),
      button("Grace"),
      button("After"),
    ]
    const content = document.createElement("div")
    content.append(button("Copy link"))
    const row = document.body.appendChild(document.createElement("div"))
    row.append(ada, grace, after)
    document.body.append(content)
    const unbind = [
      bind(instance.part("content"), content),
      bind(instance.part("trigger", { id: "ada" }), ada),
      bind(instance.part("trigger", { id: "grace" }), grace),
    ]
    grace.focus()
    grace.click()
    await frame()
    grace.remove()
    ada.focus()
    ada.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
    await frame()
    expect(instance.get().open).toBe(false)
    expect(document.activeElement).toBe(ada)
    for (const cleanup of unbind) {
      cleanup()
    }
    instance.destroy()
  })

  test("Dialog opened by its trigger's shortcut in a field returns focus to the field", async () => {
    const view = mount(
      dialog,
      {},
      `<div><trigger id="open" shortcut="ctrl+j">Open</trigger><input aria-label="Name"><content><button>Done</button></content></div>`
    )
    mounts.push(view)
    const field = document.querySelector("input")!
    field.focus()
    await view.keys("Control+j")
    expect(view.state.open).toBe(true)
    await view.keys("Escape")
    expect(view.state.open).toBe(false)
    expect(document.activeElement).toBe(field)
  })

  test("Dialog opened from its trigger with the keyboard returns focus to the trigger", async () => {
    const view = mount(
      dialog,
      {},
      `<div><trigger id="open" shortcut="ctrl+j">Open</trigger><input aria-label="Name"><content><button>Done</button></content></div>`
    )
    mounts.push(view)
    const trigger = view.part("trigger", "open")!
    trigger.focus()
    await view.keys("Control+j")
    await view.keys("Escape")
    expect(document.activeElement).toBe(trigger)
  })

  test("Dialog opened from a popover whose trigger is then removed returns focus past that trigger", async () => {
    const menu = popover({ id: "p" })
    const confirm = dialog({ id: "d" })
    const button = (text: string) =>
      Object.assign(document.createElement("button"), { textContent: text })
    const [ada, grace, after] = [
      button("Ada"),
      button("Grace"),
      button("After"),
    ]
    const content = document.createElement("div")
    const remove = content.appendChild(button("Delete"))
    const dialogContent = document.createElement("div")
    const yes = dialogContent.appendChild(button("Confirm"))
    const row = document.body.appendChild(document.createElement("div"))
    row.append(ada, grace, after)
    document.body.append(content, dialogContent)
    const unbind = [
      bind(menu.part("content"), content),
      bind(menu.part("trigger", { id: "ada" }), ada),
      bind(menu.part("trigger", { id: "grace" }), grace),
      bind(confirm.part("content"), dialogContent),
    ]
    grace.focus()
    grace.click()
    await frame()
    remove.focus()
    confirm.api.open()
    await frame()
    menu.api.close()
    await frame()
    grace.remove()
    yes.focus()
    yes.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
    await frame()
    expect(confirm.get().open).toBe(false)
    expect(document.activeElement).toBe(after)
    for (const cleanup of unbind) {
      cleanup()
    }
    confirm.destroy()
    menu.destroy()
  })

  test("Popover opened from a contenteditable returns focus with the caret where it was", async () => {
    const view = mount(
      popover,
      {},
      `<div><div contenteditable="true">Hello world</div><trigger>Link</trigger><content><input aria-label="URL"></content></div>`
    )
    mounts.push(view)
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!
    Object.defineProperty(editor, "isContentEditable", { value: true })
    editor.tabIndex = 0
    editor.focus()
    const text = editor.firstChild!
    document.getSelection()!.setBaseAndExtent(text, 11, text, 6)
    view.api.open()
    await view.settle()
    document.getSelection()!.collapse(document.body, 0)
    await view.keys("Escape")
    expect(document.activeElement).toBe(editor)
    expect(document.getSelection()!.anchorNode).toBe(text)
    expect(document.getSelection()!.anchorOffset).toBe(11)
    expect(document.getSelection()!.focusOffset).toBe(6)
  })

  test("Popover opened from a contenteditable keeps a caret the app placed in it while open", async () => {
    const view = mount(
      popover,
      {},
      `<div><div contenteditable="true">Hello world</div><trigger>Link</trigger><content><input aria-label="URL"></content></div>`
    )
    mounts.push(view)
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!
    Object.defineProperty(editor, "isContentEditable", { value: true })
    editor.tabIndex = 0
    editor.focus()
    document.getSelection()!.collapse(editor.firstChild!, 11)
    view.api.open()
    await view.settle()
    const link = editor.appendChild(document.createTextNode(" link"))
    document.getSelection()!.collapse(link, 5)
    await view.keys("Escape")
    expect(document.activeElement).toBe(editor)
    expect(document.getSelection()!.anchorNode).toBe(link)
    expect(document.getSelection()!.anchorOffset).toBe(5)
  })

  test("Popover opened from code after the trigger that opened it last is gone returns focus to its other trigger", async () => {
    const view = mount(
      popover,
      {},
      `<div><trigger id="ada">Ada</trigger><trigger id="grace">Grace</trigger><button>After</button><content><button>Copy link</button></content></div>`
    )
    mounts.push(view)
    await view.click(view.part("trigger", "grace")!)
    view.part("trigger", "grace")!.remove()
    await view.keys("Escape")
    ;(document.activeElement as HTMLElement | null)?.blur()
    view.api.open()
    await view.settle()
    await view.keys("Escape")
    expect(view.state.open).toBe(false)
    expect(document.activeElement?.textContent).toBe("Ada")
  })

  test("Popover opened by its open option after the trigger that opened it last is gone returns focus to its other trigger", async () => {
    let options = {
      id: "p",
      open: false,
      onOpenChange: (open: boolean) => hand(open),
    }
    const instance = popover(options)
    const hand = (open: boolean) => {
      options = { ...options, open }
      instance.setOptions(options)
    }
    const button = (text: string) =>
      Object.assign(document.createElement("button"), { textContent: text })
    const [ada, grace] = [button("Ada"), button("Grace")]
    const content = document.createElement("div")
    const inside = content.appendChild(button("Copy link"))
    document.body.append(ada, grace, content)
    const unbind = [
      bind(instance.part("content"), content),
      bind(instance.part("trigger", { id: "ada" }), ada),
      bind(instance.part("trigger", { id: "grace" }), grace),
    ]
    grace.click()
    await frame()
    inside.focus()
    grace.remove()
    hand(false)
    await frame()
    hand(true)
    await frame()
    inside.focus()
    hand(false)
    await frame()
    expect(document.activeElement).toBe(ada)
    for (const cleanup of unbind) {
      cleanup()
    }
    instance.destroy()
  })

  test("Hover Card opens on keyboard focus and Escape closes it", async () => {
    const view = mount(
      hoverCard,
      { delay: 0 },
      `<div><trigger as="a" href="/ada">Ada</trigger><content>Wrote the first program.</content></div>`
    )
    mounts.push(view)
    await view.keys("Tab")
    await vi.waitFor(() => expect(view.state.open).toBe(true))
    await view.keys("Escape")
    expect(view.state.open).toBe(false)
    expect(document.activeElement).toBe(view.part("trigger"))
  })

  test("Tooltip opens at once on keyboard focus, a press closes it, and it renders on the server", async () => {
    const view = mount(
      tooltip,
      {},
      `<div><trigger>Save</trigger><content>Save</content></div>`
    )
    mounts.push(view)
    await view.keys("Tab")
    expect(view.state.open).toBe(true)
    await view.click(view.part("trigger")!)
    expect(view.state.open).toBe(false)
    expect(
      checkServer(
        tooltip,
        { defaultOpen: true },
        `<div><trigger>Save</trigger><content>Save</content></div>`
      )
    ).toContain('role="tooltip"')
  })
})

describe("a shown popup's modal effects", () => {
  const listMarkup = `<root><input><content><list></list></content></root>`
  const selectMarkup = `<root><trigger><value></value></trigger><content><list></list></content></root>`
  const changes = <T>(values: readonly T[]) =>
    values.flatMap((from) =>
      values.filter((to) => to !== from).map((to) => ({ from, to }))
    )
  const cases = [
    ...changes([undefined, false, true, "trap-focus"] as const).flatMap(
      ({ from, to }) => [
        {
          name: "a custom popup",
          from,
          to,
          show: () =>
            mount(
              unsyncedShare,
              { defaultOpen: true, modal: from },
              shareMarkup
            ),
        },
        {
          name: "Dialog",
          from,
          to,
          show: () =>
            mount(dialog, { defaultOpen: true, modal: from }, shareMarkup),
        },
        {
          name: "Popover",
          from,
          to,
          show: () =>
            mount(popover, { defaultOpen: true, modal: from }, shareMarkup),
        },
      ]
    ),
    ...changes([undefined, false, true, "pointer"] as const).flatMap(
      ({ from, to }) => [
        {
          name: "Select",
          from,
          to,
          show: () =>
            mount(select, { defaultOpen: true, modal: from }, selectMarkup),
        },
        {
          name: "Combobox",
          from,
          to,
          show: () =>
            mount(combobox, { defaultOpen: true, modal: from }, listMarkup),
        },
        {
          name: "Autocomplete",
          from,
          to,
          show: () =>
            mount(autocomplete, { defaultOpen: true, modal: from }, listMarkup),
        },
      ]
    ),
  ]

  test.each(cases)(
    "$name follows modal from $from to $to while open",
    async ({ show, to }) => {
      const outside = document.body.appendChild(
        document.createElement("button")
      )
      const view = show()
      mounts.push(view)
      await frame()
      const focused = document.activeElement
      rerenderOf(view).setOptions({ modal: to })
      await frame()
      const effects = modalTriple(view.state.modal)
      expect(view.state.open).toBe(true)
      expect(document.activeElement).toBe(focused)
      expect(!!outside.inert).toBe(effects.inertAndLock)
      expect(document.documentElement.style.overflow === "hidden").toBe(
        effects.inertAndLock
      )
      expect(findLayer(view.part("content")!)?.modal).toBe(
        effects.consumeOutsidePress
      )
    }
  )

  test.each([false, true])(
    "a child shown outside its parent stays usable when the parent turns modal, child modal: %s",
    (modal) => {
      const parent = mount(
        dialog,
        { defaultOpen: true, modal: false },
        shareMarkup
      )
      const child = mount(dialog, { modal }, shareMarkup)
      mounts.push(parent, child)
      parent.part("content")!.append(child.part("trigger")!)
      rerenderOf(child).setOptions({ modal, open: true })
      const content = child.part("content")!
      expect(findLayer(content)?.parent).toBe(
        findLayer(parent.part("content")!)
      )
      rerenderOf(parent).setOptions({ modal: true })
      const inert = (node: HTMLElement | null): boolean =>
        !!node && (node.inert || inert(node.parentElement))
      expect(inert(content)).toBe(false)
    }
  )

  test("a modal makes a carousel's slides inert, and leaves a status region live", async () => {
    const photos = mount(
      carousel,
      {},
      `<div><viewport><content><item>One</item><item>Two</item></content></viewport></div>`
    )
    const status = document.body.appendChild(document.createElement("div"))
    status.setAttribute("role", "status")
    const view = mount(dialog, { defaultOpen: true }, shareMarkup)
    mounts.push(photos, view)
    await frame()
    const inert = (node: HTMLElement | null): boolean =>
      !!node && (node.inert || inert(node.parentElement))
    const slides = photos.part("content")!
    expect(slides.getAttribute("aria-live")).toBe("polite")
    expect(inert(slides)).toBe(true)
    expect(inert(photos.part("viewport")!)).toBe(true)
    expect(inert(status)).toBe(false)
  })
})
