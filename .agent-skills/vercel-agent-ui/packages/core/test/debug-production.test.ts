import { expect, test, vi } from "vitest"

const settle = () => new Promise((resolve) => setTimeout(resolve))

// Its own file, since loading the production modules resets the ones other tests share.
test("in a production build, a button's debug logs nothing", async () => {
  vi.resetModules()
  vi.doMock(
    "../src/foundation/kernel/dev",
    () => import("../src/foundation/kernel/dev-stub")
  )
  const { button: productionButton } =
    await import("../src/components/button/button")
  vi.doUnmock("../src/foundation/kernel/dev")
  const log = vi.spyOn(console, "debug").mockImplementation(() => {})
  const instance = productionButton({
    id: "b",
    debug: true,
    action: () => Promise.resolve(),
  })
  instance.api.internal.press()
  await settle()
  expect(log).not.toHaveBeenCalled()
})
