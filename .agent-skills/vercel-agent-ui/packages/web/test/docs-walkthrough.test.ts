// @vitest-environment jsdom
// The "Compose behaviors" docs page's web components, rendered on the web
// components Rendering page, run as written.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "vitest"

const docs = path.resolve(
  import.meta.dirname,
  "../../../apps/docs/content/docs"
)
const page = ["core/compose-behaviors.mdx", "web-components/rendering.mdx"]
  .map((file) => readFileSync(path.join(docs, file), "utf8"))
  .join("\n")
const dir = path.join(import.meta.dirname, ".walkthrough")
mkdirSync(dir, { recursive: true })

// Each file is named by its fence title or its first comment.
function extract(name: string) {
  const block = [
    ...page.matchAll(/```\w+(?: title="([^"]+)")?\n([\s\S]*?)```/g),
  ]
    .reverse()
    .find((match) => match[1] === name || match[2].startsWith(`// ${name}\n`))
  if (!block) {
    throw new Error(`The page has no ${name}`)
  }
  writeFileSync(
    path.join(dir, name),
    block[2].replace('"@ui-sdk/web"', '"../../src/index"')
  )
}

extract("rating.ts")
extract("rating-web.ts")
// A path built at runtime, since the file exists only once extracted.
await import(/* @vite-ignore */ path.join(dir, "rating-web.ts"))

// The rating's markup.
const markup = page
  .split("## Render the Rating")[1]
  .match(/```html\n([\s\S]*?)```/)![1]
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("the web rating checks and wraps with all four arrows, and reports each change", async () => {
  document.body.innerHTML = markup
  await tick()
  const owner = document.querySelector("my-rating")!
  const stars = [...owner.querySelectorAll("button")]
  expect(owner.getAttribute("role")).toBe("radiogroup")
  expect(stars.map((star) => star.tabIndex)).toEqual([-1, -1, -1, 0, -1])

  const changes: [number, string][] = []
  owner.addEventListener("valuechange", (event) => {
    const { value, reason } = (
      event as CustomEvent<{ value: number; reason: string }>
    ).detail
    changes.push([value, reason])
  })
  stars[1].click()
  stars[1].focus()
  for (const [key, value] of [
    ["ArrowLeft", 1],
    ["ArrowUp", 5],
    ["ArrowDown", 1],
    ["ArrowRight", 2],
  ] as const) {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true })
    )
    await tick()
    expect(document.activeElement).toBe(stars[value - 1])
    expect(stars[value - 1].getAttribute("aria-checked")).toBe("true")
    expect(stars.map((star) => star.tabIndex)).toEqual(
      stars.map((_, index) => (index === value - 1 ? 0 : -1))
    )
  }
  expect(changes).toEqual([
    [2, "item-press"],
    [1, "list-navigation"],
    [5, "list-navigation"],
    [1, "list-navigation"],
    [2, "list-navigation"],
  ])
  expect(stars.map((star) => star.getAttribute("aria-checked"))).toEqual([
    "false",
    "true",
    "false",
    "false",
    "false",
  ])
})
