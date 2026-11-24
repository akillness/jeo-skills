import { describe, expect, test } from "vitest"
import {
  alertDialog,
  createConfirm,
} from "../src/components/dialog/alert-dialog"
import { attachController } from "../src/foundation/kernel/controller"
import { press } from "../src/foundation/kernel/part"

describe("confirm with your own alert dialog", () => {
  function setup() {
    const confirm = createConfirm<{ name: string }>()
    const instance = alertDialog({ id: "a", controller: confirm.controller })
    attachController(confirm.controller, instance.api)
    return { confirm, instance }
  }

  test("a question asked while another is open waits for it, and gets its own answer", async () => {
    const { confirm, instance } = setup()
    const first = confirm({ name: "Acme" })
    const second = confirm({ name: "Globex" })
    expect(instance.get()).toMatchObject({
      open: true,
      payload: { name: "Acme" },
    })
    press(instance.part("close"))?.()
    expect(await first).toBe(false)
    await expect.poll(() => instance.get().open).toBe(true)
    expect(instance.get()).toMatchObject({ payload: { name: "Globex" } })
    press(instance.part("close", { value: "confirm" }))?.()
    expect(await second).toBe(true)
  })

  test("an idle alert dialog opens at once", async () => {
    const { confirm, instance } = setup()
    const first = confirm({ name: "Acme" })
    press(instance.part("close", { value: "confirm" }))?.()
    expect(await first).toBe(true)
    const second = confirm({ name: "Globex" })
    expect(instance.get()).toMatchObject({
      open: true,
      payload: { name: "Globex" },
    })
    press(instance.part("close"))?.()
    expect(await second).toBe(false)
  })
})
