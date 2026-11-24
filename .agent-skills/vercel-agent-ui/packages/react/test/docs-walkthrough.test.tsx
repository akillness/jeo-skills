// @vitest-environment jsdom
// The "Compose behaviors" docs page, run as written: its files are extracted
// from the page and React's Rendering page, its own tests run, and the React
// component is rendered.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, expect, test } from "vitest"

const docs = path.resolve(
  import.meta.dirname,
  "../../../apps/docs/content/docs"
)
const page = ["core/compose-behaviors.mdx", "react/rendering.mdx"]
  .map((file) => readFileSync(path.join(docs, file), "utf8"))
  .join("\n")
const dir = path.join(import.meta.dirname, ".walkthrough")
mkdirSync(dir, { recursive: true })

// Each file is a code block whose first line names it, like `// rating.ts`.
function extract(name: string, as = name) {
  const block = [...page.matchAll(/```\w+\n([\s\S]*?)```/g)].find((match) =>
    match[1].startsWith(`// ${name}\n`)
  )
  if (!block) {
    throw new Error(`The page has no ${name}`)
  }
  writeFileSync(
    path.join(dir, as),
    block[1].replace('"@ui-sdk/react/primitive"', '"../../src/primitive"')
  )
}

extract("rating.ts")
extract("rating-react.tsx")
// Not named like a test, so only this file runs it.
extract("rating.test.ts", "rating-test.ts")
// Paths built at runtime, since the files exist only once extracted.
const load = (file: string) => import(/* @vite-ignore */ path.join(dir, file))
await load("rating-test.ts")
const { Rating } = (await load("rating-react.tsx")) as {
  Rating: React.ComponentType<{
    defaultValue?: number
    max?: number
    "aria-label"?: string
    onValueChange?: (value: number, details: { reason: string }) => void
  }>
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

async function render(element: React.ReactElement) {
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await React.act(async () => root!.render(element))
  return [...container.querySelectorAll("button")]
}

test("the React rating renders a radio group with one tab stop on the server", () => {
  const html = renderToString(
    <Rating defaultValue={2} max={3} aria-label="Rating" />
  )
  expect(html).toContain('role="radiogroup"')
  expect(html.match(/tabindex="0"/g)).toHaveLength(1)
  expect(html).toContain('aria-label="2 stars"')
})

test("all four arrows check, focus and wrap, and a click checks one", async () => {
  const changes: [number, string][] = []
  const stars = await render(
    <Rating
      defaultValue={3}
      aria-label="Rating"
      onValueChange={(value, { reason }) => changes.push([value, reason])}
    />
  )
  stars[2].focus()
  for (const [key, value] of [
    ["ArrowRight", 4],
    ["ArrowDown", 5],
    ["ArrowDown", 1],
    ["ArrowUp", 5],
    ["ArrowLeft", 4],
  ] as const) {
    await React.act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true })
      )
    )
    expect(document.activeElement).toBe(stars[value - 1])
    expect(stars[value - 1].getAttribute("aria-checked")).toBe("true")
    expect(stars.map((star) => star.tabIndex)).toEqual(
      stars.map((_, index) => (index === value - 1 ? 0 : -1))
    )
  }
  await React.act(async () => stars[0].click())
  expect(changes).toEqual([
    [4, "list-navigation"],
    [5, "list-navigation"],
    [1, "list-navigation"],
    [5, "list-navigation"],
    [4, "list-navigation"],
    [1, "item-press"],
  ])
  expect(stars.map((star) => star.tabIndex)).toEqual([0, -1, -1, -1, -1])
  expect(stars.map((star) => star.hasAttribute("data-filled"))).toEqual([
    true,
    false,
    false,
    false,
    false,
  ])
})
