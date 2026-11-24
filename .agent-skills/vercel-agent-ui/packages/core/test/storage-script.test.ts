// @vitest-environment jsdom
// The inline script a component renders after its root, run the way the
// browser's parser would: once per script element, with it as currentScript.
import { afterEach, expect, test } from "vitest"
import {
  createCookieStorage,
  createLocalStorage,
  createSessionStorage,
} from "../src/foundation/storage/storage"

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  delete (window as Window & { __uiSdkStorage?: unknown }).__uiSdkStorage
  document.body.replaceChildren()
})

// Server HTML: each root, followed by its script.
function load(html: string) {
  document.body.innerHTML = html
  const scripts = [...document.body.querySelectorAll("script")]
  for (const script of scripts) {
    Object.defineProperty(document, "currentScript", {
      configurable: true,
      value: script,
    })
    new Function(script.textContent!)()
  }
  Object.defineProperty(document, "currentScript", {
    configurable: true,
    value: null,
  })
  return [...document.body.querySelectorAll<HTMLElement>("[data-color-scheme]")]
}

const values = ["system", "light", "dark"]

test("puts the saved value on the root right before it", () => {
  localStorage.setItem("color-scheme", "dark")
  const script = createLocalStorage("color-scheme").script({
    attribute: "data-color-scheme",
    values,
  })!
  const [root] = load(
    `<div data-color-scheme="system"></div><script>${script}</script>`
  )
  expect(root.dataset.colorScheme).toBe("dark")
})

test("scripts with the same ID read the storage once and patch their own roots", () => {
  localStorage.setItem("color-scheme", "light")
  const script = createLocalStorage("color-scheme").script({
    attribute: "data-color-scheme",
    values,
  })!
  expect(
    createLocalStorage("color-scheme").script({
      attribute: "data-color-scheme",
      values,
    })
  ).toBe(script)
  let reads = 0
  const getItem = Storage.prototype.getItem
  Storage.prototype.getItem = function (key) {
    reads++
    return getItem.call(this, key)
  }
  try {
    const roots = load(
      `<div data-color-scheme="system"></div><script>${script}</script>` +
        `<p>Between</p>` +
        `<div data-color-scheme="system"></div><script>${script}</script>`
    )
    expect(roots.map((root) => root.dataset.colorScheme)).toEqual([
      "light",
      "light",
    ])
    expect(reads).toBe(1)
  } finally {
    Storage.prototype.getItem = getItem
  }
})

test("leaves the root alone for a value it doesn't allow, or nothing saved", () => {
  const script = createLocalStorage("color-scheme").script({
    attribute: "data-color-scheme",
    values,
  })!
  expect(
    load(`<div data-color-scheme="system"></div><script>${script}</script>`)[0]
      .dataset.colorScheme
  ).toBe("system")
  delete (window as Window & { __uiSdkStorage?: unknown }).__uiSdkStorage
  localStorage.setItem("color-scheme", '"><img src=x onerror=alert(1)>')
  expect(
    load(`<div data-color-scheme="system"></div><script>${script}</script>`)[0]
      .dataset.colorScheme
  ).toBe("system")
})

test("reads sessionStorage for a session storage", () => {
  localStorage.setItem("color-scheme", "light")
  sessionStorage.setItem("color-scheme", "dark")
  const script = createSessionStorage("color-scheme").script({
    attribute: "data-color-scheme",
    values,
  })!
  expect(
    load(`<div data-color-scheme="system"></div><script>${script}</script>`)[0]
      .dataset.colorScheme
  ).toBe("dark")
})

test("keeps going when storage is blocked", () => {
  const real = Object.getOwnPropertyDescriptor(window, "localStorage")!
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get: () => {
      throw new DOMException("Blocked", "SecurityError")
    },
  })
  try {
    const script = createLocalStorage("color-scheme").script({
      attribute: "data-color-scheme",
      values,
    })!
    expect(
      load(
        `<div data-color-scheme="system"></div><script>${script}</script>`
      )[0].dataset.colorScheme
    ).toBe("system")
  } finally {
    Object.defineProperty(window, "localStorage", real)
  }
})

test("only sets data attributes, and can't be closed by its own text", () => {
  const storage = createLocalStorage("</script><script>alert(1)</script>")
  expect(() =>
    storage.script({ attribute: "onclick" as `data-${string}`, values })
  ).toThrow(/data-\*/)
  const script = storage.script({
    attribute: "data-color-scheme",
    values: ["</script>"],
  })!
  expect(script).not.toContain("</script>")
  expect(script).not.toContain("<")
})

test("a cookie needs no script, since the server renders its value", () => {
  expect(
    createCookieStorage("color-scheme").script({
      attribute: "data-color-scheme",
      values,
    })
  ).toBeUndefined()
})
