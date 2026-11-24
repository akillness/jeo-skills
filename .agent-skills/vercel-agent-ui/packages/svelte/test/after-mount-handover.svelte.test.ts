// Options changed after mount land without writing state while they're handed
// over: the setup fails a test that does.
import { flushSync, mount, unmount } from "svelte"
import { afterEach, test } from "vitest"
import App from "./apps/after-mount-handover-app.svelte"

// jsdom has no ResizeObserver, which the scroll area measures with.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never

let app: ReturnType<typeof mount> | undefined
afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  document.body.replaceChildren()
})

function render() {
  const props = $state({
    side: "bottom" as "bottom" | "right",
    stickToEnd: true,
  })
  app = mount(App, { target: document.body, props })
  flushSync()
  return props
}

test("an open drawer moved to another side", async () => {
  const props = render()
  await Promise.resolve()
  props.side = "right"
  flushSync()
  await Promise.resolve()
})

test("a scroll area that stops sticking to its end", async () => {
  const props = render()
  await Promise.resolve()
  props.stickToEnd = false
  flushSync()
  await Promise.resolve()
})
