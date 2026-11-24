import { describe, expect, test } from "vitest"
import { createDismissal } from "../src/foundation/popups/dismissal"
import { popover } from "../src/components/popover/popover"
import { select } from "../src/components/select/select"
import { combobox } from "../src/components/combobox/combobox"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { datePicker } from "../src/components/date-picker/date-picker"
import { menu } from "./menu-parts"

const items = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
]

describe("createDismissal", () => {
  test("allows every close while dismissible", () => {
    const { allows } = createDismissal(() => ({}))
    for (const reason of [
      "escape-key",
      "outside-press",
      "focus-out",
      "close-press",
    ]) {
      expect(allows(reason)).toBe(true)
    }
  })

  test("refuses dismissals, and reports only the ones made on purpose", () => {
    const attempts: string[] = []
    const { allows } = createDismissal(() => ({
      dismissible: false,
      onDismissAttempt: ({ reason }: { reason: string }) =>
        attempts.push(reason),
    }))
    for (const reason of ["escape-key", "outside-press", "back", "swipe"]) {
      expect(allows(reason)).toBe(false)
    }
    expect(allows("focus-out")).toBe(false)
    expect(allows("window-blur")).toBe(false)
    expect(attempts).toEqual(["escape-key", "outside-press", "back", "swipe"])
  })

  test("never refuses triggers, Close parts or the controller", () => {
    const { allows } = createDismissal(() => ({ dismissible: false }))
    for (const reason of [
      "trigger-press",
      "close-press",
      "item-press",
      "imperative",
      "parent-close",
    ]) {
      expect(allows(reason)).toBe(true)
    }
  })

  test("a refusal rule refuses closes beyond dismissible, telling the app only of attempts", () => {
    const attempts: string[] = []
    const refused: string[] = []
    const { allows } = createDismissal(
      () => ({
        onDismissAttempt: ({ reason }: { reason: string }) =>
          attempts.push(reason),
      }),
      {
        refusal: (reason) =>
          reason === "outside-press"
            ? "attempt"
            : reason === "close-press"
              ? "silent"
              : undefined,
        refused: (reason) => refused.push(reason),
      }
    )
    expect(allows("outside-press")).toBe(false)
    expect(allows("close-press")).toBe(false)
    expect(allows("escape-key")).toBe(true)
    expect(attempts).toEqual(["outside-press"])
    expect(refused).toEqual(["outside-press"])
  })

  test("without a verdict from its rule, dismissible decides", () => {
    const { allows } = createDismissal(() => ({ dismissible: false }), {
      refusal: () => undefined,
    })
    expect(allows("escape-key")).toBe(false)
    expect(allows("trigger-press")).toBe(true)
  })

  test("a refused swipe on a sheet reports the attempt", () => {
    const attempts: string[] = []
    const { sheet } = createDismissal(() => ({
      dismissible: false,
      onDismissAttempt: ({ reason }: { reason: string }) =>
        attempts.push(reason),
    }))
    expect(sheet.dismissible()).toBe(false)
    sheet.onDismissAttempt()
    expect(attempts).toEqual(["swipe"])
  })
})

type Layer = {
  isOpen: () => boolean
  setOpen: (open: boolean, options?: { reason?: string }) => void
}

const layers: [string, (options: Record<string, unknown>) => Layer][] = [
  [
    "popover",
    (options) => popover({ id: "p", ...options }).api as unknown as Layer,
  ],
  ["menu", (options) => menu({ id: "m", ...options }).api as unknown as Layer],
  [
    "select",
    (options) => select({ id: "s", items, ...options }).api as unknown as Layer,
  ],
  [
    "combobox",
    (options) =>
      combobox({ id: "c", items, ...options }).api as unknown as Layer,
  ],
  [
    "autocomplete",
    (options) =>
      autocomplete({ id: "a", items, ...options }).api as unknown as Layer,
  ],
  [
    "date picker",
    (options) => datePicker({ id: "d", ...options }).api as unknown as Layer,
  ],
]

describe.each(layers)("%s dismissible", (_, create) => {
  test("false keeps it open on Escape and an outside press, and reports each try", () => {
    const attempts: string[] = []
    const changes: string[] = []
    const api = create({
      defaultOpen: true,
      dismissible: false,
      onDismissAttempt: ({ reason }: { reason: string }) =>
        attempts.push(reason),
      onOpenChange: (_open: boolean, { reason }: { reason: string }) =>
        changes.push(reason),
    })
    api.setOpen(false, { reason: "escape-key" })
    api.setOpen(false, { reason: "outside-press" })
    api.setOpen(false, { reason: "focus-out" })
    expect(api.isOpen()).toBe(true)
    expect(attempts).toEqual(["escape-key", "outside-press"])
    expect(changes).toEqual([])
    api.setOpen(false)
    expect(api.isOpen()).toBe(false)
    expect(changes).toEqual(["imperative"])
  })

  test("left out, dismissals close it as before", () => {
    const api = create({ defaultOpen: true })
    api.setOpen(false, { reason: "escape-key" })
    expect(api.isOpen()).toBe(false)
  })
})
