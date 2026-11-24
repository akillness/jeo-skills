// Turning `feed` on after mount numbers the articles without writing state
// while Svelte hands the options over, which the test setup fails on.
import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/timeline-feed-app.svelte"

test("a list turned into a feed after mount says where each article sits", async () => {
  const target = document.body.appendChild(document.createElement("div"))
  const props = $state({ feed: false })
  const app = mount(App, { target, props })
  flushSync()
  await new Promise((done) => setTimeout(done))
  props.feed = true
  flushSync()
  await new Promise((done) => setTimeout(done))
  const articles = target.querySelectorAll('[role="article"]')
  expect([...articles].map((el) => el.getAttribute("aria-posinset"))).toEqual([
    "1",
    "2",
  ])
  unmount(app)
  target.remove()
})
