import type { Primitive, PrimitiveInstance } from "@ui-sdk/core"
import { applyAttrs } from "@ui-sdk/core/renderer"
import { dynamic, render } from "@solidjs/web"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { flush } from "solid-js"
import { describe, expect, test } from "vitest"
import { usePrimitive } from "../src/use-primitive"
import { attrs as partAttrs } from "@ui-sdk/core/renderer"

// Every slot of every core primitive, rendered through the adapter's spread,
// must leave the element as core's own `applyAttrs` would: `""` booleans as
// present attributes, `hidden="until-found"` as given, styles declaration by
// declaration, and `checked` and `value` on inputs as their properties. One
// test over the whole core catches a property written where an attribute was
// meant, for every component at once.

const coreSrc = path.join(import.meta.dirname, "../../core/src")

// The primitives, found by what each core module exports.
const modules = import.meta.glob("../../core/src/**/*.ts", {
  eager: true,
}) as Record<string, Record<string, unknown>>
const primitives = Object.entries(modules).flatMap(([file, module]) =>
  Object.entries(module)
    .filter(
      ([, value]) =>
        typeof value === "function" && isPrimitive(value as Primitive)
    )
    .map(([name, value]) => ({
      name: `${path.basename(file, ".ts")}.${name}`,
      create: value as Primitive,
    }))
)

// Whether a core export is what `definePrimitive` returns: a factory that
// carries its options' schema, so no other export runs by mistake.
function isPrimitive(candidate: Primitive) {
  return (
    candidate.length === 1 &&
    typeof (candidate as { options?: unknown }).options === "object"
  )
}

// Slot names, read from every `name: slot(` in the core, since instances
// don't list theirs. A slot a primitive lacks throws on `attrs`, and is skipped.
const slotNames = [
  ...new Set(
    readdirSync(coreSrc, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts"))
      .flatMap((file) =>
        [
          ...readFileSync(path.join(coreSrc, file), "utf8").matchAll(
            /^\s+("?)([\w-]+)\1\s*:\s*slot[<(]/gm
          ),
        ].map((match) => match[2])
      )
  ),
]

// States worth sampling: options every primitive ignores when they're not its own.
const states: Record<string, unknown>[] = [
  {},
  { disabled: true, readOnly: true },
  {
    defaultOpen: true,
    defaultChecked: true,
    defaultValue: "a",
    defaultPressed: true,
    required: true,
    invalid: true,
  },
]

// Props a keyed slot may need.
const slotProps: Record<string, unknown>[] = [
  {},
  { id: "a", value: "a", item: "a" },
]

// What a slot's element shows: its attributes, plus the live checkedness and
// value of an input, which Solid and the DOM keep as properties.
function shown(el: HTMLElement) {
  const attrs = Object.fromEntries(
    [...el.attributes]
      .filter(
        ({ name }) => name !== "checked" && name !== "value" && name !== "style"
      )
      .map(({ name, value }) => [name, value])
      .sort(([a], [b]) => a.localeCompare(b))
  )
  const style = el
    .getAttribute("style")
    ?.split(";")
    .map((declaration) => declaration.replace(/\s+/g, ""))
    .filter(Boolean)
    .sort()
  return {
    ...attrs,
    style,
    ...(el instanceof HTMLInputElement
      ? { checked: el.checked, value: el.value }
      : {}),
  }
}

const tagFor = (attrs: Record<string, unknown>) =>
  typeof attrs.type === "string" && attrs.type !== "button" ? "input" : "div"

describe("attribute parity with applyAttrs", () => {
  test("finds the core's primitives and slots", () => {
    expect(primitives.length).toBeGreaterThan(30)
    expect(slotNames.length).toBeGreaterThan(60)
  })

  for (const { name, create } of primitives) {
    test(`${name} renders every slot as core writes it`, () => {
      let sampled = 0
      for (const options of states) {
        let instance: PrimitiveInstance
        // A sampled option a primitive can't take, like a string value for a token input.
        try {
          instance = create({ id: "t", ...options }) as PrimitiveInstance
        } catch {
          continue
        }
        for (const slot of slotNames) {
          for (const props of slotProps) {
            let attrs: Record<string, string | undefined>
            try {
              attrs = partAttrs(instance.part(slot, props))
            } catch {
              continue
            }
            sampled++
            const tag = tagFor(attrs)
            const expected = document.createElement(tag)
            applyAttrs(expected, attrs)
            // Outside the document, so the part never binds: this checks the
            // spread alone, and what core writes when it binds needs browser APIs.
            const host = document.createElement("div")
            const dispose = render(() => {
              const handle = usePrimitive(
                () => instance,
                () => options
              )
              const part = handle.slot(slot as never, () => props as never)
              const Tag = dynamic(() => tag)
              return <Tag {...part} />
            }, host)
            flush()
            const actual = host.firstElementChild as HTMLElement
            expect(
              shown(actual),
              `${slot} ${JSON.stringify(props)} with ${JSON.stringify(options)}`
            ).toEqual(shown(expected))
            dispose()
          }
        }
        instance.destroy()
      }
      expect(sampled).toBeGreaterThan(0)
    })
  }
})
