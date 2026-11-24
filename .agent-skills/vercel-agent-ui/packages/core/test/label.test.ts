// @vitest-environment jsdom
import { expect, test } from "vitest"
import { label } from "../src/components/label/label"
import { attrs, bind } from "../src/foundation/kernel/part"

test("a label renders an id, which a control it names points at", () => {
  expect(attrs(label({ id: "l" }).part("root"))).toEqual({
    "data-slot": "label",
    id: "l",
  })
})

test("a native label around a group names it, and leaves a native control to the browser", async () => {
  document.body.innerHTML = `<label id="plan">Plan <div role="radiogroup"></div></label>
    <label id="terms">Terms <input type="checkbox"></label>`
  const [plan, terms] = Array.from(document.querySelectorAll("label"))
  const unbind = [
    bind(label({ id: "plan" }).part("root"), plan),
    bind(label({ id: "terms" }).part("root"), terms),
  ]
  await Promise.resolve()
  expect(
    plan.querySelector("[role=radiogroup]")!.getAttribute("aria-labelledby")
  ).toBe("plan")
  expect(terms.querySelector("input")!.hasAttribute("aria-labelledby")).toBe(
    false
  )
  unbind.forEach((each) => each())
})

test("a label stops naming a control its author names, or that stops being the one it's for", async () => {
  document.body.innerHTML = `<span id="plan" for="plans">Plan</span><div id="plans" role="radiogroup"></div>`
  const group = document.querySelector<HTMLElement>("[role=radiogroup]")!
  const unbind = bind(
    label({ id: "plan" }).part("root"),
    document.getElementById("plan")!
  )
  const settle = () => new Promise((resolve) => setTimeout(resolve))
  await settle()
  expect(group.getAttribute("aria-labelledby")).toBe("plan")
  group.setAttribute("aria-label", "Billing plan")
  await settle()
  expect(group.hasAttribute("aria-labelledby")).toBe(false)
  group.removeAttribute("aria-label")
  await settle()
  expect(group.getAttribute("aria-labelledby")).toBe("plan")
  group.id = "other"
  await settle()
  expect(group.hasAttribute("aria-labelledby")).toBe(false)
  unbind()
})

test("a label names its control again once the control's id or role comes back", async () => {
  document.body.innerHTML = `<span id="plan" for="plans">Plan</span><div id="plans" role="radiogroup"></div>`
  const group = document.querySelector<HTMLElement>("[role=radiogroup]")!
  const unbind = bind(
    label({ id: "plan" }).part("root"),
    document.getElementById("plan")!
  )
  const settle = () => new Promise((resolve) => setTimeout(resolve))
  await settle()
  group.id = "other"
  await settle()
  group.id = "plans"
  await settle()
  expect(group.getAttribute("aria-labelledby")).toBe("plan")
  group.removeAttribute("role")
  await settle()
  expect(group.hasAttribute("aria-labelledby")).toBe(false)
  group.setAttribute("role", "radiogroup")
  await settle()
  expect(group.getAttribute("aria-labelledby")).toBe("plan")
  unbind()
})
