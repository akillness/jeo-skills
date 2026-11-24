import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const css = readFileSync(
  new URL("../src/web.css", import.meta.url),
  "utf8"
).replace(/\/\*[\s\S]*?\*\//g, "")

// Each rule's selector with the selectors of the rules around it.
function rules() {
  const found: { selector: string; outer: string[] }[] = []
  const stack: string[] = []
  let start = 0
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      const selector = css.slice(start, i).split(";").at(-1)!.trim()
      found.push({ selector, outer: [...stack] })
      stack.push(selector)
      start = i + 1
    } else if (css[i] === "}") {
      stack.pop()
      start = i + 1
    } else if (css[i] === ";") {
      start = i + 1
    }
  }
  return found
}

// Chrome checks a `:has()` before a descendant combinator on every ancestor up
// to the root, and from then on restyles the whole page on any insertion. A
// `:has()` that can match the root is only followed by `>`.
test("a :has() that can match the root is never followed by a descendant combinator", () => {
  const offending = rules().filter(
    ({ selector, outer }) =>
      outer.some((parent) =>
        parent
          .split(/,(?![^(]*\))/)
          .some((part) => /^\s*(?::not\([^()]*\))*:has\(/.test(part))
      ) &&
      selector.split(/,(?![^(]*\))/).some((part) => /^\s*&\s+[^>\s]/.test(part))
  )
  expect(offending.map(({ selector }) => selector)).toEqual([])
})
