import { describe, expect, test, vi } from "vitest"
import {
  createOTPInputController,
  otpInput,
} from "../src/components/otp-input/otp-input"
import {
  fitsPattern,
  focusSelection,
  insertCode,
  keySelection,
  pastedCode,
  patternAttribute,
  pressSelection,
  slotSelection,
  slotsOf,
} from "../src/components/otp-input/otp-input-model"
import { attrs, partState } from "../src/foundation/kernel/part"
import { kept } from "./kept"

describe("input otp patterns", () => {
  test("accepts characters by preset", () => {
    expect(fitsPattern("123", "digits")).toBe(true)
    expect(fitsPattern("12a", "digits")).toBe(false)
    expect(fitsPattern("abC", "letters")).toBe(true)
    expect(fitsPattern("a1B2", "alphanumeric")).toBe(true)
    expect(fitsPattern("a-1", "alphanumeric")).toBe(false)
  })

  test("tests each character against a custom expression, whatever its flags", () => {
    const hex = /[a-f0-9]/gi
    expect(fitsPattern("BEEF", hex)).toBe(true)
    expect(fitsPattern("BEEF", hex)).toBe(true)
    expect(fitsPattern("BEEG", hex)).toBe(false)
  })

  test("drops spaces and dashes from a paste, and ignores one with anything else", () => {
    expect(pastedCode(" 123-456 ", "digits")).toBe("123456")
    expect(pastedCode("123 456", "digits")).toBe("123456")
    expect(pastedCode("Your code is 123456", "digits")).toBeNull()
    expect(pastedCode("   ", "digits")).toBeNull()
  })

  test("reads another script's digits as plain ones", () => {
    expect(pastedCode("٤٨٢٩١٣", "digits")).toBe("482913")
    expect(pastedCode("۹۱۳ ۴۸۲", "digits")).toBe("913482")
    expect(pastedCode("४८२", "digits")).toBe("482")
    expect(pastedCode("A٤", "alphanumeric")).toBe("A4")
    expect(pastedCode("٤٨٢", /[٠-٩]/)).toBe("٤٨٢")
    expect(pastedCode("Your code is ٤٨٢٩١٣", "digits")).toBeNull()
  })
})

describe("input otp editing", () => {
  test("inserts over the selection, cut to the length", () => {
    expect(insertCode("12", { start: 2, end: 2 }, "34", 6)).toBe("1234")
    expect(insertCode("123456", { start: 2, end: 3 }, "9", 6)).toBe("129456")
    expect(insertCode("1234", { start: 4, end: 4 }, "5678", 6)).toBe("123456")
  })

  test("a whole code replaces the value, wherever the caret is", () => {
    expect(insertCode("12", { start: 1, end: 1 }, "654321", 6)).toBe("654321")
  })
})

describe("input otp selection", () => {
  test("a caret after the code, while it isn't full, stays to take the next character", () => {
    expect(slotSelection({ start: 3, end: 3 }, null, 3, 6)).toBeNull()
  })

  test("a caret inside the code selects the character after it", () => {
    expect(slotSelection({ start: 0, end: 0 }, null, 3, 6)).toMatchObject({
      start: 0,
      end: 1,
    })
    expect(
      slotSelection({ start: 2, end: 2 }, { start: 1, end: 2 }, 4, 6)
    ).toMatchObject({
      start: 2,
      end: 3,
      direction: "forward",
    })
  })

  test("ArrowLeft from a selected slot selects the one before it", () => {
    expect(
      slotSelection({ start: 3, end: 3 }, { start: 3, end: 4 }, 6, 6)
    ).toMatchObject({
      start: 2,
      end: 3,
      direction: "backward",
    })
  })

  test("ArrowLeft from the empty slot at the end selects the last character", () => {
    expect(
      slotSelection({ start: 3, end: 3 }, { start: 4, end: 4 }, 4, 6)
    ).toMatchObject({
      start: 3,
      end: 4,
    })
  })

  test("a caret at the end of a full code selects its last character", () => {
    expect(slotSelection({ start: 6, end: 6 }, null, 6, 6)).toMatchObject({
      start: 5,
      end: 6,
    })
  })

  test("a real selection stays", () => {
    expect(slotSelection({ start: 0, end: 6 }, null, 6, 6)).toBeNull()
  })

  test("focus goes after the code, or onto its last character when full", () => {
    expect(focusSelection(2, 6)).toEqual({ start: 2, end: 2 })
    expect(focusSelection(6, 6)).toEqual({ start: 5, end: 6 })
  })

  test("a press selects that slot's character, or the slot after the code", () => {
    expect(pressSelection(1, 4, 6)).toEqual({ start: 1, end: 2 })
    expect(pressSelection(5, 4, 6)).toEqual({ start: 4, end: 4 })
  })
})

describe("input otp keys", () => {
  test("arrows move a slot at a time, and past the code to the empty slot after it", () => {
    expect(keySelection("ArrowLeft", { start: 2, end: 3 }, 4, 6)).toEqual({
      start: 1,
      end: 2,
    })
    expect(keySelection("ArrowLeft", { start: 4, end: 4 }, 4, 6)).toEqual({
      start: 3,
      end: 4,
    })
    expect(keySelection("ArrowLeft", { start: 0, end: 1 }, 4, 6)).toEqual({
      start: 0,
      end: 1,
    })
    expect(keySelection("ArrowRight", { start: 1, end: 2 }, 4, 6)).toEqual({
      start: 2,
      end: 3,
    })
    expect(keySelection("ArrowRight", { start: 3, end: 4 }, 4, 6)).toEqual({
      start: 4,
      end: 4,
    })
  })

  test("right to left, the arrows swap", () => {
    expect(keySelection("ArrowLeft", { start: 1, end: 2 }, 4, 6, true)).toEqual(
      { start: 2, end: 3 }
    )
    expect(
      keySelection("ArrowRight", { start: 1, end: 2 }, 4, 6, true)
    ).toEqual({ start: 0, end: 1 })
  })

  test("Home selects the first character and End the slot after the code", () => {
    expect(keySelection("Home", { start: 3, end: 3 }, 3, 6)).toEqual({
      start: 0,
      end: 1,
    })
    expect(keySelection("End", { start: 0, end: 1 }, 3, 6)).toEqual({
      start: 3,
      end: 3,
    })
    expect(keySelection("End", { start: 0, end: 1 }, 6, 6)).toEqual({
      start: 5,
      end: 6,
    })
    expect(keySelection("Home", { start: 0, end: 0 }, 0, 6)).toEqual({
      start: 0,
      end: 0,
    })
  })

  test("other keys are left to the browser", () => {
    expect(keySelection("ArrowUp", { start: 1, end: 2 }, 4, 6)).toBeNull()
    expect(keySelection("1", { start: 1, end: 2 }, 4, 6)).toBeNull()
  })
})

describe("input otp slots", () => {
  test("render characters, and the active slot with a caret while empty", () => {
    expect(slotsOf("12", 4, { start: 2, end: 2 })).toEqual([
      { char: "1", active: false, hasFakeCaret: false },
      { char: "2", active: false, hasFakeCaret: false },
      { char: null, active: true, hasFakeCaret: true },
      { char: null, active: false, hasFakeCaret: false },
    ])
  })

  test("a selected character is active without a caret", () => {
    expect(slotsOf("1234", 4, { start: 1, end: 2 })[1]).toEqual({
      char: "2",
      active: true,
      hasFakeCaret: false,
    })
  })

  test("nothing is active without focus", () => {
    expect(slotsOf("", 2, null).some((slot) => slot.active)).toBe(false)
  })
})

describe("input otp", () => {
  test("keeps a default value to what fits the pattern and the length", () => {
    const otp = otpInput({ id: "o", defaultValue: "12a3456789", maxLength: 6 })
    expect(otp.api.getValue()).toBe("123456")
  })

  test("renders the input's attributes from its options", () => {
    const otp = otpInput({
      id: "o",
      maxLength: 4,
      pattern: "alphanumeric",
      name: "code",
      required: true,
    })
    expect(attrs(otp.part("control"))).toMatchObject({
      maxlength: "4",
      minlength: "4",
      inputmode: "text",
      autocomplete: "one-time-code",
      pattern: "[A-Za-z0-9]{4}",
      name: "code",
      required: "",
    })
    expect(attrs(otp.part("slot", { index: 0 }))["aria-hidden"]).toBe("true")
  })

  test("a controller sets the code, reports the reason and completes it", () => {
    const controller = createOTPInputController()
    const onValueChange = vi.fn()
    const onValueCommit = vi.fn()
    const otp = kept(
      otpInput({
        id: "o",
        maxLength: 4,
        controller,
        onValueChange,
        onValueCommit,
      })
    )
    otp.setOptions({
      id: "o",
      maxLength: 4,
      controller,
      onValueChange,
      onValueCommit,
    })
    controller.setValue("12 34")
    expect(controller.getValue()).toBe("1234")
    expect(onValueChange).toHaveBeenCalledWith(
      "1234",
      expect.objectContaining({ reason: "imperative" })
    )
    expect(onValueCommit).toHaveBeenCalledWith(
      "1234",
      expect.objectContaining({ reason: "imperative" })
    )
    expect(partState(otp.part("root"))).toMatchObject({ complete: true })
  })

  test("a controller hands its event to onValueChange", () => {
    const onValueChange = vi.fn()
    const otp = otpInput({ id: "o", onValueChange })
    const event = new Event("click")
    otp.api.setValue("12", { reason: "imperative", event })
    expect(onValueChange).toHaveBeenCalledWith(
      "12",
      expect.objectContaining({ reason: "imperative", event })
    )
  })

  test("a code echoed back from onValueChange completes once, and a cancel after it still holds", () => {
    const onValueCommit = vi.fn()
    const otp = otpInput({
      id: "o",
      maxLength: 4,
      onValueCommit,
      onValueChange: (value) => {
        otp.api.setValue(value)
      },
    })
    otp.api.setValue("1234")
    expect(onValueCommit).toHaveBeenCalledTimes(1)
    const canceling = otpInput({
      id: "c",
      maxLength: 4,
      onValueCommit,
      onValueChange: (value, details) => {
        canceling.api.setValue(value)
        details.cancel()
      },
    })
    canceling.api.setValue("5678")
    expect(canceling.api.getValue()).toBe("")
    expect(onValueCommit).toHaveBeenCalledTimes(1)
  })

  test("a canceled change keeps the code", () => {
    const otp = otpInput({
      id: "o",
      defaultValue: "12",
      onValueChange: (_, details) => details.cancel(),
    })
    otp.api.clear()
    expect(otp.api.getValue()).toBe("12")
  })
})

describe("constraint validation", () => {
  test("the pattern attribute asks for a whole code, so a partial one is invalid wherever it came from", () => {
    expect(patternAttribute("digits", 6, false)).toBe("[0-9]{6}")
    expect(patternAttribute("alphanumeric", 4, false)).toBe("[A-Za-z0-9]{4}")
    expect(patternAttribute(/[A-F]/, 4, false)).toBe(".{4}")
    expect(
      attrs(otpInput({ id: "o", defaultValue: "12" }).part("control")).pattern
    ).toBe("[0-9]{6}")
  })

  test("the pattern leaves the length out while the browser flags a typed code as too short", () => {
    expect(patternAttribute("digits", 6, true)).toBe("[0-9]*")
    expect(patternAttribute("letters", 6, true)).toBe("[A-Za-z]*")
    expect(patternAttribute(/[A-F]/, 4, true)).toBeUndefined()
  })
})
