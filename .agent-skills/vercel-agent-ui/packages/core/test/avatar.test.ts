import { describe, expect, test } from "vitest"
import { avatar } from "../src/components/avatar/avatar"
import { imageStatus } from "../src/components/avatar/image-status"
import { attrs, present } from "../src/foundation/kernel/part"

describe("avatar", () => {
  test("reads an image's status without waiting for an event", () => {
    expect(imageStatus({ complete: true, naturalWidth: 64 }, true)).toBe(
      "loaded"
    )
    expect(imageStatus({ complete: true, naturalWidth: 0 }, true)).toBe("error")
    expect(imageStatus({ complete: false, naturalWidth: 0 }, true)).toBe(
      "loading"
    )
    expect(imageStatus({ complete: true, naturalWidth: 0 }, false)).toBe(
      "error"
    )
  })

  test("renders the fallback and a hidden image until the image loads", () => {
    const instance = avatar({ id: "a" })
    expect(present(instance.part("fallback", {}))).toBe(true)
    expect(attrs(instance.part("image"))).toMatchObject({
      "aria-hidden": "true",
    })
    expect(attrs(instance.part("image")).style).toContain("opacity:0")
    expect(attrs(instance.part("root"))["data-loading-status"]).toBe("idle")
  })

  test("a fallback with a delay isn't rendered at first, server markup included", () => {
    expect(present(avatar({ id: "a" }).part("fallback", { delay: 600 }))).toBe(
      false
    )
  })
})
