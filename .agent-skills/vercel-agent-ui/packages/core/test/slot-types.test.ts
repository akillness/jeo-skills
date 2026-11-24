import { expect, test } from "vitest"
import type { SlotName } from "../src/index"
import { menu } from "../src/components/menu/menu"
import { tabs } from "../src/components/tabs/tabs"

// Slot names are typed, so a typo fails to compile, and a feature's slots
// count once the primitive lists its features.
test("slot names are typed, features included", () => {
  const names: SlotName<typeof tabs>[] = ["root", "list", "tab", "panel"]
  // @ts-expect-error Not a slot of tabs.
  const typo: SlotName<typeof tabs> = "tabb"
  const instance = menu({ id: "m" })
  instance.part("checkbox-item", { value: "bold" })
  // @ts-expect-error Not a slot of menu.
  instance.part("checkbox-itme")
  expect([...names, typo]).toHaveLength(5)
})
