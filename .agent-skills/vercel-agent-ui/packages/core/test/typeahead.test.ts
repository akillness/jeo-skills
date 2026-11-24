import { describe, expect, test } from "vitest"
import { createTypeahead, normalize } from "../src/foundation/text/typeahead"

const type = (labels: string[], keys: string, current = -1) => {
  const search = createTypeahead()
  let index = current
  for (const key of keys) {
    const found = search(key, labels, index)
    if (found !== -1) {
      index = found
    }
  }
  return labels[index]
}

describe("typeahead", () => {
  test("matches ignoring case and accents", () => {
    expect(normalize("Éditer")).toBe("editer")
    expect(type(["Fichier", "Éditer"], "e")).toBe("Éditer")
  })

  test("matches non-Latin scripts", () => {
    expect(type(["Файл", "Журнал"], "ж")).toBe("Журнал")
  })

  test("a repeated letter cycles through matches", () => {
    expect(type(["Lamp", "Lock", "Note"], "ll")).toBe("Lock")
  })

  test("a label that starts with the doubled letter still wins", () => {
    expect(type(["Lamp", "llama", "Lock"], "ll")).toBe("llama")
  })

  test("a single letter starts after the current item", () => {
    expect(type(["Date", "Delete"], "d", 0)).toBe("Delete")
  })

  test("a longer prefix can stay on the current item", () => {
    expect(type(["Share", "Show sidebar"], "sha", 0)).toBe("Share")
  })

  test("with nothing highlighted, a longer query starts from the first item, not the last", () => {
    const search = createTypeahead()
    const labels = ["Bar", "Car", "Bat"]
    expect(search("b", labels, -1)).toBe(0)
    expect(search("a", labels, -1)).toBe(0)
  })

  test("a third press of the same letter keeps stepping", () => {
    expect(type(["Lamp", "Lock", "Loop", "Note"], "lll")).toBe("Loop")
  })

  test("space only continues a search", () => {
    const search = createTypeahead()
    expect(search(" ", ["Open file"], -1)).toBe(-1)
  })
})
