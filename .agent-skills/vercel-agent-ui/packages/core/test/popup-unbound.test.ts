import { expect, test, vi } from "vitest"

// A browser where the popup's content hasn't bound an element yet.
const frames: (() => void)[] = []
vi.stubGlobal("window", globalThis)
vi.stubGlobal("document", { activeElement: null, body: {} })
vi.stubGlobal("requestAnimationFrame", (run: () => void) => frames.push(run))

const { createPopupLayer, modalTriple } =
  await import("../src/foundation/popups/popup")
const { createStore } = await import("../src/foundation/kernel/store")

function openPopup(id: string) {
  const completed: boolean[] = []
  const store = createStore({ open: false, mounted: false }, [])
  createPopupLayer({
    preset: "popover",
    owner: { component: "popover", id },
    store,
    trigger: () => undefined,
    close: () => {},
    modal: () => modalTriple(false),
    tab: "flow",
    onOpenChangeComplete: (open) => completed.push(open),
  })
  return { store, completed }
}

// Content that binds late, like a lazy chunk or an async component, still
// animates in, and only then has the popup opened.
test("a popup whose content hasn't bound yet waits for it, past the next frame", () => {
  const { store, completed } = openPopup("late")
  store.set({ open: true })
  frames.splice(0).forEach((run) => run())
  expect(completed).toEqual([])
})
