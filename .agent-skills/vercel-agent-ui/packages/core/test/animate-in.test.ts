// @vitest-environment jsdom
import { expect, test, vi } from "vitest"
import { animateIn } from "../src/foundation/motion/presence"

const transition = (target: Element, transitionProperty = "opacity") =>
  ({
    transitionProperty,
    effect: { target },
    finish: vi.fn(),
  }) as unknown as Animation

test("an enter jumps the transitions its starting style starts, inside the element too", () => {
  const el = document.createElement("span")
  const path = el.appendChild(document.createElement("i"))
  const hover = transition(path, "color")
  const enter = transition(path)
  el.getAnimations = (options) =>
    !options?.subtree
      ? []
      : el.hasAttribute("data-starting-style")
        ? [hover, enter]
        : [hover]
  const stop = animateIn(el)
  expect(enter.finish).toHaveBeenCalledOnce()
  expect(hover.finish).not.toHaveBeenCalled()
  stop()
})

test("an enter leaves an element alone while a transition of its own runs", () => {
  const el = document.createElement("span")
  const leaving = transition(el)
  const back = transition(el)
  el.getAnimations = () =>
    el.hasAttribute("data-starting-style") ? [leaving, back] : [leaving]
  const stop = animateIn(el)
  expect(back.finish).not.toHaveBeenCalled()
  stop()
})

test("an enter lets a transition inside ease back from where its exit left it", () => {
  const el = document.createElement("span")
  const path = el.appendChild(document.createElement("i"))
  const leaving = transition(path)
  const back = transition(path)
  el.getAnimations = () =>
    el.hasAttribute("data-starting-style") ? [back] : [leaving]
  const stop = animateIn(el)
  expect(back.finish).not.toHaveBeenCalled()
  stop()
})
