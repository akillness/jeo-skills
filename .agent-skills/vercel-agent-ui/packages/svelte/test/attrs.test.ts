import type { Primitive, PrimitiveInstance } from "@ui-sdk/core"
import { applyAttrs } from "@ui-sdk/core/renderer"
import { accordion } from "@ui-sdk/core/accordion"
import { avatar } from "@ui-sdk/core/avatar"
import { button } from "@ui-sdk/core/button"
import { checkbox, checkboxGroup } from "@ui-sdk/core/checkbox"
import { collapsible } from "@ui-sdk/core/collapsible"
import { switchPrimitive } from "@ui-sdk/core/switch"
import { alertDialog, dialog } from "@ui-sdk/core/dialog"
import { field, fieldSet } from "@ui-sdk/core/field"
import { hoverCard } from "@ui-sdk/core/hover-card"
import { input, textarea } from "@ui-sdk/core/input"
import { listbox } from "@ui-sdk/core/listbox"
import { menu } from "@ui-sdk/core/menu"
import { pagination } from "@ui-sdk/core/pagination"
import { popover } from "@ui-sdk/core/popover"
import { meter } from "@ui-sdk/core/meter"
import { progress } from "@ui-sdk/core/progress"
import { radioGroup } from "@ui-sdk/core/radio"
import { select } from "@ui-sdk/core/select"
import { separator } from "@ui-sdk/core/separator"
import { slider } from "@ui-sdk/core/slider"
import { tabs } from "@ui-sdk/core/tabs"
import { toggle, toggleGroup } from "@ui-sdk/core/toggle"
import { tooltip } from "@ui-sdk/core/tooltip"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { flushSync, mount, unmount } from "svelte"
import { describe, expect, test } from "vitest"
import Spread from "./apps/spread.svelte"
import { attrs as partAttrs } from "@ui-sdk/core/renderer"

// Every slot of every primitive, in a few states, spread by the adapter onto
// a bare element and compared with `applyAttrs` on a plain one. The slot
// names come from the core's sources, so a new slot is covered as soon as
// it's written. One test covers booleans, `hidden="until-found"`, `style`
// strings and `value` for every component.

const coreSource = path.resolve(import.meta.dirname, "../../core/src")

// Every key a core file gives a slot: `trigger: slot<...>(`, `"form-input": hiddenInputPart(`.
const slotNames: string[] = [
  ...new Set(
    readdirSync(coreSource, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts"))
      .flatMap((file) => [
        ...readFileSync(path.join(coreSource, file), "utf8").matchAll(
          /^\s+"?([\w-]+)"?:\s*(?:slot|\w+Part)[<(]/gm
        ),
      ])
      .map(([, name]) => name)
  ),
]

// The states worth sampling: the options each instance takes.
const samples: [string, Primitive, Record<string, unknown>[]][] = [
  ["collapsible", collapsible, [{}, { defaultOpen: true }, { disabled: true }]],
  [
    "checkbox",
    checkbox,
    [
      {},
      { defaultChecked: true, required: true },
      { defaultChecked: "indeterminate" },
      { disabled: true, readOnly: true },
    ],
  ],
  [
    "checkbox group",
    checkboxGroup,
    [{ defaultValue: ["a"], allValues: ["a", "b"], name: "g" }],
  ],
  ["switch", switchPrimitive, [{}, { defaultChecked: true, name: "s" }]],
  [
    "radio group",
    radioGroup,
    [{ name: "r" }, { defaultValue: "a", required: true }],
  ],
  ["field", field, [{}, { invalid: true, disabled: true }]],
  ["field set", fieldSet, [{}, { disabled: true }]],
  ["popover", popover, [{}, { defaultOpen: true, modal: true }]],
  [
    "select",
    select,
    [
      {},
      { defaultOpen: true, defaultValue: "a", name: "fruit" },
      { multiple: true, defaultValue: ["a"] },
      { disabled: true },
    ],
  ],
  [
    "listbox",
    listbox,
    [
      { defaultValue: "a" },
      { multiple: true, defaultValue: ["a", "b"], name: "l" },
    ],
  ],
  ["menu", menu, [{}, { defaultOpen: true }]],
  ["dialog", dialog, [{}, { defaultOpen: true }]],
  ["alert dialog", alertDialog, [{ defaultOpen: true }]],
  ["tooltip", tooltip, [{}, { defaultOpen: true }]],
  ["hover card", hoverCard, [{ defaultOpen: true }]],
  [
    "tabs",
    tabs,
    [{ defaultValue: "a" }, { defaultValue: "a", orientation: "vertical" }],
  ],
  [
    "accordion",
    accordion,
    [{ defaultValue: ["a"] }, { multiple: true, disabled: true }],
  ],
  ["toggle", toggle, [{}, { defaultPressed: true, disabled: true }]],
  ["toggle group", toggleGroup, [{ defaultValue: ["a"] }]],
  [
    "slider",
    slider,
    [{ defaultValue: [50] }, { defaultValue: [20, 80], disabled: true }],
  ],
  ["progress", progress, [{ value: 40 }, { value: null }]],
  ["meter", meter, [{ value: 40 }, { value: 3, min: 1, max: 5 }]],
  ["avatar", avatar, [{}]],
  ["input", input, [{}, { disabled: true, required: true }]],
  ["textarea", textarea, [{}]],
  ["button", button, [{}, { disabled: true }]],
  ["separator", separator, [{}, { orientation: "vertical" }]],
  ["pagination", pagination, [{ count: 10, defaultPage: 3 }]],
]

// Props a keyed slot can take: an id and a value, and the item an indicator belongs to.
const keyed = { id: "a", value: "a", item: "a", itemKey: "a" }

// Inputs take `value` as a property, so the tag matters for form slots.
const tagFor = (slot: string) =>
  slot.includes("input") || slot === "control" ? "input" : "div"

// What an element shows: its attributes, with inputs' live value in place
// of the `value` attribute, since Svelte sets an input's value as a
// property, which the core's binding keeps current anyway. Styles compare as
// declarations, since jsdom serializes shorthands it was given one by one in
// another order.
function shown(el: HTMLElement) {
  const result: Record<string, string> = {}
  for (const { name, value } of el.attributes) {
    result[name] =
      name === "style"
        ? value.replace(/\s+/g, "").split(";").filter(Boolean).sort().join(";")
        : value
  }
  if (el instanceof HTMLInputElement) {
    delete result.value
    result.$value = el.value
  }
  return result
}

describe("attributes spread by the adapter match applyAttrs", () => {
  let covered = 0
  for (const [name, primitive, states] of samples) {
    test(`every slot of ${name}`, () => {
      for (const options of states) {
        const instance = primitive({ ...options, id: "t" }) as PrimitiveInstance
        for (const slot of slotNames) {
          let attrs
          try {
            attrs = partAttrs(instance.part(slot, keyed))
          } catch {
            // Not one of this primitive's slots.
            continue
          }
          const tag = tagFor(slot)
          const plain = document.createElement(tag)
          applyAttrs(plain, attrs)
          const target = document.createElement("div")
          document.body.append(target)
          const app = mount(Spread, {
            target,
            props: {
              handle: {
                instance,
                api: instance.api,
                state: instance.get(),
                controls: () => false,
              },
              name: slot,
              props: keyed,
              tag,
            },
          })
          flushSync()
          const spread = target.firstElementChild as HTMLElement
          expect(
            shown(spread),
            `${name} ${slot} with ${JSON.stringify(options)}`
          ).toEqual(shown(plain))
          unmount(app)
          target.remove()
          covered++
        }
      }
    })
  }

  test("the sources named slots, and the samples reached most of them", () => {
    expect(slotNames.length).toBeGreaterThan(60)
    expect(covered).toBeGreaterThan(100)
  })
})
