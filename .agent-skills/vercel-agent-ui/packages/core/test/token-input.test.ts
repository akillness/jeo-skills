import { beforeAll, describe, expect, test } from "vitest"
import { setAnnouncer } from "../src/foundation/platform/announce"
import { tokenInput } from "../src/components/token-input/token-input"
import { renderStaticHtml } from "../src/components/token-input/token-input-view"
import type { Token } from "../src/foundation/text/text-editor"

const file = { type: "file", value: "src/a.ts", label: "a.ts" }
const tokens = (value: (string | Token)[]) =>
  value.filter((segment) => typeof segment !== "string")

beforeAll(() => setAnnouncer(() => {}))

describe("pending tokens", () => {
  test("a token removed while it loads comes back settled on undo", async () => {
    const instance = tokenInput({ id: "x" })
    let settle = () => {}
    const loaded = new Promise<void>((resolve) => (settle = resolve))
    instance.api.insert(file, { resolve: loaded })
    const [token] = tokens(instance.api.getValue())
    expect(token.status).toBe("pending")
    instance.api.removeToken(token.id!)
    settle()
    await loaded
    await Promise.resolve()
    instance.api.undo()
    const [restored] = tokens(instance.api.getValue())
    expect(restored.id).toBe(token.id)
    expect(restored.status).toBeUndefined()
  })
})

describe("token ids", () => {
  test("a repeated id names one token, so updating or removing it touches only that one", () => {
    const instance = tokenInput({
      id: "x",
      defaultValue: [{ ...file, id: "a" }, " ", { ...file, id: "a" }],
    })
    const ids = tokens(instance.api.getValue()).map((token) => token.id)
    expect(new Set(ids).size).toBe(2)
    instance.api.updateToken("a", { label: "b.ts" })
    expect(tokens(instance.api.getValue()).map((token) => token.label)).toEqual(
      ["b.ts", "a.ts"]
    )
    instance.api.removeToken("a")
    expect(tokens(instance.api.getValue())).toHaveLength(1)
  })

  test("a token that fails to load leaves a supplied token with the id it would have generated", async () => {
    const generated = tokens(
      tokenInput({ id: "y", defaultValue: [file] }).api.getValue()
    )[0].id!
    const next = `t${Number(generated.slice(1)) + 1}`
    const instance = tokenInput({
      id: "z",
      defaultValue: [{ ...file, label: "b.ts", id: next }],
    })
    const failed = Promise.reject(new Error("offline"))
    instance.api.insert(file, { at: "end", resolve: failed })
    await failed.catch(() => {})
    await Promise.resolve()
    expect(tokens(instance.api.getValue()).map((token) => token.label)).toEqual(
      ["b.ts"]
    )
  })

  test("a loading token inserted with an id the value has settles itself, not the other token", async () => {
    const instance = tokenInput({
      id: "w",
      defaultValue: [{ ...file, label: "b.ts", id: "a" }],
    })
    const failed = Promise.reject(new Error("offline"))
    instance.api.insert({ ...file, id: "a" }, { at: "end", resolve: failed })
    await failed.catch(() => {})
    await Promise.resolve()
    expect(tokens(instance.api.getValue()).map((token) => token.label)).toEqual(
      ["b.ts"]
    )
  })

  test("a loading token settles itself when onValueChange replaces the value as it's inserted", async () => {
    let replaced = false
    const instance = tokenInput({
      id: "v",
      onValueChange() {
        if (replaced) {
          return
        }
        replaced = true
        instance.api.setValue([{ ...file, label: "b.ts", id: "b" }])
      },
    })
    const failed = Promise.reject(new Error("offline"))
    instance.api.insert(file, { at: "end", resolve: failed })
    await failed.catch(() => {})
    await Promise.resolve()
    expect(tokens(instance.api.getValue()).map((token) => token.label)).toEqual(
      ["b.ts"]
    )
  })
})

describe("static markup", () => {
  test("text that reads like the sentinel attribute stays text", () => {
    const html = renderStaticHtml(["data-ui-sentinel"], () => "")
    expect(html).toBe("data-ui-sentinel")
  })
})
