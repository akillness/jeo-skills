import { describe, expect, test, vi } from "vitest"
import { autocomplete } from "../src/components/autocomplete/autocomplete"

const fruits = [
  "Apple",
  "Apricot",
  "Banana",
  "Blueberry",
  { value: "cherry", label: "Cherry", disabled: true },
]

// The text field as the core reads it, with the caret at the end.
function field(value: string) {
  const input = {
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
    setSelectionRange(start: number, end: number) {
      input.selectionStart = start
      input.selectionEnd = end
    },
  }
  return input
}

function type(
  instance: ReturnType<typeof autocomplete>,
  text: string,
  inputType = "insertText"
) {
  const input = field(text)
  instance.api.internal.typed(
    input as unknown as HTMLInputElement,
    { inputType } as unknown as Event
  )
  return input
}

function key(name: string) {
  const event = {
    key: name,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true
    },
  }
  return event as unknown as KeyboardEvent
}

const keys = (instance: ReturnType<typeof autocomplete>) =>
  instance.api.internal.listbox.entries().map((entry) => entry.key)

describe("autocomplete headless", () => {
  test("Enter with nothing highlighted closes the suggestions as a commit of the text", () => {
    const onOpenChange = vi.fn()
    const instance = autocomplete({ id: "a", items: fruits, onOpenChange })
    type(instance, "ap")
    expect(instance.api.isOpen()).toBe(true)
    instance.api.internal.onInputKeyDown(key("Enter"))
    expect(instance.api.isOpen()).toBe(false)
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: "input-commit" })
    )
  })

  test("the text is the value, and typing filters and opens the suggestions", () => {
    const onValueChange = vi.fn()
    const instance = autocomplete({ id: "a", items: fruits, onValueChange })
    type(instance, "ap")
    expect(instance.api.getValue()).toBe("ap")
    expect(keys(instance)).toEqual(["Apple", "Apricot"])
    expect(instance.api.isOpen()).toBe(true)
    expect(onValueChange).toHaveBeenLastCalledWith(
      "ap",
      expect.objectContaining({ reason: "input-change" })
    )
  })

  test("inline completion fills in the first match, keeps the typed case and selects the rest", () => {
    const instance = autocomplete({
      id: "a",
      items: fruits,
      inlineComplete: true,
    })
    const input = type(instance, "ban")
    expect(input.value).toBe("banana")
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 6])
    expect(instance.api.getValue()).toBe("banana")
    expect(instance.get()).toMatchObject({
      highlighted: "Banana",
      query: "ban",
    })
  })

  test("deleting never completes again", () => {
    const instance = autocomplete({
      id: "a",
      items: fruits,
      inlineComplete: true,
    })
    type(instance, "ban")
    const input = type(instance, "ban", "deleteContentBackward")
    expect(input.value).toBe("ban")
    expect(instance.api.getValue()).toBe("ban")
  })

  test("disabled suggestions are never completed", () => {
    const instance = autocomplete({
      id: "a",
      items: fruits,
      inlineComplete: true,
    })
    expect(type(instance, "ch").value).toBe("ch")
  })

  test("Enter with nothing highlighted submits the text", () => {
    const onSubmit = vi.fn()
    const instance = autocomplete({ id: "a", items: fruits, onSubmit })
    type(instance, "kiwi")
    const enter = key("Enter")
    instance.api.internal.onInputKeyDown(enter)
    expect(onSubmit).toHaveBeenCalledWith(
      "kiwi",
      expect.objectContaining({ event: enter })
    )
    expect(instance.api.isOpen()).toBe(false)
    expect(enter.defaultPrevented).toBe(false)
  })

  test("Enter on a highlighted suggestion fills it in without submitting", () => {
    const onSubmit = vi.fn()
    const instance = autocomplete({
      id: "a",
      items: fruits,
      autoHighlight: true,
      onSubmit,
    })
    type(instance, "blu")
    const enter = key("Enter")
    instance.api.internal.onInputKeyDown(enter)
    expect(instance.api.getValue()).toBe("Blueberry")
    expect(onSubmit).not.toHaveBeenCalled()
    expect(enter.defaultPrevented).toBe(true)
  })

  test("with submitOnSelect, choosing a suggestion submits it", () => {
    const onSubmit = vi.fn()
    const instance = autocomplete({
      id: "a",
      items: fruits,
      submitOnSelect: true,
      onSubmit,
    })
    type(instance, "ban")
    instance.api.internal.press("Banana")
    expect(onSubmit).toHaveBeenCalledWith("Banana", expect.anything())
  })

  test("a pick says which suggestion it was, though two share a label", () => {
    const onValueChange = vi.fn()
    const instance = autocomplete({
      id: "a",
      items: [
        { value: "site-1", label: "Example" },
        { value: "site-2", label: "Example" },
      ],
      onValueChange,
    })
    type(instance, "ex")
    expect(onValueChange.mock.lastCall?.[1].item).toBeUndefined()
    instance.api.internal.press("site-2")
    expect(onValueChange).toHaveBeenLastCalledWith(
      "Example",
      expect.objectContaining({
        reason: "item-press",
        item: { value: "site-2", label: "Example" },
      })
    )
  })

  test("a value from outside also becomes what filters", () => {
    const instance = autocomplete({ id: "a", items: fruits })
    instance.api.setValue("blue")
    expect(keys(instance)).toEqual(["Blueberry"])
  })

  test("a value that onValueChange puts in place of the typed one is what filters", () => {
    const instance = autocomplete({
      id: "a",
      items: fruits,
      onValueChange: (value) => {
        if (value === "ap") {
          instance.api.setValue("ban")
        }
      },
    })
    type(instance, "ap")
    expect(instance.api.getValue()).toBe("ban")
    expect(instance.get().query).toBe("ban")
    expect(keys(instance)).toEqual(["Banana"])
  })

  test("items that drop the highlighted suggestion clear the highlight in the same change", () => {
    const instance = autocomplete({ id: "a", items: fruits, defaultOpen: true })
    instance.api.internal.onInputKeyDown(key("ArrowDown"))
    expect(instance.get().highlighted).toBe("Apple")
    const changes: (readonly string[])[] = []
    instance.subscribe((_liveOnly, _delivered, changed) =>
      changes.push(changed)
    )
    instance.setOptions({ id: "a", items: ["Banana"], defaultOpen: true })
    expect(instance.get().highlighted).toBeNull()
    expect(
      changes.filter((changed) => changed.includes("highlighted"))
    ).toEqual([expect.arrayContaining(["items", "highlighted"])])
  })

  test("Escape takes an inline completion back out", () => {
    const onValueChange = vi.fn()
    const instance = autocomplete({
      id: "a",
      items: fruits,
      inlineComplete: true,
      onValueChange,
    })
    type(instance, "apr")
    instance.api.internal.onInputKeyDown(key("Escape"))
    expect(instance.api.getValue()).toBe("apr")
    expect(onValueChange).toHaveBeenLastCalledWith(
      "apr",
      expect.objectContaining({ reason: "escape-key" })
    )
  })

  test("ArrowRight accepts an inline completion, so Escape keeps it", () => {
    const instance = autocomplete({
      id: "a",
      items: fruits,
      inlineComplete: true,
    })
    type(instance, "ba")
    expect(instance.api.getValue()).toBe("banana")
    instance.api.internal.onInputKeyDown(key("ArrowRight"))
    instance.api.internal.onInputKeyDown(key("Escape"))
    expect(instance.api.getValue()).toBe("banana")
    expect(keys(instance)).toEqual(["Banana"])
  })

  test("a canceled change keeps the text", () => {
    const instance = autocomplete({
      id: "a",
      items: fruits,
      defaultValue: "a",
      onValueChange: (_, details) => details.cancel(),
    })
    type(instance, "ab")
    expect(instance.api.getValue()).toBe("a")
    expect(keys(instance)).toEqual(["Apple", "Apricot", "Banana"])
  })
})
