// A controller kept in `$state`, so it can be swapped, stays the controller:
// Svelte's deep proxy would hide its methods until an instance attaches.
import { createToggleController } from "@ui-sdk/core/toggle"
import { expect, test } from "vitest"

test("$state keeps a controller as it is", () => {
  const controller = createToggleController()
  const held = $state({ controller })
  expect(held.controller).toBe(controller)
  expect(held.controller.isPressed()).toBe(undefined)
})
