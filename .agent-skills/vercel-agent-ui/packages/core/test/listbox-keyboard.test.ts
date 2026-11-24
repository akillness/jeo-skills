import { afterEach, describe, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { select } from "../src/components/select/select"
import { listStep } from "../src/foundation/lists/listbox-keyboard"
import { setPlatform } from "../src/foundation/platform/platform"

const fruits = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
  { value: "date", label: "Date" },
]

type Modifiers = {
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

function key(name: string, modifiers: Modifiers = {}) {
  const event = {
    key: name,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    // Not the search field, which a headless select doesn't have.
    target: null,
    isComposing: false,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true
    },
    ...modifiers,
  }
  return event as unknown as KeyboardEvent
}

afterEach(() => setPlatform("other"))

describe("listStep", () => {
  const apple = { apple: true }

  test("arrows step by one item", () => {
    expect(listStep(key("ArrowDown"), apple)).toBe(1)
    expect(listStep(key("ArrowUp"), apple)).toBe(-1)
  })

  test("Cmd with an arrow goes to the last or first item", () => {
    expect(listStep(key("ArrowDown", { metaKey: true }), apple)).toBe("last")
    expect(listStep(key("ArrowUp", { metaKey: true }), apple)).toBe("first")
  })

  test("PageDown and PageUp step by a page", () => {
    expect(listStep(key("PageDown"), apple)).toBe(10)
    expect(listStep(key("PageUp"), apple)).toBe(-10)
  })

  test("Ctrl+N and Ctrl+P step by one item on Apple platforms only", () => {
    expect(listStep(key("n", { ctrlKey: true }), apple)).toBe(1)
    expect(listStep(key("p", { ctrlKey: true }), apple)).toBe(-1)
    expect(
      listStep(key("n", { ctrlKey: true }), { apple: false })
    ).toBeUndefined()
  })

  test("Ctrl+N with another modifier, and N alone, are no step", () => {
    expect(
      listStep(key("n", { ctrlKey: true, shiftKey: true }), apple)
    ).toBeUndefined()
    expect(
      listStep(key("n", { ctrlKey: true, altKey: true }), apple)
    ).toBeUndefined()
    expect(listStep(key("n"), apple)).toBeUndefined()
  })

  test("Home, End and other keys are no step", () => {
    expect(listStep(key("Home"), apple)).toBeUndefined()
    expect(listStep(key("End"), apple)).toBeUndefined()
    expect(listStep(key("Enter"), apple)).toBeUndefined()
  })
})

describe("select list keys", () => {
  const open = () => {
    const instance = select({ id: "s", items: fruits })
    instance.api.open()
    return instance
  }
  const highlighted = (instance: ReturnType<typeof select>) =>
    instance.get().highlighted

  test("Ctrl+N and Ctrl+P move the highlight on Apple platforms", () => {
    setPlatform("apple")
    const instance = open()
    const { onContentKeyDown } = instance.api.internal
    onContentKeyDown(key("n", { ctrlKey: true }))
    onContentKeyDown(key("n", { ctrlKey: true }))
    expect(highlighted(instance)).toBe("banana")
    onContentKeyDown(key("p", { ctrlKey: true }))
    expect(highlighted(instance)).toBe("apple")
  })

  test("Ctrl+N moves nothing on other platforms", () => {
    const instance = open()
    const event = key("n", { ctrlKey: true })
    instance.api.internal.onContentKeyDown(event)
    expect(highlighted(instance)).toBe(null)
    expect(event.defaultPrevented).toBe(false)
  })

  test("Cmd with an arrow highlights the last or first item", () => {
    const instance = open()
    const { onContentKeyDown } = instance.api.internal
    onContentKeyDown(key("ArrowDown", { metaKey: true }))
    expect(highlighted(instance)).toBe("date")
    onContentKeyDown(key("ArrowUp", { metaKey: true }))
    expect(highlighted(instance)).toBe("apple")
  })

  test("typing still searches by first letters", () => {
    setPlatform("apple")
    const instance = open()
    instance.api.internal.onContentKeyDown(key("c"))
    expect(highlighted(instance)).toBe("cherry")
  })
})

describe("combobox list keys", () => {
  const open = () => {
    const instance = combobox({ id: "c", items: fruits })
    instance.api.open()
    return instance
  }
  const highlighted = (instance: ReturnType<typeof combobox>) =>
    instance.get().highlighted

  test("Ctrl+N and Ctrl+P move the highlight on Apple platforms", () => {
    setPlatform("apple")
    const instance = open()
    const { onInputKeyDown } = instance.api.internal
    onInputKeyDown(key("n", { ctrlKey: true }))
    onInputKeyDown(key("n", { ctrlKey: true }))
    expect(highlighted(instance)).toBe("banana")
    onInputKeyDown(key("p", { ctrlKey: true }))
    expect(highlighted(instance)).toBe("apple")
  })

  test("Ctrl+N moves nothing on other platforms", () => {
    const instance = open()
    const event = key("n", { ctrlKey: true })
    instance.api.internal.onInputKeyDown(event)
    expect(highlighted(instance)).toBe(null)
    expect(event.defaultPrevented).toBe(false)
  })

  test("Ctrl+N opens a closed list on Apple platforms", () => {
    setPlatform("apple")
    const instance = combobox({ id: "c", items: fruits })
    instance.api.internal.onInputKeyDown(key("n", { ctrlKey: true }))
    expect(instance.api.isOpen()).toBe(true)
  })

  test("Cmd with an arrow highlights the last or first item", () => {
    const instance = open()
    const { onInputKeyDown } = instance.api.internal
    onInputKeyDown(key("ArrowDown", { metaKey: true }))
    expect(highlighted(instance)).toBe("date")
    onInputKeyDown(key("ArrowUp", { metaKey: true }))
    expect(highlighted(instance)).toBe("apple")
  })
})
