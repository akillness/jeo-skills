import { afterEach, describe, expect, test } from "vitest"
import { fuzzyScore } from "../src/foundation/text/fuzzy"
import {
  filterData,
  textMatches,
  type ListData,
} from "../src/foundation/lists/listbox"
import { describeList } from "../src/foundation/lists/listbox-search"
import {
  createFolder,
  matchRanges,
  matchSegments,
  setMatchLocale,
} from "../src/foundation/text/match"

afterEach(() => setMatchLocale())

describe("folding", () => {
  test("keeps the text's length, so a match in it is a range of the text", () => {
    for (const text of [
      "Łódź",
      "Crème brûlée",
      "İstanbul",
      "Smørrebrød",
      "Ångström",
      "naïve 🍐 pear",
    ]) {
      expect(createFolder("en").fold(text)).toHaveLength(text.length)
    }
  })

  test("folds case and accents the way the collator does, letters NFD can't take apart included", () => {
    const { fold } = createFolder("en")
    expect(fold("Łódź")).toBe("lodz")
    expect(fold("Smørrebrød")).toBe("smorrebrod")
    expect(fold("Crème Brûlée")).toBe("creme brulee")
    expect(fold("İstanbul")).toBe("istanbul")
  })

  test("keeps letters apart where the language does: Swedish ä is not a", () => {
    expect(createFolder("sv").fold("Älmhult")).toBe("älmhult")
    expect(createFolder("en").fold("Älmhult")).toBe("almhult")
  })

  test("lowercases the Turkish way in Turkish", () => {
    expect(createFolder("tr").fold("ISPARTA")).toBe("ısparta")
    expect(createFolder("en").fold("ISPARTA")).toBe("isparta")
  })

  test("filtering follows the user's language", () => {
    setMatchLocale("en")
    expect(textMatches("Älmhult", "alm", "startsWith")).toBe(true)
    expect(textMatches("Łódź", "lodz", "contains")).toBe(true)
    setMatchLocale("sv")
    expect(textMatches("Älmhult", "alm", "startsWith")).toBe(false)
    expect(textMatches("Älmhult", "älm", "startsWith")).toBe(true)
  })
})

describe("match ranges", () => {
  test("contains marks where the text appears, in the original text", () => {
    const ranges = matchRanges("Crème brûlée", "brule", "contains")
    expect(ranges).toEqual([{ start: 6, end: 11 }])
    expect(matchSegments("Crème brûlée", ranges)).toEqual([
      { text: "Crème ", match: false },
      { text: "brûlé", match: true },
      { text: "e", match: false },
    ])
  })

  test("startsWith marks the start, past a label's leading space", () => {
    expect(matchRanges("Apple", "ap", "startsWith")).toEqual([
      { start: 0, end: 2 },
    ])
    expect(matchRanges("\n  Apple", "ap", "startsWith")).toEqual([
      { start: 3, end: 5 },
    ])
    expect(matchRanges("Pineapple", "ap", "startsWith")).toEqual([])
  })

  test("fuzzy prefers a word start, then marks each letter, joining neighbours", () => {
    expect(matchRanges("Git push", "pu", "fuzzy")).toEqual([
      { start: 4, end: 6 },
    ])
    expect(matchRanges("Git push", "gp", "fuzzy")).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 5 },
    ])
    expect(matchRanges("Git push", "gits", "fuzzy")).toEqual([
      { start: 0, end: 3 },
      { start: 6, end: 7 },
    ])
    expect(matchRanges("Calendar", "xyz", "fuzzy")).toEqual([])
  })

  test("no query and no match leave the text whole", () => {
    expect(matchRanges("Apple", "  ", "contains")).toEqual([])
    expect(matchSegments("Apple", [])).toEqual([
      { text: "Apple", match: false },
    ])
  })

  test("the fuzzy scorer and its ranges agree", () => {
    for (const [text, query] of [
      ["Git push", "gp"],
      ["Settings", "set"],
      ["Łódź", "lodz"],
    ]) {
      expect(fuzzyScore(text, query) > 0).toBe(
        matchRanges(text, query, "fuzzy").length > 0
      )
    }
  })
})

describe("announcements", () => {
  test("say counts, nothing found, loading and removals", () => {
    expect(
      describeList({ type: "results", count: 3, query: "a", loading: false })
    ).toBe("3 results")
    expect(
      describeList({ type: "results", count: 1, query: "a", loading: false })
    ).toBe("1 result")
    expect(
      describeList({ type: "results", count: 0, query: "a", loading: false })
    ).toBe("No results")
    expect(
      describeList({ type: "results", count: 0, query: "a", loading: true })
    ).toBe("Loading")
    expect(describeList({ type: "removed", label: "Pear" })).toBe(
      "Pear removed"
    )
  })
})

describe("10,000 items", () => {
  const words = [
    "Café",
    "Crème",
    "Zürich",
    "São Paulo",
    "Łódź",
    "Smørrebrød",
    "Ångström",
    "Málaga",
  ]
  const many: ListData = Array.from({ length: 10_000 }, (_, index) => ({
    value: `item-${index}`,
    label: `${words[index % words.length]} ${index}`,
  }))

  test("filtering and marking every match stay well under a frame", () => {
    setMatchLocale("en")
    filterData(many, "x", "contains")
    // The best of five runs, so a busy CI runner's pause doesn't fail it.
    const times: number[] = []
    let kept: { label: string }[] = []
    let marked: unknown[][] = []
    for (let run = 0; run < 5; run++) {
      const start = performance.now()
      kept = filterData(many, "lodz", "contains") as { label: string }[]
      marked = kept.map((item) => matchRanges(item.label, "lodz", "contains"))
      times.push(performance.now() - start)
    }
    expect(kept).toHaveLength(1250)
    expect(marked.every((ranges) => ranges.length === 1)).toBe(true)
    expect(Math.min(...times)).toBeLessThan(16)
  })
})
