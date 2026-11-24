// @vitest-environment jsdom
// A select's trigger is named after its label from the server's HTML on,
// before the label binds, and drops the reference once it's clear there's no label.
import { expect, test } from "vitest"
import { select } from "../src/components/select/select"
import { bind } from "../src/foundation/kernel/part"
import { partAttrs } from "../src/testing"

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test("the trigger points at its label before anything binds", () => {
  const instance = select({ id: "priority" })
  expect(partAttrs(instance.part("trigger"))["aria-labelledby"]).toBe(
    "priority-label"
  )
})

test("a trigger bound with its label keeps the reference", async () => {
  const instance = select({ id: "priority" })
  const label = document.body.appendChild(document.createElement("div"))
  const trigger = document.body.appendChild(document.createElement("button"))
  const unbind = [
    bind(instance.part("label"), label),
    bind(instance.part("trigger"), trigger),
  ]
  await settle()
  expect(partAttrs(instance.part("trigger"))["aria-labelledby"]).toBe(
    "priority-label"
  )
  unbind.forEach((off) => off())
})

test("a trigger bound without a label drops the reference", async () => {
  const instance = select({ id: "priority" })
  const trigger = document.body.appendChild(document.createElement("button"))
  const unbind = bind(instance.part("trigger"), trigger)
  await settle()
  expect(partAttrs(instance.part("trigger"))["aria-labelledby"]).toBeUndefined()
  unbind()
})
