import { build } from "esbuild"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { pageLocale, toLocale, userLocale } from "../src/foundation/text/locale"

afterEach(() => vi.unstubAllGlobals())

describe("locale tags", () => {
  test("keeps a tag Intl accepts, canonicalized", () => {
    expect(toLocale("en-US")).toBe("en-US")
    expect(toLocale("de")).toBe("de")
    expect(toLocale("EN-us")).toBe("en-US")
  })

  test("reads POSIX tags, with their encoding and modifier dropped", () => {
    expect(toLocale("en_US")).toBe("en-US")
    expect(toLocale("en-US@posix")).toBe("en-US")
    expect(toLocale("de_DE.UTF-8@euro")).toBe("de-DE")
  })

  test("gives undefined for a tag Intl rejects, or none", () => {
    expect(toLocale("not a locale!")).toBeUndefined()
    expect(toLocale("")).toBeUndefined()
    expect(toLocale(null)).toBeUndefined()
  })

  test("a page with a POSIX lang formats numbers without throwing", () => {
    const lang = vi.fn(() => "en_US")
    vi.stubGlobal("document", {
      documentElement: { closest: () => ({ getAttribute: lang }) },
    })
    vi.stubGlobal("navigator", { language: "en-US@posix" })
    expect(pageLocale()).toBe("en-US")
    expect(new Intl.NumberFormat(pageLocale()).format(1234)).toBe("1,234")
  })

  test("falls back to the user's language when the page's is unusable", () => {
    vi.stubGlobal("document", {
      documentElement: { closest: () => ({ getAttribute: () => "??" }) },
    })
    vi.stubGlobal("navigator", { languages: ["fr_FR"], language: "fr" })
    expect(pageLocale()).toBe("fr-FR")
    expect(userLocale()).toBe("fr-FR")
  })

  test("is undefined on the server", () => {
    vi.stubGlobal("document", undefined)
    vi.stubGlobal("navigator", undefined)
    expect(pageLocale()).toBeUndefined()
    expect(userLocale()).toBeUndefined()
  })
})

// Intl's default language comes from the machine, so a German server would
// render markup an English page then hydrates with different text.
test("Slider and Number Input render the same on a German server as on an American one", async () => {
  const { outputFiles } = await build({
    stdin: {
      contents: `
        import { numberInput } from "./components/number-input/number-input"
        import { slider } from "./components/slider/slider"
        import { attrs } from "./foundation/kernel/part"
        const options = { id: "x", defaultValue: 1234.5, max: 5000, step: 0.5 }
        const thumb = slider(options).part("thumb-input", { id: "0", index: 0 })
        console.log(attrs(thumb)["aria-valuetext"], attrs(numberInput(options).part("control")).value)`,
      resolveDir: path.join(import.meta.dirname, "../src"),
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
  })
  const render = (LC_ALL: string) =>
    execFileSync(process.execPath, ["--input-type=module"], {
      input: outputFiles[0].text,
      env: { ...process.env, LC_ALL },
      encoding: "utf8",
    })
  expect(render("de_DE.UTF-8")).toBe("1,234.5 1,234.5\n")
  expect(render("en_US.UTF-8")).toBe("1,234.5 1,234.5\n")
})
