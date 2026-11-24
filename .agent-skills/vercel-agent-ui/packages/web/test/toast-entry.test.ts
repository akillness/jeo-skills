// A page without a bundler imports `toast()` from the toast entry, like
// `@ui-sdk/react/toast`, since the CDN's `web.js` exports nothing.
import { expect, test } from "vitest"
import * as root from "../src/index"
import * as entry from "../src/entries/toast"

test("the toast entry exports the helpers the package root does", () => {
  expect(entry.toast).toBe(root.toast)
  expect(entry.createToaster).toBe(root.createToaster)
})
