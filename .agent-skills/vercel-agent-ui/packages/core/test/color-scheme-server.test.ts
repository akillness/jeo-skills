// On the server there's no window, so a color scheme answers with what it assumes.
import { expect, test } from "vitest"
import {
  colorSchemeOf,
  createColorScheme,
} from "../src/foundation/preferences/color-scheme"
import { createCookieStorage } from "../src/foundation/storage/storage"

test("follows the system on the server, with the preference unknown", () => {
  const colorScheme = createColorScheme()
  expect(colorScheme.get()).toEqual({
    value: "system",
    system: "unknown",
    resolved: "unknown",
  })
  expect(colorScheme.initialState).toBe(colorScheme.get())
})

test("renders a saved choice and a preseeded preference on the server", () => {
  const colorScheme = createColorScheme({
    defaultValue: "light",
    initial: "dark",
  })
  expect(colorScheme.get()).toEqual({
    value: "light",
    system: "dark",
    resolved: "light",
  })
  expect(colorScheme.subscribe(() => {})).toBeTypeOf("function")
})

test("reads the Sec-CH-Prefers-Color-Scheme hint, quoted or not", () => {
  expect(colorSchemeOf('"dark"')).toBe("dark")
  expect(colorSchemeOf("light")).toBe("light")
  expect(colorSchemeOf(' "dark" ')).toBe("dark")
})

test("reads a missing or unknown hint as unknown", () => {
  expect(colorSchemeOf(undefined)).toBe("unknown")
  expect(colorSchemeOf(null)).toBe("unknown")
  expect(colorSchemeOf('"no-preference"')).toBe("unknown")
  expect(colorSchemeOf("")).toBe("unknown")
})

test("renders the choice a cookie keeps, from the request's header", () => {
  const colorScheme = createColorScheme({
    storage: createCookieStorage("color-scheme", {
      cookie: "color-scheme=dark",
    }),
  })
  expect(colorScheme.initialState).toEqual({
    value: "dark",
    system: "unknown",
    resolved: "dark",
  })
})
