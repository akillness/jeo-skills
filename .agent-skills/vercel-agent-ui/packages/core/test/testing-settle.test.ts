// @vitest-environment jsdom
import { expect, test } from "vitest"
import { settle } from "../src/testing"

test("settle waits for a frame scheduled after an event", async () => {
  let ran = false
  requestAnimationFrame(() => (ran = true))
  await settle()
  expect(ran).toBe(true)
})
