// @vitest-environment jsdom
import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"
import { afterEach, expect, test, vi } from "vitest"
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  shallowRef,
  type App,
  type VNode,
} from "vue"
import { createParts } from "../src/primitive"

const signal = definePrimitive({
  name: "signal",
  options: {},
  state: () => ({}),
  api: () => ({}),
  slots: (slot) => {
    const button = () =>
      slot<{
        value?: string
        onCommit?: (value: string) => void
        onValueChange?: (value: string, details: { canceled: boolean }) => void
      }>({
        props: {
          value: "string",
          onCommit: "callback",
          onValueChange: "callback",
        },
        attrs: (_state, { props }) => ({
          type: "button",
          "data-value": props.value,
        }),
        on: {
          click: (_event, { props }) => {
            props.onCommit?.(props.value ?? "initial")
            props.onValueChange?.("next", { canceled: false })
          },
        },
      })
    return { root: button(), child: button() }
  },
})
const { Root } = createParts(signal, { root: "button" })
const { Root: Scope, Child } = createParts(signal, { child: "button" })

let app: App | undefined
afterEach(() => {
  app?.unmount()
  document.body.replaceChildren()
})

function mount(render: () => VNode) {
  const element = document.body.appendChild(document.createElement("div"))
  app = createApp(defineComponent({ setup: () => render }))
  app.mount(element)
  return element.querySelector("button")!
}

for (const part of ["root", "child"] as const) {
  const render = (props: Record<string, unknown>) =>
    part === "root" ? h(Root, props) : h(Scope, null, () => h(Child, props))

  test(`a generated ${part} delivers callbacks once to the latest listener`, async () => {
    const initial = vi.fn()
    const replacement = vi.fn()
    const listener = shallowRef(initial)
    const button = mount(() => render({ onCommit: listener.value }))

    button.click()
    expect(initial).toHaveBeenCalledExactlyOnceWith("initial")
    listener.value = replacement
    await nextTick()
    button.click()
    expect(initial).toHaveBeenCalledTimes(1)
    expect(replacement).toHaveBeenCalledExactlyOnceWith("initial")

    button.dispatchEvent(new Event("commit"))
    expect(replacement).toHaveBeenCalledTimes(1)
  })

  test(`a generated ${part} emits one model update unless its change is canceled`, async () => {
    const value = ref("initial")
    const canceled = ref(false)
    const changed = vi.fn((_value: string, details: { canceled: boolean }) => {
      details.canceled = canceled.value
    })
    const updated = vi.fn((next: string) => {
      value.value = next
    })
    const button = mount(() =>
      render({
        value: value.value,
        onValueChange: changed,
        "onUpdate:value": updated,
      })
    )

    button.click()
    await nextTick()
    expect(changed).toHaveBeenCalledTimes(1)
    expect(updated).toHaveBeenCalledExactlyOnceWith("next")
    expect(button.dataset.value).toBe("next")

    value.value = "reset"
    canceled.value = true
    await nextTick()
    button.click()
    await nextTick()
    expect(changed).toHaveBeenCalledTimes(2)
    expect(updated).toHaveBeenCalledTimes(1)
    expect(button.dataset.value).toBe("reset")
  })
}

test("a generated root binds its slot value through plain v-model", async () => {
  const value = ref("initial")
  const updated = vi.fn((next: string) => {
    value.value = next
  })
  const button = mount(() =>
    h(Root, { modelValue: value.value, "onUpdate:modelValue": updated })
  )

  expect(button.dataset.value).toBe("initial")
  button.click()
  await nextTick()
  expect(updated).toHaveBeenCalledExactlyOnceWith("next")
  expect(button.dataset.value).toBe("next")
})

test("a generated root keeps its option model controlled and emits each update once", async () => {
  const level = definePrimitive({
    name: "level",
    options: { value: "string", onValueChange: "callback" },
    state: (_options: {
      value?: string
      onValueChange?: (value: string, details: ChangeDetails<"press">) => void
    }) => ({ value: "initial" }),
    sync: (options) =>
      options.value === undefined ? {} : { value: options.value },
    api: (context) => {
      const change = createChange(context)
      return { set: () => change("value", "next", { reason: "press" }) }
    },
    slots: (slot) => ({
      root: slot<{
        onValueChange?: (value: string, details: ChangeDetails<"press">) => void
      }>({
        props: { onValueChange: "callback" },
        attrs: (state) => ({ type: "button", "data-value": state.value }),
        on: { click: (_event, { api }) => api.set() },
      }),
    }),
  })
  const { Root: Level } = createParts(level, { root: "button" })
  const changed = vi.fn()
  const updated = vi.fn()
  const modelUpdated = vi.fn()
  const button = mount(() =>
    h(Level, {
      modelValue: "controlled",
      onValueChange: changed,
      "onUpdate:value": updated,
      "onUpdate:modelValue": modelUpdated,
    })
  )

  button.click()
  await nextTick()
  expect(changed).toHaveBeenCalledTimes(1)
  expect(updated).toHaveBeenCalledExactlyOnceWith("next")
  expect(modelUpdated).toHaveBeenCalledExactlyOnceWith("next")
  expect(button.dataset.value).toBe("controlled")
})
