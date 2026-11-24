import { describe, expect, test } from "vitest"
import { createUndoStack } from "../src/foundation/kernel/undo-stack"
import type { Token } from "../src/foundation/text/text-editor"
import {
  defaultCodec,
  fromText,
  lineBoundary,
  normalizeValue,
  offsetOfToken,
  offsetText,
  removedTokens,
  replaceRange,
  sliceValue,
  toLabel,
  toText,
  tokenAt,
  valueLength,
  wordBoundary,
  type TokenInputValue,
} from "../src/components/token-input/token-input-model"

const alice: Token = {
  type: "mention",
  value: "alice",
  label: "@Alice",
  id: "a",
}
const file: Token = { type: "file", value: "src/a.ts", label: "a.ts", id: "f" }

describe("values and offsets", () => {
  test("normalizing merges strings, drops empty ones and gives tokens ids", () => {
    const value = normalizeValue([
      "a",
      "",
      "b",
      { type: "x", value: "1", label: "One" },
      "",
      "c",
    ])
    expect(value).toHaveLength(3)
    expect(value[0]).toBe("ab")
    expect((value[1] as Token).id).toMatch(/^t\d+$/)
    expect(normalizeValue([alice])[0]).toBe(alice)
  })

  test("a repeated id stays with the first token, and the next gets a new one", () => {
    const [first, second] = normalizeValue([alice, alice]) as Token[]
    expect(first).toBe(alice)
    expect(second.id).not.toBe("a")
  })

  test("a generated id skips one a token supplies", () => {
    const [generated] = normalizeValue([{ ...file, id: undefined }]) as Token[]
    const next = `t${Number(generated.id!.slice(1)) + 1}`
    const [made, supplied] = normalizeValue([
      { ...file, id: undefined },
      { ...file, id: next },
    ]) as Token[]
    expect(supplied.id).toBe(next)
    expect(made.id).not.toBe(next)
  })

  test("a supplied id too large to count past leaves generated ids unique", () => {
    normalizeValue([{ ...file, id: "t99999999999999999999" }])
    const [first] = normalizeValue([{ ...file, id: undefined }]) as Token[]
    const [second] = normalizeValue([{ ...file, id: undefined }]) as Token[]
    expect(first.id).not.toBe(second.id)
  })

  test("a token counts as one offset", () => {
    const value = normalizeValue(["hi ", alice, " and ", file])
    expect(valueLength(value)).toBe(10)
    expect(offsetText(value)).toBe("hi \uFFFC and \uFFFC")
    expect(tokenAt(value, 3)).toBe(alice)
    expect(offsetOfToken(value, "f")).toBe(9)
  })

  test("slicing keeps whole tokens", () => {
    const value = normalizeValue(["hi ", alice, "!"])
    expect(sliceValue(value, 2, 4)).toEqual([" ", alice])
    expect(sliceValue(value, 4)).toEqual(["!"])
  })

  test("an edit over a token removes all of it, and edits before it shift it", () => {
    const value = normalizeValue(["ab", alice, "cd"])
    expect(replaceRange(value, { start: 1, end: 3 }, ["X"])).toEqual(["aXcd"])
    const shifted = replaceRange(value, { start: 0, end: 0 }, ["zz"])
    expect(offsetOfToken(shifted, "a")).toBe(4)
    expect(
      removedTokens(value, replaceRange(value, { start: 2, end: 3 }, []))
    ).toEqual([alice])
  })

  test("word deletion stops at tokens, and removes just the token when it's next", () => {
    const value = normalizeValue(["one ", alice, "two three"])
    expect(wordBoundary(value, 14, -1)).toBe(9)
    expect(wordBoundary(value, 8, -1)).toBe(5)
    expect(wordBoundary(value, 5, -1)).toBe(4)
    expect(wordBoundary(value, 4, -1)).toBe(0)
    expect(wordBoundary(value, 4, 1)).toBe(5)
  })

  test("line deletion goes to the start of the line", () => {
    const value = normalizeValue(["one\ntwo"])
    expect(lineBoundary(value, 7, -1)).toBe(4)
    expect(lineBoundary(value, 4, -1)).toBe(3)
    expect(lineBoundary(value, 0, 1)).toBe(3)
  })
})

describe("codec", () => {
  test("tokens are written as links and labels as text", () => {
    const value = normalizeValue(["Summarize ", file, " for ", alice])
    expect(toText(value)).toBe(
      "Summarize [@a.ts](file:src/a.ts) for [@@Alice](mention:alice)"
    )
    expect(toLabel(value)).toBe("Summarize a.ts for @Alice")
  })

  test("labels and values with brackets and parentheses round-trip", () => {
    const token: Token = {
      type: "file",
      value: "a (copy).ts",
      label: "[draft] a\\b",
      id: "x",
    }
    expect(fromText(toText([token]))).toEqual([
      {
        type: "file",
        value: "a (copy).ts",
        label: "[draft] a\\b",
        id: expect.any(String),
      },
    ])
  })

  test("text that looks like a token stays text", () => {
    const value = normalizeValue(["see [@x](y:z) and \\[@q](r:s)"])
    const text = toText(value)
    expect(fromText(text)).toEqual(value)
  })

  test("malformed links are text", () => {
    expect(fromText("[@open](type:val")).toEqual(["[@open](type:val"])
    expect(fromText("[@a](b c:d)")).toEqual(["[@a](b c:d)"])
  })

  // fromText(toText(value)) is the value, without ids, statuses and data.
  test("any value round-trips through the codec", () => {
    let seed = 42
    const random = () =>
      (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const alphabet = [
      "a",
      "b",
      " ",
      "\n",
      "[",
      "]",
      "(",
      ")",
      "@",
      "\\",
      ":",
      "é",
      "山",
      "[@",
      "\\[@",
    ]
    const text = () =>
      Array.from(
        { length: Math.floor(random() * 8) },
        () => alphabet[Math.floor(random() * alphabet.length)]
      ).join("")
    const types = ["mention", "file", "skill-run", "a_b"]
    for (let run = 0; run < 3000; run++) {
      const segments: (string | Token)[] = []
      for (let index = Math.floor(random() * 6); index > 0; index--) {
        segments.push(
          random() < 0.5
            ? text()
            : {
                type: types[Math.floor(random() * types.length)],
                value: text(),
                label: text(),
                status: random() < 0.3 ? "pending" : undefined,
                data: random() < 0.3 ? { run: "running" } : undefined,
              }
        )
      }
      const value = normalizeValue(segments)
      const strip = (input: TokenInputValue) =>
        input.map((segment) =>
          typeof segment === "string"
            ? segment
            : { type: segment.type, value: segment.value, label: segment.label }
        )
      expect(strip(fromText(toText(value))), JSON.stringify(value)).toEqual(
        strip(value)
      )
    }
  })

  test("a long run of backslashes round-trips without stalling", () => {
    const slashes = "\\".repeat(200_000)
    const value = normalizeValue([`${slashes}x[@`, alice])
    const start = performance.now()
    const text = toText(value)
    expect(performance.now() - start).toBeLessThan(500)
    expect(fromText(text)[0]).toBe(value[0])
  })

  test("a custom codec writes and reads its own format", () => {
    const slack = {
      format: (token: Token) => `<@${token.value}>`,
      parse: (text: string) =>
        normalizeValue(
          text.split(/(<@\w+>)/).map((part) => {
            const match = /^<@(\w+)>$/.exec(part)
            return match
              ? { type: "mention", value: match[1], label: `@${match[1]}` }
              : part
          })
        ),
    }
    const value = normalizeValue(["hi ", alice])
    expect(toText(value, slack)).toBe("hi <@alice>")
    expect(toText(fromText("hi <@bob>", slack), slack)).toBe("hi <@bob>")
    expect(defaultCodec.escape).toBeTypeOf("function")
  })
})

describe("createUndoStack", () => {
  test("typing within the delay joins one entry", () => {
    const stack = createUndoStack("")
    stack.record("a", { group: "insert", time: 0 })
    stack.record("ab", { group: "insert", time: 100 })
    stack.record("abc", { group: "insert", time: 200 })
    expect(stack.undo()).toBe("")
    expect(stack.canUndo()).toBe(false)
  })

  test("a pause starts a new entry", () => {
    const stack = createUndoStack("")
    stack.record("a", { group: "insert", time: 0 })
    stack.record("ab", { group: "insert", time: 700 })
    expect(stack.undo()).toBe("a")
  })

  test("another kind of edit starts a new entry, and an edit without a group is its own", () => {
    const stack = createUndoStack("")
    stack.record("ab", { group: "insert", time: 0 })
    stack.record("a", { group: "delete", time: 10 })
    stack.record("a@x", { time: 20 })
    stack.record("a@xy", { group: "insert", time: 30 })
    expect(stack.undo()).toBe("a@x")
    expect(stack.undo()).toBe("a")
    expect(stack.undo()).toBe("ab")
  })

  test("sealing ends the group", () => {
    const stack = createUndoStack("")
    stack.record("a", { group: "insert", time: 0 })
    stack.seal()
    stack.record("ab", { group: "insert", time: 10 })
    expect(stack.undo()).toBe("a")
  })

  test("redo walks forward, and a new edit drops what was undone", () => {
    const stack = createUndoStack("")
    stack.record("a")
    stack.record("b")
    expect(stack.undo()).toBe("a")
    expect(stack.redo()).toBe("b")
    stack.undo()
    stack.record("c")
    expect(stack.canRedo()).toBe(false)
  })

  test("options given as a getter apply when they change after creation", () => {
    let options: { limit?: number } | undefined
    const stack = createUndoStack(0, () => options)
    options = { limit: 1 }
    stack.record(1)
    stack.record(2)
    expect(stack.undo()).toBe(1)
    expect(stack.canUndo()).toBe(false)
  })

  test("the limit drops the oldest entries", () => {
    const stack = createUndoStack(0, { limit: 2 })
    for (let value = 1; value <= 5; value++) {
      stack.record(value)
    }
    expect(stack.undo()).toBe(4)
    expect(stack.undo()).toBe(3)
    expect(stack.undo()).toBeUndefined()
  })

  test("map rewrites every entry without adding one", () => {
    const stack = createUndoStack("a")
    stack.record("b")
    stack.map((state) => state.toUpperCase())
    expect(stack.undo()).toBe("A")
  })
})
