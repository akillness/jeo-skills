import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/select-app.svelte"

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

// Focus returning to the trigger keeps the list in the page hidden, which
// brings the content back before Svelte removes it.
test("a select closed by its trigger reports its close complete", async () => {
  const completed: boolean[] = []
  const target = document.body.appendChild(document.createElement("div"))
  const app = mount(App, {
    target,
    props: { onOpenChangeComplete: (open: boolean) => completed.push(open) },
  })
  try {
    flushSync()
    const trigger = target.querySelector("button")!
    trigger.click()
    await until(() => completed.length === 1)
    trigger.click()
    await until(() => completed.length === 2)
    expect({
      completed,
      expanded: trigger.getAttribute("aria-expanded"),
    }).toEqual({
      completed: [true, false],
      expanded: "false",
    })
  } finally {
    unmount(app)
    target.remove()
  }
})
