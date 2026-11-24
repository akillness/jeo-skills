// The package's index exports every controller a component entry exports, so
// code that drives a component imports it from one place.
import { readdirSync, readFileSync } from "node:fs"
import { expect, test } from "vitest"
import * as index from "../src/index"

const entries = new URL("../src/entries/", import.meta.url)
const controllers = readdirSync(entries)
  .flatMap(
    (file) =>
      readFileSync(new URL(file, entries), "utf8").match(
        /\bcreate[A-Z]\w*Controller\b/g
      ) ?? []
  )
  .filter((name, at, all) => all.indexOf(name) === at)
  .sort()

test("the index exports every component's controller", () => {
  expect(controllers.length).toBeGreaterThan(30)
  expect(
    controllers.filter(
      (name) => typeof (index as Record<string, unknown>)[name] !== "function"
    )
  ).toEqual([])
})
