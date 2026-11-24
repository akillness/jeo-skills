// Storage on the server: only a cookie, read from the request's header.
import { expect, test } from "vitest"
import {
  createCookieStorage,
  createLocalStorage,
  createSessionStorage,
} from "../src/foundation/storage/storage"

test("localStorage and sessionStorage are unavailable on the server", () => {
  for (const storage of [
    createLocalStorage("color-scheme"),
    createSessionStorage("color-scheme"),
  ]) {
    expect(storage.available()).toBe(false)
    expect(storage.readsOnServer).toBe(false)
    expect(storage.get()).toBeNull()
    expect(storage.set("dark")).toBe(false)
    expect(storage.subscribe(() => {})).toBeTypeOf("function")
  }
})

test("a cookie reads the request's Cookie header on the server", () => {
  const storage = createCookieStorage("color-scheme", {
    cookie: "density=compact; color-scheme=dark",
  })
  expect(storage.available()).toBe(true)
  expect(storage.get()).toBe("dark")
  expect(storage.set("light")).toBe(false)
})

test("a cookie without the request's header reads nothing", () => {
  const storage = createCookieStorage("color-scheme")
  expect(storage.available()).toBe(false)
  expect(storage.get()).toBeNull()
})
