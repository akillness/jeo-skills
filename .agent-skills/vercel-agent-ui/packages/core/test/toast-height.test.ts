// @vitest-environment jsdom
import { expect, test } from "vitest"
import { writeHeight } from "../src/components/toast/toast-dom"

test("a height that couldn't be measured leaves its variable unset", () => {
  const toast = document.createElement("li")
  writeHeight(toast, "--toast-height", 40)
  expect(toast.style.getPropertyValue("--toast-height")).toBe("40px")
  writeHeight(toast, "--toast-height", NaN)
  expect(toast.style.getPropertyValue("--toast-height")).toBe("")
})
