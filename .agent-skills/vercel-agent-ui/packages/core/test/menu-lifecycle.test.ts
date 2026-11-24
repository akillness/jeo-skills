// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import { menubar } from "../src/components/menubar/menubar"
import type { MenuOpenChangeReason } from "../src/components/menu/menu"
import type { ChangeDetails } from "../src/foundation/kernel/details"
import { bind } from "../src/foundation/kernel/part"
import { menu } from "./menu-parts"

Element.prototype.getAnimations ??= () => []
Element.prototype.scrollIntoView ??= () => {}

afterEach(() => document.body.replaceChildren())

const refusing =
  (reason: MenuOpenChangeReason) =>
  (open: boolean, details: ChangeDetails<MenuOpenChangeReason>) => {
    if (!open && details.reason === reason) {
      details.cancel()
    }
  }

const settle = () => new Promise((resolve) => setTimeout(resolve))

function pressShortcut() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "s", code: "KeyS", ctrlKey: true })
  )
}

function dataMenu(
  onAction: (value: string, details: { event?: Event }) => unknown
) {
  const instance = menu({
    id: "file",
    items: [{ value: "save", label: "Save", shortcut: "mod+s" }],
    onAction,
  })
  const trigger = document.body.appendChild(document.createElement("button"))
  trigger.textContent = "File"
  bind(instance.part("trigger", { id: "file-trigger" }), trigger)
  return instance
}

describe("a data menu item's shortcut while the menu is closed", () => {
  test("waits for a pending action before running it again", async () => {
    let resolve!: () => void
    const onAction = vi.fn(() => new Promise<void>((done) => (resolve = done)))
    const instance = dataMenu(onAction)
    pressShortcut()
    pressShortcut()
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(instance.get().pending).toHaveLength(1)
    resolve()
    await settle()
    expect(instance.get().pending).toEqual([])
    pressShortcut()
    expect(onAction).toHaveBeenCalledTimes(2)
  })

  test("keeps a rejected action from going unhandled", async () => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    dataMenu(() => Promise.reject(new Error("offline")))
    pressShortcut()
    await settle()
    process.off("unhandledRejection", unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  test("passes no event, as a closed menu has none", () => {
    const onAction = vi.fn()
    dataMenu(onAction)
    pressShortcut()
    expect(onAction).toHaveBeenCalledWith("save", { event: undefined })
  })
})

describe("a submenu that refuses to close", () => {
  function tree(onOpenChange: ReturnType<typeof refusing>) {
    const root = menu({ id: "root" })
    const share = menu({ id: "share", parent: root.api, onOpenChange })
    const exporting = menu({ id: "export", parent: root.api })
    const content = document.body.appendChild(document.createElement("div"))
    bind(root.part("content"), content)
    const element = (id: string) => {
      const el = content.appendChild(document.createElement("div"))
      el.id = id
      el.textContent = id
      return el
    }
    bind(root.part("item", { id: "copy" }), element("copy"))
    bind(
      share.part("trigger", { id: "share-trigger" }),
      element("share-trigger")
    )
    bind(
      exporting.part("trigger", { id: "export-trigger" }),
      element("export-trigger")
    )
    root.api.open()
    share.api.open()
    return { root, share, exporting }
  }

  test("keeps a sibling from opening beside it", () => {
    const { root, share, exporting } = tree(refusing("submenu-switch"))
    exporting.api.open()
    expect(share.get().open).toBe(true)
    expect(exporting.get().open).toBe(false)
    expect(root.get().openChild).toBe(share.api.id)
  })

  test("keeps the highlight on its trigger", () => {
    const { root, share } = tree(refusing("submenu-switch"))
    root.api.internal.highlight("share-trigger")
    root.api.internal.highlight("copy")
    expect(share.get().open).toBe(true)
    expect(root.get().highlighted).toBe("share-trigger")
  })

  test("keeps the pointer resting on another item from moving the highlight", () => {
    const onOpenChange = vi.fn(refusing("submenu-switch"))
    const { root, share } = tree(onOpenChange)
    root.api.internal.highlight("share-trigger")
    onOpenChange.mockClear()
    const copy = document.getElementById("copy")!
    root.api.internal.hoverItem(
      copy,
      new PointerEvent("pointermove", { pointerType: "mouse", clientX: 1 })
    )
    expect(share.get().open).toBe(true)
    expect(root.get().highlighted).toBe("share-trigger")
    expect(onOpenChange).toHaveBeenCalledTimes(1)
  })

  test("keeps its parent open", () => {
    const { root, share } = tree(refusing("parent-close"))
    expect(root.api.close()).toBe(false)
    expect(root.get().open).toBe(true)
    expect(share.get().open).toBe(true)
  })
})

describe("closing a menu with focus in its submenu", () => {
  test("returns focus to its trigger when the submenu renders elsewhere", () => {
    const root = menu({ id: "file" })
    const share = menu({ id: "share", parent: root.api })
    const trigger = document.body.appendChild(document.createElement("button"))
    trigger.textContent = "File"
    bind(root.part("trigger", { id: "file-trigger" }), trigger)
    const content = document.body.appendChild(document.createElement("div"))
    bind(root.part("content"), content)
    const shareTrigger = content.appendChild(document.createElement("div"))
    shareTrigger.id = "share-trigger"
    shareTrigger.textContent = "Share"
    bind(share.part("trigger", { id: "share-trigger" }), shareTrigger)
    const shareContent = document.body.appendChild(
      document.createElement("div")
    )
    bind(share.part("content"), shareContent)
    const email = shareContent.appendChild(document.createElement("div"))
    email.textContent = "Email"
    email.tabIndex = -1
    bind(share.part("item", { id: "email" }), email)
    root.api.open()
    share.api.open()
    // jsdom hides the nested popover, which a browser would show.
    shareContent.style.display = "block"
    email.focus()
    expect(document.activeElement).toBe(email)
    root.api.close()
    expect(share.get().open).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })
})

describe("a menubar menu that refuses to close", () => {
  function setup(editDisabled: boolean) {
    const bar = menubar({ id: "bar" })
    const file = menu({
      id: "file",
      menubar: () => bar.api,
      onOpenChange: refusing("submenu-switch"),
    })
    const edit = menu({ id: "edit", menubar: () => bar.api })
    const triggers = [file, edit].map((instance) => {
      const el = document.body.appendChild(document.createElement("button"))
      el.textContent = instance.api.id
      const disabled = instance === edit && editDisabled
      bind(
        instance.part("trigger", {
          id: `${instance.api.id}-trigger`,
          disabled,
        }),
        el
      )
      return el
    })
    file.api.open()
    return { bar, file, edit, triggers }
  }

  test("keeps another menu from opening", () => {
    const { file, edit } = setup(false)
    edit.api.open()
    expect(file.get().open).toBe(true)
    expect(edit.get().open).toBe(false)
  })

  test("keeps focus off a disabled trigger an arrow key moves to", () => {
    const { bar, file, triggers } = setup(true)
    bar.api.internal.menuArrow(
      "file",
      1,
      new KeyboardEvent("keydown", { key: "ArrowRight" })
    )
    expect(file.get().open).toBe(true)
    expect(document.activeElement).not.toBe(triggers[1])
  })
})

describe("a root menu closing with focus in a portalled submenu", () => {
  function tree() {
    const style = document.head.appendChild(document.createElement("style"))
    style.textContent = "[popover] { display: block !important }"
    const root = menu({ id: "root" })
    const share = menu({ id: "share", parent: root.api })
    const trigger = document.body.appendChild(document.createElement("button"))
    bind(root.part("trigger", { id: "root-trigger" }), trigger)
    const content = document.body.appendChild(document.createElement("div"))
    bind(root.part("content"), content)
    const shareTrigger = content.appendChild(document.createElement("div"))
    shareTrigger.tabIndex = -1
    bind(share.part("trigger", { id: "share-trigger" }), shareTrigger)
    const shareContent = document.body.appendChild(
      document.createElement("div")
    )
    bind(share.part("content"), shareContent)
    const item = shareContent.appendChild(document.createElement("div"))
    item.tabIndex = -1
    bind(share.part("item", { id: "link" }), item)
    trigger.focus()
    root.api.open()
    share.api.open()
    item.focus()
    return { root, share, trigger }
  }

  test("returns focus to its trigger", () => {
    const { root, share, trigger } = tree()
    root.api.close()
    expect(share.get().open).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  test("returns focus to its trigger after an item runs", async () => {
    const { share, trigger } = tree()
    share.api.action("link")
    await settle()
    expect(document.activeElement).toBe(trigger)
  })
})
