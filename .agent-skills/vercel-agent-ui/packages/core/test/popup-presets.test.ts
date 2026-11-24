// @vitest-environment jsdom
// Each preset `popup-presets.ts` exports, on a popup an agent would write
// with `createPopup` and `popupSlots`: what its behavior, role, modality,
// naming and sheet are, and that `dialogPreset` names and marks a dialog the
// way Dialog does.
import { afterEach, describe, expect, test } from "vitest"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { createPopup, popupState } from "../src/foundation/popups/create-popup"
import type { Modal } from "../src/foundation/popups/popup"
import {
  alertDialogPreset,
  comboboxPreset,
  datePickerPreset,
  dialogPreset,
  drawerPreset,
  menuPreset,
  popoverPreset,
  type PopupPreset,
  selectPreset,
  triggerMenuPreset,
} from "../src/foundation/popups/popup-presets"
import { popupSlots } from "../src/foundation/popups/popup-slots"
import { dialog } from "../src/components/dialog/dialog"
import { mount } from "../src/testing"

const mounts: { unmount: () => void }[] = []
afterEach(() => {
  mounts.splice(0).forEach((mounted) => mounted.unmount())
  document.body.replaceChildren()
})

type Options = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details: { reason: string }) => void
  modal?: Modal
  presentation?: "auto" | "popover" | "sheet"
  dismissible?: boolean
}

const popupOn = (preset: PopupPreset, name = "own") =>
  definePrimitive({
    name,
    options: {
      open: "boolean",
      defaultOpen: "boolean",
      onOpenChange: "callback",
      modal: "value",
      presentation: "string",
      dismissible: "boolean",
    },
    state: (options: Options) => popupState(options),
    sync: (options) =>
      options.open === undefined ? {} : { open: options.open },
    api: (context) => createPopup(context, { preset }),
    slots: (slot) => popupSlots(slot),
  })

const untitled = `<div>
  <trigger>Rename</trigger>
  <content><button>Save</button><close>Cancel</close></content>
  <button>After</button>
</div>`

// What a popup presenting as a sheet shows, read before its sheet's module
// loads, which needs layout jsdom doesn't have.
function asSheet(preset: PopupPreset) {
  const view = open(preset, { presentation: "sheet" })
  const shown = {
    presentation: view.state.presentation,
    modal: view.state.modal,
    attribute: view.part("content")!.getAttribute("data-presentation"),
  }
  mounts.splice(mounts.indexOf(view), 1)
  view.unmount()
  return shown
}

function open(preset: PopupPreset, options: Options = {}, markup = untitled) {
  const reasons: string[] = []
  const view = mount(
    popupOn(preset),
    {
      ...options,
      onOpenChange: (_open, details) => reasons.push(details.reason),
    },
    markup
  )
  mounts.push(view)
  view.api.setOpen(true)
  return Object.assign(view, { reasons })
}

// Parts bind in a microtask, and a title a microtask after the content.
const settle = () => new Promise((done) => setTimeout(done))

async function resetOnOpen(preset: PopupPreset, name: string) {
  const view = mount(popupOn(preset, name), {}, untitled)
  mounts.push(view)
  view.api.setOpen(true)
  await settle()
  return document.getElementById("ui-sdk-popover-reset")?.textContent ?? ""
}

const naming = (el: HTMLElement) => ({
  role: el.getAttribute("role"),
  labelledby: el.getAttribute("aria-labelledby"),
  label: el.getAttribute("aria-label"),
  modal: el.getAttribute("aria-modal"),
})

describe("popoverPreset", () => {
  test("opens on a press as a non-modal dialog named by its trigger", async () => {
    const view = mount(popupOn(popoverPreset), {}, untitled)
    mounts.push(view)
    await view.click(view.part("trigger")!)
    await settle()
    expect(view.state.open).toBe(true)
    expect(naming(view.part("content")!)).toEqual({
      role: "dialog",
      labelledby: view.part("trigger")!.id,
      label: null,
      modal: null,
    })
  })

  test("is placed beside its trigger", async () => {
    const view = open(popoverPreset)
    await settle()
    expect(view.part("content")!.hasAttribute("data-side")).toBe(true)
  })

  test("undoes the browser's popover styles, so an arrow outside it isn't clipped", async () => {
    const reset = await resetOnOpen(popoverPreset, "own-popover")
    expect(reset).toContain('[data-slot="own-popover-content"][popover]')
    expect(reset).toContain("overflow: visible")
  })
})

// Their content is usually what scrolls, with the browser's `overflow: auto`.
describe.each([
  ["selectPreset", selectPreset],
  ["comboboxPreset", comboboxPreset],
  ["datePickerPreset", datePickerPreset],
  ["menuPreset", menuPreset],
])("%s", (name, preset) => {
  test("keeps the browser's popover styles", async () => {
    const slot = `own-${name.toLowerCase()}`
    expect(await resetOnOpen(preset, slot)).not.toContain(
      `[data-slot="${slot}-content"]`
    )
  })
})

describe("dialogPreset", () => {
  test("names and marks an untitled dialog the way Dialog does", async () => {
    // One at a time: an open modal dialog makes the other's trigger inert.
    const namingOnPress = async (view: {
      click: (el: Element) => Promise<unknown>
      part: (slot: "trigger" | "content") => HTMLElement | undefined
      unmount: () => void
    }) => {
      await view.click(view.part("trigger")!)
      await settle()
      const named = naming(view.part("content")!)
      view.unmount()
      return named
    }
    const own = await namingOnPress(mount(popupOn(dialogPreset), {}, untitled))
    expect(own).toEqual({
      role: "dialog",
      labelledby: null,
      label: "Rename",
      modal: "true",
    })
    expect(own).toEqual(await namingOnPress(mount(dialog, {}, untitled)))
  })

  test("a title names it", async () => {
    const view = open(
      dialogPreset,
      {},
      `<div><trigger>Rename</trigger><content><title>Rename file</title></content></div>`
    )
    await settle()
    expect(view.part("content")!.getAttribute("aria-labelledby")).toBe(
      view.part("title")!.id
    )
    expect(view.part("content")!.hasAttribute("aria-label")).toBe(false)
  })

  test("one that only traps focus isn't marked modal, since the page stays usable", async () => {
    const view = open(dialogPreset, { modal: "trap-focus" })
    await settle()
    expect(view.state.modal).toBe("trap-focus")
    expect(view.part("content")!.hasAttribute("aria-modal")).toBe(false)
  })

  test("refuses dismissals while it isn't dismissible", async () => {
    const view = open(dialogPreset, { dismissible: false })
    await settle()
    await view.keys("Escape")
    expect(view.state.open).toBe(true)
    view.api.close()
    expect(view.state.open).toBe(false)
  })

  test("presents as a sheet", () => {
    expect(asSheet(dialogPreset)).toMatchObject({
      presentation: "sheet",
      attribute: "sheet",
    })
  })
})

describe("alertDialogPreset", () => {
  test("is an alert dialog named after its trigger, and leaves `modal` to its primitive", async () => {
    const view = open(alertDialogPreset)
    await settle()
    expect(view.state.modal).toBe(false)
    expect(naming(view.part("content")!)).toEqual({
      role: "alertdialog",
      labelledby: null,
      label: "Rename",
      modal: null,
    })
  })

  test("never presents as a sheet", () => {
    const view = open(alertDialogPreset, { presentation: "sheet" })
    expect(view.state.presentation).toBe("popover")
    expect(view.part("content")!.hasAttribute("data-presentation")).toBe(false)
  })
})

describe("drawerPreset", () => {
  test("leaves `modal` to its primitive and is named after its trigger", async () => {
    const view = open(drawerPreset)
    await settle()
    expect(view.state.modal).toBe(false)
    expect(view.part("content")!.getAttribute("aria-label")).toBe("Rename")
  })
})

// Tab from a button inside the open popup.
async function tabFromInside(view: ReturnType<typeof open>) {
  await settle()
  view.part("content")!.querySelector("button")!.focus()
  await view.keys("Tab")
}

describe("menuPreset", () => {
  test("is a menu that Tab closes, and keeps `modal` to its primitive", async () => {
    const view = open(menuPreset)
    expect(view.part("content")!.getAttribute("role")).toBe("menu")
    expect(view.state.modal).toBe(false)
    await tabFromInside(view)
    expect(view.state.open).toBe(false)
    expect(view.reasons.at(-1)).toBe("focus-out")
  })

  test("hands the content a controller's payload", () => {
    const view = mount(popupOn(menuPreset), {}, untitled)
    mounts.push(view)
    view.api.open({ payload: { row: 3 } })
    expect(view.state.payload).toEqual({ row: 3 })
  })

  test("presents as a sheet", () => {
    expect(asSheet(menuPreset).presentation).toBe("sheet")
  })
})

describe("selectPreset", () => {
  test("is modal to the pointer, and Tab closes it", async () => {
    const view = open(selectPreset)
    expect(view.state.modal).toBe("pointer")
    await tabFromInside(view)
    expect(view.state.open).toBe(false)
  })

  test("is modal as a sheet", () => {
    expect(asSheet(selectPreset)).toMatchObject({
      presentation: "sheet",
      modal: true,
    })
  })
})

describe("comboboxPreset", () => {
  test("isn't modal, and leaves Tab to the browser", async () => {
    const view = open(comboboxPreset)
    expect(view.state.modal).toBe(false)
    await tabFromInside(view)
    expect(view.state.open).toBe(true)
  })
})

describe("datePickerPreset", () => {
  test("is never modal, even as a sheet", () => {
    expect(asSheet(datePickerPreset)).toMatchObject({
      presentation: "sheet",
      modal: false,
    })
  })

  test("leaves opening to its component, so a trigger press doesn't open it", async () => {
    const view = mount(popupOn(datePickerPreset), {}, untitled)
    mounts.push(view)
    await view.click(view.part("trigger")!)
    expect(view.state.open).toBe(false)
  })
})

describe("triggerMenuPreset", () => {
  test("never presents as a sheet, and leaves Tab to the browser", async () => {
    const view = open(triggerMenuPreset, { presentation: "sheet" })
    expect(view.state.presentation).toBe("popover")
    await tabFromInside(view)
    expect(view.state.open).toBe(true)
  })
})
