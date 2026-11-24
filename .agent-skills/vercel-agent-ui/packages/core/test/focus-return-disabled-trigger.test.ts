// @vitest-environment jsdom
// A trigger disabled while its popup is open can't take focus back, so focus
// goes on to what follows it, as it does when the trigger left the page.
import { afterEach, describe, expect, test } from "vitest"
import { dialog } from "../src/components/dialog/dialog"
import { menu } from "../src/components/menu/menu"
import { popover } from "../src/components/popover/popover"
import { select } from "../src/components/select/select"
import { mount, rerenderOf } from "../src/testing/mount"

const unmounts: (() => void)[] = []
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount())
  document.body.replaceChildren()
})

const markup = (trigger: string, content: string) =>
  `<div><button>Before</button><trigger>${trigger}</trigger><content>${content}</content><button>After</button></div>`

const popups = [
  {
    name: "menu",
    mount: () =>
      mount(menu, {}, markup("Actions", `<item value="copy">Copy</item>`)),
  },
  {
    name: "popover",
    mount: () =>
      mount(popover, {}, markup("Share", `<button>Copy link</button>`)),
  },
  {
    name: "dialog",
    mount: () =>
      mount(
        dialog,
        {},
        markup("Rename", `<title>Rename</title><close>Cancel</close>`)
      ),
  },
]

describe.each(popups)("$name", (popup) => {
  test.each(["Escape", "a controlled close"])(
    "closed by %s after its trigger was disabled, focus goes to what follows the trigger",
    async (how) => {
      const view = popup.mount()
      unmounts.push(view.unmount)
      view.part("trigger")!.focus()
      await view.keys("Enter")
      expect(view.state.open).toBe(true)
      rerenderOf(view).setProps("trigger", "", { disabled: true })
      if (how === "Escape") {
        await view.keys("Escape")
      } else {
        rerenderOf(view).setOptions({ open: false })
        await view.settle()
      }
      expect(view.state.open).toBe(false)
      expect(document.activeElement?.textContent).toBe("After")
    }
  )
})

test("a select disabled while open gives focus to what follows its trigger when it closes", async () => {
  const view = mount(
    select,
    {},
    markup("Fruit", `<list><item value="apple">Apple</item></list>`)
  )
  unmounts.push(view.unmount)
  view.part("trigger")!.focus()
  await view.keys("Enter")
  expect(view.state.open).toBe(true)
  rerenderOf(view).setOptions({ disabled: true })
  await view.settle()
  await view.keys("Escape")
  expect(view.state.open).toBe(false)
  expect(document.activeElement?.textContent).toBe("After")
})
