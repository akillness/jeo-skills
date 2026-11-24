import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/close-by-prop-app.svelte"

// jsdom has no top layer.
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

// Renders until `done` holds, like an open that completes a frame and a task after it shows.
async function until(done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    flushSync()
  }
}
// A select keeps its list in the page hidden once it closes, so typing on the trigger finds its items.
const shownContent = () =>
  document.querySelectorAll('[data-slot$="-content"]:not([hidden])').length

let target: HTMLElement
let app: ReturnType<typeof mount> & { setOpen: (open: boolean) => void }
afterEach(() => {
  unmount(app)
  target.remove()
})

// The setup fails any of these that writes state while the options are handed over.
for (const kind of ["autocomplete", "combobox", "menu", "popover", "select"]) {
  for (const bound of [true, false]) {
    test(`${kind} closed by its parent through ${bound ? "bind:open" : "open"} leaves the page and reports it`, async () => {
      const completed: boolean[] = []
      target = document.body.appendChild(document.createElement("div"))
      app = mount(App, {
        target,
        props: {
          kind,
          bound,
          onOpenChangeComplete: (open: boolean) => completed.push(open),
        },
      })
      flushSync()
      app.setOpen(true)
      await until(() => completed.length === 1)
      const opened = shownContent()
      app.setOpen(false)
      await until(() => completed.length === 2)
      expect({ opened, closed: shownContent(), completed }).toEqual({
        opened: 1,
        closed: 0,
        completed: [true, false],
      })
    })
  }
}
