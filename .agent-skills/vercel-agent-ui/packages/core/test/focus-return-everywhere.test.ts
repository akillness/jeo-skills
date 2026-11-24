// @vitest-environment jsdom
// Every popup that moves focus gives it back the same way, whichever opened
// it and whatever happened to its trigger meanwhile.
import { afterEach, describe, expect, test } from "vitest"
import { alertDialog } from "../src/components/dialog/alert-dialog"
import { datePicker } from "../src/components/date-picker/date-picker"
import { dialog } from "../src/components/dialog/dialog"
import { drawer } from "../src/components/drawer/drawer"
import { menu } from "../src/components/menu/menu"
import { popover } from "../src/components/popover/popover"
import { select } from "../src/components/select/select"
import { mount } from "../src/testing/mount"

type Opening = { defaultOpen?: boolean }
type View = Pick<
  ReturnType<typeof mount<typeof dialog>>,
  "root" | "keys" | "click" | "settle" | "unmount"
> & {
  api: { setOpen: (open: boolean) => void }
  state: { open: boolean }
  part: (slot: "trigger") => HTMLElement | undefined
}
type PopupCase = {
  name: string
  trigger: string
  mount: (options: Opening) => View
}

const markup = (trigger: string, content: string, viewport = false) => {
  const popup = `<content>${content}</content>`
  return `<div><button>Before</button><trigger>${trigger}</trigger>${viewport ? `<viewport>${popup}</viewport>` : popup}<button>After</button></div>`
}

const popups: PopupCase[] = [
  {
    name: "popover",
    trigger: "Share",
    mount: (options) =>
      mount(popover, options, markup("Share", `<button>Copy link</button>`)),
  },
  {
    name: "dialog",
    trigger: "Rename",
    mount: (options) =>
      mount(
        dialog,
        options,
        markup(
          "Rename",
          `<title>Rename</title><button>Save</button><close>Cancel</close>`
        )
      ),
  },
  {
    name: "alert dialog",
    trigger: "Delete",
    mount: (options) =>
      mount(
        alertDialog,
        options,
        markup("Delete", `<title>Delete?</title><close>Cancel</close>`)
      ),
  },
  {
    name: "drawer",
    trigger: "Filters",
    mount: (options) =>
      mount(
        drawer,
        options,
        markup("Filters", `<title>Filters</title><close>Done</close>`, true)
      ),
  },
  {
    name: "menu",
    trigger: "Actions",
    mount: (options) =>
      mount(menu, options, markup("Actions", `<item value="copy">Copy</item>`)),
  },
  {
    name: "select",
    trigger: "Fruit",
    mount: (options) =>
      mount(
        select,
        options,
        markup("Fruit", `<list><item value="apple">Apple</item></list>`)
      ),
  },
  {
    name: "date picker",
    trigger: "Pick a date",
    mount: (options) =>
      mount(datePicker, options, markup("Pick a date", `<grid></grid>`)),
  },
]

// Drawer measures itself, which a DOM made for tests can't.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const unmounts: (() => void)[] = []
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount())
  document.body.replaceChildren()
})

function mountPopup(popup: PopupCase, options: Opening = {}) {
  const view = popup.mount(options)
  unmounts.push(view.unmount)
  const button = (text: string) =>
    [...view.root.querySelectorAll<HTMLElement>("button")].find(
      (el) => el.textContent === text
    )!
  const isOpen = () => view.state.open
  return {
    view,
    api: view.api,
    button,
    isOpen,
    trigger: () => view.part("trigger")!,
  }
}

function mountNext(name: string) {
  const view = mount(
    dialog,
    {},
    `<div><content><title>${name}</title><close>Close ${name}</close></content></div>`
  )
  unmounts.push(view.unmount)
  return view
}

function focusElsewhere() {
  const elsewhere = document.body.appendChild(
    Object.assign(document.createElement("button"), {
      textContent: "Elsewhere",
    })
  )
  elsewhere.focus()
  return elsewhere
}

const focused = () => document.activeElement?.textContent

describe.each(popups)("$name", (popup) => {
  test("Escape gives focus back to the trigger a key opened it from", async () => {
    const { view, trigger, isOpen } = mountPopup(popup)
    trigger().focus()
    await view.keys("Enter")
    expect(isOpen()).toBe(true)
    await view.keys("Escape")
    expect(isOpen()).toBe(false)
    expect(focused()).toBe(popup.trigger)
  })

  test("Escape gives focus back to the trigger a press opened it from", async () => {
    const { view, trigger, isOpen } = mountPopup(popup)
    await view.click(trigger())
    expect(isOpen()).toBe(true)
    await view.keys("Escape")
    expect(focused()).toBe(popup.trigger)
  })

  test("closing after its trigger left the page gives focus to what came after it", async () => {
    const { view, trigger, isOpen } = mountPopup(popup)
    trigger().focus()
    await view.keys("Enter")
    trigger().remove()
    await view.keys("Escape")
    expect(isOpen()).toBe(false)
    expect(focused()).toBe("After")
  })

  test("opened from code, closing gives focus back to what had it", async () => {
    const { view, api, button, isOpen } = mountPopup(popup)
    button("Before").focus()
    api.setOpen(true)
    await view.settle()
    expect(isOpen()).toBe(true)
    await view.keys("Escape")
    expect(focused()).toBe("Before")
  })

  test("open from the start, closing gives focus back to what had it", async () => {
    const before = document.body.appendChild(
      Object.assign(document.createElement("button"), {
        textContent: "Elsewhere",
      })
    )
    before.focus()
    const { view, api, isOpen } = mountPopup(popup, { defaultOpen: true })
    await view.settle()
    expect(isOpen()).toBe(true)
    api.setOpen(false)
    await view.settle()
    expect(focused()).toBe("Elsewhere")
  })

  test("closing from code while focus is outside it leaves focus alone", async () => {
    const { view, api, button, trigger, isOpen } = mountPopup(popup)
    trigger().focus()
    await view.keys("Enter")
    expect(isOpen()).toBe(true)
    button("After").focus()
    api.setOpen(false)
    await view.settle()
    expect(focused()).toBe("After")
  })
})

// Opened without its trigger, a popup's focus goes back to what had it, even
// through the dialogs it opens: one that outlives it returns there in its place.
describe.each(popups)("$name opened without its trigger", (popup) => {
  test.each(["from the start", "from code"])(
    "opened %s, it hands what had focus to the next dialog",
    async (how) => {
      const elsewhere = focusElsewhere()
      const { view, api, isOpen } = mountPopup(
        popup,
        how === "from the start" ? { defaultOpen: true } : {}
      )
      if (how === "from code") {
        api.setOpen(true)
      }
      await view.settle()
      expect(isOpen()).toBe(true)
      const next = mountNext("Next")
      next.api.setOpen(true)
      await next.settle()
      api.setOpen(false)
      await view.settle()
      await next.keys("Escape")
      await next.settle()
      expect(document.activeElement).toBe(elsewhere)
    }
  )
})

test.each(["from the start", "from code"])(
  "a dialog opened %s hands what had focus on through two dialogs that outlive it",
  async (how) => {
    const elsewhere = focusElsewhere()
    const first = mountPopup(
      popups.find((popup) => popup.name === "dialog")!,
      how === "from the start" ? { defaultOpen: true } : {}
    )
    if (how === "from code") {
      first.api.setOpen(true)
    }
    await first.view.settle()
    const second = mountNext("Second")
    second.api.setOpen(true)
    await second.settle()
    const third = mountNext("Third")
    third.api.setOpen(true)
    await third.settle()
    first.api.setOpen(false)
    await first.view.settle()
    second.api.setOpen(false)
    await second.settle()
    await third.keys("Escape")
    await third.settle()
    expect(document.activeElement).toBe(elsewhere)
  }
)

test("a popup its trigger opened still gives focus back to the trigger after an earlier open from the start", async () => {
  const popup = popups.find((entry) => entry.name === "dialog")!
  focusElsewhere()
  const { view, api, trigger } = mountPopup(popup, { defaultOpen: true })
  await view.settle()
  api.setOpen(false)
  await view.settle()
  await view.click(trigger())
  await view.keys("Escape")
  expect(document.activeElement).toBe(trigger())
})

// Safari doesn't focus a button a mouse presses, so focus stays where it was.
describe.each(popups)(
  "$name opened by a press that leaves focus elsewhere",
  (popup) => {
    test.each([false, true])(
      "gives focus to its trigger, after an open from the start: %s",
      async (first) => {
        const { view, api, button, trigger } = mountPopup(
          popup,
          first ? { defaultOpen: true } : {}
        )
        if (first) {
          await view.settle()
          api.setOpen(false)
          await view.settle()
        }
        button("Before").focus()
        trigger().addEventListener("mousedown", (event) =>
          event.preventDefault()
        )
        await view.click(trigger())
        await view.keys("Escape")
        expect(document.activeElement).toBe(trigger())
      }
    )
  }
)

// Reopened from a dialog it opened, each one leads back to the other.
test.each(["from the start", "from code"])(
  "a dialog opened %s and reopened from the dialog it opened still closes",
  async (how) => {
    focusElsewhere()
    const first = mountPopup(
      popups.find((popup) => popup.name === "dialog")!,
      how === "from the start" ? { defaultOpen: true } : {}
    )
    if (how === "from code") {
      first.api.setOpen(true)
    }
    await first.view.settle()
    const next = mountNext("Next")
    next.api.setOpen(true)
    await next.settle()
    first.api.setOpen(false)
    await first.view.settle()
    first.api.setOpen(true)
    await first.view.settle()
    first.api.setOpen(false)
    await first.view.settle()
    await next.keys("Escape")
    await next.settle()
    expect(first.isOpen()).toBe(false)
    expect(document.activeElement).not.toBe(document.body)
  }
)

test("the middle of three dialogs reopened from the last still closes", async () => {
  focusElsewhere()
  const first = mountPopup(
    popups.find((popup) => popup.name === "dialog")!,
    { defaultOpen: true }
  )
  await first.view.settle()
  const second = mountNext("Second")
  second.api.setOpen(true)
  await second.settle()
  const third = mountNext("Third")
  third.api.setOpen(true)
  await third.settle()
  second.api.setOpen(false)
  await second.settle()
  second.api.setOpen(true)
  await second.settle()
  second.api.setOpen(false)
  await second.settle()
  third.api.setOpen(false)
  await third.settle()
  first.api.setOpen(false)
  await first.view.settle()
  expect(second.state.open).toBe(false)
})

// What had focus can turn disabled or hidden while a dialog it opened is up.
describe.each(popups)(
  "$name handing focus on after what had it can't take it",
  (popup) => {
    test.each(["disabled", "hidden"])(
      "opened from code, its trigger takes focus when what had it is %s",
      async (how) => {
        const elsewhere = focusElsewhere()
        const { view, api, trigger } = mountPopup(popup)
        api.setOpen(true)
        await view.settle()
        const content = document.querySelector<HTMLElement>(
          `[data-slot$="-content"][data-open]`
        )
        const inside = content?.querySelector<HTMLElement>("button, [tabindex]")
        if (inside && !content!.contains(document.activeElement)) {
          inside.focus()
        }
        if (how === "disabled") {
          elsewhere.disabled = true
        } else {
          elsewhere.hidden = true
        }
        const next = mountNext("Next")
        next.api.setOpen(true)
        await next.settle()
        api.setOpen(false)
        await view.settle()
        await next.keys("Escape")
        await next.settle()
        expect(document.activeElement).toBe(trigger())
      }
    )
  }
)

// What had focus can stop taking it without looking disabled or hidden, like a
// div that loses its tabindex, so the next target gets a turn when focus fails.
describe.each(popups)(
  "$name handing focus on after what had it stops taking focus",
  (popup) => {
    test("opened from code, its trigger takes focus when what had it loses its tabindex", async () => {
      const holder = document.body.appendChild(
        Object.assign(document.createElement("div"), { tabIndex: 0 })
      )
      holder.focus()
      const { view, api, trigger } = mountPopup(popup)
      api.setOpen(true)
      await view.settle()
      const content = document.querySelector<HTMLElement>(
        `[data-slot$="-content"][data-open]`
      )
      const inside = content?.querySelector<HTMLElement>("button, [tabindex]")
      if (inside && !content!.contains(document.activeElement)) {
        inside.focus()
      }
      holder.removeAttribute("tabindex")
      const next = mountNext("Next")
      next.api.setOpen(true)
      await next.settle()
      api.setOpen(false)
      await view.settle()
      await next.keys("Escape")
      await next.settle()
      expect(document.activeElement).toBe(trigger())
    })
  }
)
