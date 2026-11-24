import { flushSync, mount, unmount } from "svelte"
import { afterAll, beforeAll, expect, test } from "vitest"
import App from "./apps/outro-app.svelte"

// jsdom has no Web Animations API. Svelte plays an outro as an animation for
// its delay, then one for its keyframes, which finish when the test says so.
const running: { onfinish: (() => void) | null }[] = []
const finishAnimations = () => {
  for (
    let animation = running.shift();
    animation;
    animation = running.shift()
  ) {
    animation.onfinish?.()
  }
}
beforeAll(() => {
  Element.prototype.animate = function () {
    const animation = {
      onfinish: null,
      cancel() {},
      currentTime: 0,
      playState: "running",
      effect: null,
    }
    running.push(animation)
    return animation as unknown as Animation
  }
})
afterAll(() => {
  delete (Element.prototype as Partial<Element>).animate
})

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  flushSync()
}

test("a popup reports its close complete once its Svelte outro ends", async () => {
  const completed: boolean[] = []
  const target = document.createElement("div")
  document.body.append(target)
  const app = mount(App, {
    target,
    props: { onOpenChangeComplete: (open: boolean) => completed.push(open) },
  })
  flushSync()
  const trigger = target.querySelector("button")!
  trigger.click()
  await settle()
  trigger.click()
  await settle()
  expect(document.querySelector('[aria-label="Panel"]')).not.toBeNull()
  expect(completed).not.toContain(false)
  finishAnimations()
  await settle()
  expect(document.querySelector('[aria-label="Panel"]')).toBeNull()
  expect(completed.at(-1)).toBe(false)
  unmount(app)
  target.remove()
})
