import { describe, expect, test } from "vitest"
import {
  findTriggerMatch,
  isAtBoundary,
  isValidQuery,
  lookBehind,
  mapDismissed,
  normalizeTriggerText,
  type DismissedMatch,
  type TriggerRule,
} from "../src/components/trigger-menu/trigger-match"

const mention: TriggerRule = { char: "@" }
const command: TriggerRule = { char: "/", boundary: "start" }

// The match for text that ends at the caret, as `query@start` or null.
function match(text: string, rules: TriggerRule[] = [mention], offset = 0) {
  const found = findTriggerMatch(text, offset, rules)
  return found
    ? `${found.match.trigger}${found.match.query}@${found.match.start}`
    : null
}

describe("findTriggerMatch", () => {
  test.each([
    ["@", "@@0"],
    ["@al", "@al@0"],
    ["hi @al", "@al@3"],
    ["hi @José", "@José@3"],
    ["hi @山田", "@山田@3"],
    ["@mañana", "@mañana@0"],
    ["(@al", "@al@1"],
    ["[@al", "@al@1"],
    ['"@al', "@al@1"],
    ["\uFFFC@al", "@al@1"],
    ["line\n@al", "@al@5"],
    ["a.b-c_d @x.y-z_w", "@x.y-z_w@8"],
  ])("matches %j as %s", (text, expected) => {
    expect(match(text)).toBe(expected)
  })

  test.each([
    ["mail@al", "mid-word, a word trigger doesn't match"],
    ["@ al", "a trigger followed by whitespace is text"],
    ["@al ", "a space ends a query without spaces"],
    ["@al\n", "a new line ends it"],
    ["@a!b", "punctuation ends it"],
    ["hello", "no trigger"],
    ["", "nothing"],
  ])("doesn't match %j: %s", (text) => {
    expect(match(text)).toBeNull()
  })

  test("the nearest trigger before the caret wins", () => {
    expect(match("@ann @bo")).toBe("@bo@5")
  })

  test("a full-width trigger an input method committed matches", () => {
    expect(match("＠al")).toBe("@al@0")
    expect(match("x ／m", [{ char: "/" }])).toBe("/m@2")
  })

  test("boundary start matches only at offset 0, so a leading space escapes it", () => {
    expect(match("/mod", [command])).toBe("/mod@0")
    expect(match(" /mod", [command])).toBeNull()
    expect(match("a /mod", [command])).toBeNull()
  })

  test("boundary line matches at the start of any line", () => {
    const rule: TriggerRule = { char: "/", boundary: "line" }
    expect(match("one\n/x", [rule])).toBe("/x@4")
    expect(match("one /x", [rule])).toBeNull()
  })

  test("boundary anywhere matches mid-word", () => {
    expect(match("mail@al", [{ char: "@", boundary: "anywhere" }])).toBe(
      "@al@4"
    )
  })

  test("spaces allow phrases, and a number caps the words", () => {
    expect(match("@next wed", [{ char: "@", spaces: true }])).toBe(
      "@next wed@0"
    )
    expect(match("@next ", [{ char: "@", spaces: true }])).toBe("@next @0")
    expect(match("@a  b", [{ char: "@", spaces: true }])).toBeNull()
    expect(match("@a b", [{ char: "@", spaces: 2 }])).toBe("@a b@0")
    expect(match("@a b ", [{ char: "@", spaces: 2 }])).toBe("@a b @0")
    expect(match("@a b c", [{ char: "@", spaces: 2 }])).toBeNull()
  })

  test("a multi-character trigger matches", () => {
    expect(match("see [[Page", [{ char: "[[" }])).toBe("[[Page@4")
  })

  test("triggers with regex characters are matched literally", () => {
    expect(match("x ]a", [{ char: "]" }])).toBe("]a@2")
    expect(match("x -a", [{ char: "-", pattern: /[a-z]/ }])).toBe("-a@2")
    expect(match("x .*a", [{ char: ".*" }])).toBe(".*a@2")
  })

  test("a pattern with the global flag tests every character the same", () => {
    const rule: TriggerRule = { char: "#", pattern: /[a-z]/g }
    expect(match("#abc", [rule])).toBe("#abc@0")
    expect(match("#abc", [rule])).toBe("#abc@0")
  })

  test("maxLength ends a long query", () => {
    expect(match("@abcd", [{ char: "@", maxLength: 3 }])).toBeNull()
    expect(match("@abc", [{ char: "@", maxLength: 3 }])).toBe("@abc@0")
  })

  test("the offset says where the text starts, and an unknown character before it is no boundary", () => {
    expect(match(" @al", [mention], 10)).toBe("@al@11")
    expect(match("@al", [mention], 10)).toBeNull()
  })

  test("a token reads as U+FFFC and ends a query", () => {
    expect(match("@al\uFFFCb")).toBeNull()
  })

  test("reports which rule matched", () => {
    expect(findTriggerMatch("hi /x", 0, [mention, { char: "/" }])?.rule).toBe(1)
  })
})

describe("isValidQuery and isAtBoundary", () => {
  test("an empty query is valid", () => {
    expect(isValidQuery("", mention)).toBe(true)
  })

  test("a word trigger needs whitespace or an opener before it", () => {
    expect(isAtBoundary("a @", 2, 0, "word")).toBe(true)
    expect(isAtBoundary("a@", 1, 0, "word")).toBe(false)
  })

  test("lookBehind covers the longest query and trigger plus the boundary character", () => {
    expect(lookBehind([mention, { char: "[[", maxLength: 80 }])).toBe(83)
  })

  test("normalizes full-width triggers without moving offsets", () => {
    expect(normalizeTriggerText("＠＃／")).toBe("@#/")
  })
})

describe("mapDismissed", () => {
  const dismissed: DismissedMatch = { trigger: "@", start: 3, end: 6 }

  test("an edit before shifts it", () => {
    expect(mapDismissed(dismissed, { start: 0, end: 0 }, 2)).toEqual({
      trigger: "@",
      start: 5,
      end: 8,
    })
    expect(mapDismissed(dismissed, { start: 0, end: 2 }, 0)).toEqual({
      trigger: "@",
      start: 1,
      end: 4,
    })
  })

  test("typing at its end or inside grows it", () => {
    expect(mapDismissed(dismissed, { start: 6, end: 6 }, 3)).toEqual({
      trigger: "@",
      start: 3,
      end: 9,
    })
    expect(mapDismissed(dismissed, { start: 5, end: 6 }, 0)).toEqual({
      trigger: "@",
      start: 3,
      end: 5,
    })
  })

  test("deleting or replacing the trigger clears it", () => {
    expect(mapDismissed(dismissed, { start: 3, end: 4 }, 0)).toBeNull()
    expect(mapDismissed(dismissed, { start: 2, end: 4 }, 1)).toBeNull()
  })

  test("an edit after it leaves it", () => {
    expect(mapDismissed(dismissed, { start: 10, end: 12 }, 5)).toBe(dismissed)
  })

  test("random edits never leave a range that ends before its trigger", () => {
    let seed = 7
    const random = () =>
      (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    for (let run = 0; run < 2000; run++) {
      let range: DismissedMatch | null = { trigger: "@", start: 5, end: 9 }
      for (let step = 0; step < 10 && range; step++) {
        const start = Math.floor(random() * 20)
        const end = start + Math.floor(random() * 4)
        range = mapDismissed(range, { start, end }, Math.floor(random() * 4))
        if (range) {
          expect(range.end).toBeGreaterThanOrEqual(
            range.start + range.trigger.length
          )
        }
      }
    }
  })
})
