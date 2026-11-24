// @vitest-environment jsdom
// A list of labels with a count of the rest reads in one language.
import { expect, onTestFinished, test } from "vitest"
import { formatLabels } from "../src/foundation/lists/listbox-value"

test("the default count, which is English, joins in English on a page in another language", () => {
  document.documentElement.lang = "es"
  onTestFinished(() => document.documentElement.removeAttribute("lang"))
  expect(
    formatLabels(["Apple", "Banana", "Orange", "Pear"], { maxLabels: 2 })
  ).toBe("Apple, Banana, and 2 more")
  expect(
    formatLabels(
      ["Apple", "Banana", "Pear"],
      {
        maxLabels: 2,
        getMoreLabel: (n) => `${n} más`,
      },
      "es"
    )
  ).toBe("Apple, Banana y 1 más")
})
