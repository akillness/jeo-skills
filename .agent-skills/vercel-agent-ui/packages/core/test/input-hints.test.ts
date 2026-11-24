import { describe, expect, test } from "vitest"
import { inputHints } from "../src/index"

describe("inputHints", () => {
  test("gives each kind its keyboard, autofill and corrections", () => {
    expect(inputHints("email")).toEqual({
      inputMode: "email",
      autoComplete: "email",
      autoCapitalize: "none",
      autoCorrect: "off",
      spellCheck: "false",
    })
    expect(inputHints("one-time-code")).toMatchObject({
      inputMode: "numeric",
      autoComplete: "one-time-code",
    })
    expect(inputHints("message")).toMatchObject({
      enterKeyHint: "send",
      autoCorrect: "on",
    })
    expect(inputHints("search").enterKeyHint).toBe("search")
  })

  test("takes the Return key's label, without changing the kind's own", () => {
    expect(inputHints("email", { enter: "next" }).enterKeyHint).toBe("next")
    expect(inputHints("email").enterKeyHint).toBeUndefined()
  })
})
