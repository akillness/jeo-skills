// @vitest-environment jsdom
// Storage in a browser: jsdom has localStorage, sessionStorage and cookies.
import { afterEach, expect, test } from "vitest"
import {
  createCookieStorage,
  createLocalStorage,
  createSessionStorage,
} from "../src/foundation/storage/storage"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  localStorage.clear()
  sessionStorage.clear()
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim()
    if (name) {
      document.cookie = `${name}=; path=/; max-age=0`
    }
  }
})

test("needs an ID", () => {
  expect(() => createLocalStorage("")).toThrow(/needs an ID/)
})

test("keeps, reads and removes a value in localStorage", () => {
  const storage = createLocalStorage("color-scheme")
  expect(storage.available()).toBe(true)
  expect(storage.get()).toBeNull()
  expect(storage.set("dark")).toBe(true)
  expect(localStorage.getItem("color-scheme")).toBe("dark")
  expect(createLocalStorage("color-scheme").get()).toBe("dark")
  expect(storage.remove()).toBe(true)
  expect(storage.get()).toBeNull()
})

test("localStorage and sessionStorage keep separate values", () => {
  createLocalStorage("color-scheme").set("dark")
  expect(createSessionStorage("color-scheme").get()).toBeNull()
  createSessionStorage("color-scheme").set("light")
  expect(sessionStorage.getItem("color-scheme")).toBe("light")
  expect(createLocalStorage("color-scheme").get()).toBe("dark")
})

test("storages with the same ID hear each other's writes, and others don't", () => {
  const heard: (string | null)[] = []
  const other: (string | null)[] = []
  cleanups.push(
    createLocalStorage("color-scheme").subscribe((value) => heard.push(value))
  )
  cleanups.push(
    createLocalStorage("density").subscribe((value) => other.push(value))
  )
  cleanups.push(
    createSessionStorage("color-scheme").subscribe((value) => other.push(value))
  )
  const writer = createLocalStorage("color-scheme")
  writer.set("dark")
  writer.remove()
  expect(heard).toEqual(["dark", null])
  expect(other).toEqual([])
})

test("hears another tab's write through the storage event", () => {
  const heard: (string | null)[] = []
  cleanups.push(
    createLocalStorage("color-scheme").subscribe((value) => heard.push(value))
  )
  localStorage.setItem("color-scheme", "light")
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: "color-scheme",
      storageArea: localStorage,
    })
  )
  window.dispatchEvent(
    new StorageEvent("storage", { key: "density", storageArea: localStorage })
  )
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: "color-scheme",
      storageArea: sessionStorage,
    })
  )
  expect(heard).toEqual(["light"])
})

test("a blocked storage reads null and writes nothing", () => {
  const real = Object.getOwnPropertyDescriptor(window, "localStorage")!
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get: () => {
      throw new DOMException("Blocked", "SecurityError")
    },
  })
  cleanups.push(() => Object.defineProperty(window, "localStorage", real))
  const storage = createLocalStorage("color-scheme")
  expect(storage.available()).toBe(false)
  expect(storage.get()).toBeNull()
  expect(storage.set("dark")).toBe(false)
})

test("a full storage reports the write failed", () => {
  const full = {
    getItem: () => null,
    setItem: (key: string) => {
      if (key !== "__ui-sdk-storage__") {
        throw new DOMException("Full", "QuotaExceededError")
      }
    },
    removeItem: () => {},
  }
  const real = Object.getOwnPropertyDescriptor(window, "sessionStorage")!
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get: () => full,
  })
  cleanups.push(() => Object.defineProperty(window, "sessionStorage", real))
  expect(createSessionStorage("color-scheme").set("dark")).toBe(false)
})

test("keeps a value in a cookie, encoded, and removes it", () => {
  const storage = createCookieStorage("color-scheme")
  expect(storage.readsOnServer).toBe(true)
  expect(storage.available()).toBe(true)
  expect(storage.set("dark; or not")).toBe(true)
  expect(document.cookie).toContain("color-scheme=dark%3B%20or%20not")
  expect(createCookieStorage("color-scheme").get()).toBe("dark; or not")
  storage.remove()
  expect(storage.get()).toBeNull()
})

test("a storage that was full takes writes again once space frees up, and reads while full", () => {
  const items = new Map([["color-scheme", "dark"]])
  let full = true
  const area = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (full) {
        throw new DOMException("Full", "QuotaExceededError")
      }
      items.set(key, value)
    },
    removeItem: (key: string) => items.delete(key),
  }
  const real = Object.getOwnPropertyDescriptor(window, "sessionStorage")!
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get: () => area,
  })
  cleanups.push(() => Object.defineProperty(window, "sessionStorage", real))
  const storage = createSessionStorage("color-scheme")
  expect(storage.available()).toBe(false)
  expect(storage.set("light")).toBe(false)
  expect(storage.get()).toBe("dark")
  full = false
  expect(storage.available()).toBe(true)
  expect(storage.set("light")).toBe(true)
  expect(createSessionStorage("color-scheme").get()).toBe("light")
})
