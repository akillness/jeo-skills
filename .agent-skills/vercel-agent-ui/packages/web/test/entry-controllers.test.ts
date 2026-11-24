// Each component entry exports its controllers, like the same entry in the
// other frameworks: `import { createDialogController } from "@ui-sdk/web/dialog"`.
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "vitest"

const react = path.resolve(import.meta.dirname, "../../react/src")
const entries = path.resolve(import.meta.dirname, "../src/entries")

const controllers = (source: string) =>
  [...source.matchAll(/^export \{([^}]*)\} from "@ui-sdk\/core[^"]*"/gm)]
    .flatMap(([, names]) => names.split(",").map((name) => name.trim()))
    .filter((name) => /^create\w*Controller$/.test(name))
    .sort()

const components = readdirSync(react)
  .map((file) => ({
    name: file.replace(/\.tsx?$/, ""),
    source: readFileSync(path.join(react, file), "utf8"),
  }))
  .filter(({ source }) => controllers(source).length > 0)

test.each(components)(
  "@ui-sdk/web/$name exports the controllers @ui-sdk/react/$name does",
  ({ name, source }) => {
    const entry = readFileSync(path.join(entries, `${name}.ts`), "utf8")
    expect(controllers(entry)).toEqual(controllers(source))
  }
)
